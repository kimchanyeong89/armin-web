import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

interface LineGlobeProps {
    exhibitions?: Exhibition[];
    onSelectExhibition?: (ex: Exhibition | null) => void;
    panOffset?: number; // horizontal offset in pixels when detail panel is open
}

const LineGlobe: React.FC<LineGlobeProps> = ({ exhibitions = [], onSelectExhibition, panOffset = 0 }) => {
    // Cluster mode toggle: true = cluster mode, false = individual pins mode
    const [clusterMode, setClusterMode] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // panOffset is reserved for future use (detail panel offset)
    void panOffset;

    // State refs for animation loop (avoid re-renders)
    const rotationRef = useRef({ x: 0, y: 20 });
    const scaleRef = useRef(1.0);
    const velocityRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const animatingRef = useRef(false);

    // Data refs
    const countriesRef = useRef<any[]>([]);
    const selectedCountryRef = useRef<any>(null);

    // Constants
    const MIN_ZOOM = 0.8;
    const MAX_ZOOM = 20;
    const INERTIA_DECAY = 0.95;
    const INERTIA_THRESHOLD = 0.01;

    // Canvas size cache
    const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });

    // Performance stats for on-screen display (using ref to avoid re-renders)
    const perfStatsRef = useRef({ fps: 0, frameTime: 0, lastFrameTime: 0, frameCount: 0 });
    const perfOverlayRef = useRef<HTMLDivElement>(null);

    // Cluster threshold - exhibitions closer than this are grouped
    const CLUSTER_DISTANCE = 50; // pixels

    // Stable key generator for deduping/spider prevention
    const getExKey = (ex: any, idx: number = 0) => {
        if (!ex) return `missing-${idx}`;
        return (
            ex.id ||
            ex.slug ||
            ex.name ||
            ex.title ||
            `fallback-${idx}-${Math.round((ex.longitude || 0) * 1e4)}-${Math.round((ex.latitude || 0) * 1e4)}`
        );
    };

    // Store current clusters for click detection
    const clustersRef = useRef<{ x: number, y: number, items: any[], centerLon: number, centerLat: number }[]>([]);

    // Store expanded cluster exhibitions (with their geo coords for re-projection)
    const expandedExhibitionsRef = useRef<any[]>([]);
    const expandedCenterRef = useRef<{ lon: number, lat: number } | null>(null);

    // Chaikin smoothing algorithm - makes polygon edges curved
    const chaikinSmooth = (coords: number[][], iterations: number = 2): number[][] => {
        if (coords.length < 3) return coords;

        let result = coords;
        for (let iter = 0; iter < iterations; iter++) {
            const smoothed: number[][] = [];
            for (let i = 0; i < result.length; i++) {
                const p0 = result[i];
                const p1 = result[(i + 1) % result.length];

                // Q point at 1/4
                const q: number[] = [
                    0.75 * p0[0] + 0.25 * p1[0],
                    0.75 * p0[1] + 0.25 * p1[1]
                ];
                // R point at 3/4
                const r: number[] = [
                    0.25 * p0[0] + 0.75 * p1[0],
                    0.25 * p0[1] + 0.75 * p1[1]
                ];

                smoothed.push(q, r);
            }
            result = smoothed;
        }
        return result;
    };

    // Apply smoothing to a geometry
    const smoothGeometry = (geometry: any): any => {
        if (!geometry) return geometry;

        if (geometry.type === 'Polygon') {
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((ring: number[][]) => chaikinSmooth(ring, 1))
            };
        } else if (geometry.type === 'MultiPolygon') {
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((polygon: number[][][]) =>
                    polygon.map((ring: number[][]) => chaikinSmooth(ring, 1))
                )
            };
        }
        return geometry;
    };

    // Load simplified 110m country data (very light, ~100KB)
    useEffect(() => {
        const loadData = async () => {
            try {
                // Use 110m for best performance
                const res = await fetch('/geodata/countries-110m.json');
                if (!res.ok) return;

                const data = await res.json();
                let feats: any[] = [];

                if (data.type === 'FeatureCollection') {
                    feats = data.features || [];
                } else if (data.type === 'Topology' && data.objects) {
                    const keys = Object.keys(data.objects);
                    const pick = keys.find(k => k.toLowerCase().includes('countries')) || keys[0];
                    const fc: any = topojson.feature(data, data.objects[pick]);
                    feats = fc.features || [];
                }

                // Pre-compute centroids and smooth geometry
                feats.forEach((f: any) => {
                    try { f._centroid = d3.geoCentroid(f); } catch { }
                    // Apply Chaikin smoothing for curved edges
                    try { f.geometry = smoothGeometry(f.geometry); } catch { }
                });

                countriesRef.current = feats;
                console.log('[LineGlobe] Loaded 110m countries:', feats.length);
                renderFrame();
            } catch (e) {
                console.error('Failed to load geo data', e);
            }
        };
        loadData();
    }, []);

    // Build projection (lower precision for performance)
    const getProjection = useCallback(() => {
        const { width, height } = canvasSizeRef.current;
        const w = width || window.innerWidth;
        const h = height || window.innerHeight;
        return d3.geoOrthographic()
            .scale(scaleRef.current * 0.45 * Math.min(w, h))
            .translate([w / 2, h / 2])
            .rotate([rotationRef.current.x, -rotationRef.current.y])
            .precision(1); // Lower precision = faster rendering
    }, []);

    // Log data health
    useEffect(() => {
        console.log(`[LineGlobe] Received ${exhibitions?.length} exhibitions`);
        const invalid = exhibitions.filter(e => typeof e.latitude !== 'number' || typeof e.longitude !== 'number');
        if (invalid.length > 0) {
            console.warn('[LineGlobe] Invalid coordinates found:', invalid.length);
        }
    }, [exhibitions]);

    // Render frame - optimized
    const renderFrame = useCallback(() => {
        const t0 = performance.now(); // Start timing

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Use cached size if available
        let { width, height, dpr } = canvasSizeRef.current;

        // Setup canvas size only if changed
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;
        const newDpr = Math.min(2, window.devicePixelRatio || 1);

        if (width !== newWidth || height !== newHeight) {
            canvas.width = Math.round(newWidth * newDpr);
            canvas.height = Math.round(newHeight * newDpr);
            canvas.style.width = newWidth + 'px';
            canvas.style.height = newHeight + 'px';
            canvasSizeRef.current = { width: newWidth, height: newHeight, dpr: newDpr };
            width = newWidth;
            height = newHeight;
            dpr = newDpr;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        // Clear
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const projection = getProjection();
        const path = d3.geoPath().projection(projection).context(ctx);

        // Globe outline
        ctx.beginPath();
        path({ type: 'Sphere' });
        ctx.fillStyle = '#fafafa';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Graticule (subtle)
        const graticule = d3.geoGraticule10();
        ctx.beginPath();
        path(graticule);
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Draw country borders - smoothed curved edges
        const countries = countriesRef.current;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        countries.forEach((feature: any) => {
            ctx.beginPath();
            path(feature);
            ctx.stroke();
        });
        const t2 = performance.now();

        // Update performance stats (direct DOM update, no React re-render)
        perfStatsRef.current.frameTime = t2 - t0;
        perfStatsRef.current.frameCount++;
        const now = performance.now();
        if (now - perfStatsRef.current.lastFrameTime > 500) {
            const elapsed = now - perfStatsRef.current.lastFrameTime;
            perfStatsRef.current.fps = Math.round(perfStatsRef.current.frameCount / (elapsed / 1000));
            perfStatsRef.current.lastFrameTime = now;
            perfStatsRef.current.frameCount = 0;
            // Direct DOM update
            if (perfOverlayRef.current) {
                const fps = perfStatsRef.current.fps;
                const ft = Math.round(perfStatsRef.current.frameTime * 10) / 10;
                perfOverlayRef.current.innerHTML = `<div>FPS: ${fps}</div><div>Frame: ${ft}ms</div>`;
                perfOverlayRef.current.style.color = fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#ef4444';
            }
        }

        // Exhibition markers with clustering
        const validExhibitions = exhibitions.filter(ex =>
            typeof ex.latitude === 'number' && typeof ex.longitude === 'number'
        );

        // Identify currently expanded exhibitions to exclude them from clustering (prevent nested clustering)
        const expandedIds = new Set(
            expandedExhibitionsRef.current.map((ex, i) => (ex as any)._key || getExKey(ex, i))
        );

        // Project all exhibitions and check visibility
        const projected: { ex: typeof validExhibitions[0], x: number, y: number, visible: boolean }[] = [];
        const rot = projection.rotate();
        const deg2rad = Math.PI / 180;
        const toVec = (lon: number, lat: number) => {
            const lam = lon * deg2rad;
            const phi = lat * deg2rad;
            return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
        };
        const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const centerVec = toVec(-rot[0], -rot[1]);

        validExhibitions.forEach((ex, i) => {
            const id = getExKey(ex, i);

            // SKIP expanded items - they are drawn separately as pins
            if (expandedIds.has(id)) return;

            const coords = projection([ex.longitude, ex.latitude]);
            if (!coords) return;

            // Determine hemisphere using a dot product between the point and the current center vector
            const visible = dot(toVec(ex.longitude, ex.latitude), centerVec) >= 0;

            projected.push({ ex, x: coords[0], y: coords[1], visible });
        });

        console.log(`[LineGlobe] Render stats: Valid: ${validExhibitions.length}, Expanded: ${expandedExhibitionsRef.current.length}, Projected (non-expanded): ${projected.length}`);

        // Cluster nearby exhibitions (only in cluster mode)
        const visibleProjected = projected.filter(p => p.visible);
        const clusters: { x: number, y: number, items: typeof visibleProjected, centerLon: number, centerLat: number }[] = [];
        const used = new Set<number>();

        if (clusterMode) {
            // Adjust cluster distance based on zoom
            const clusterDist = CLUSTER_DISTANCE / scaleRef.current;

            visibleProjected.forEach((p, i) => {
                if (used.has(i)) return;

                const cluster = { x: p.x, y: p.y, items: [p] };
                used.add(i);

                // Find nearby exhibitions
                visibleProjected.forEach((p2, j) => {
                    if (used.has(j)) return;
                    const dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
                    if (dist < clusterDist) {
                        cluster.items.push(p2);
                        used.add(j);
                    }
                });

                // Recalculate cluster center and store geo coords
                const centerLon = cluster.items.reduce((s, i) => s + i.ex.longitude, 0) / cluster.items.length;
                const centerLat = cluster.items.reduce((s, i) => s + i.ex.latitude, 0) / cluster.items.length;
                if (cluster.items.length > 1) {
                    cluster.x = cluster.items.reduce((s, i) => s + i.x, 0) / cluster.items.length;
                    cluster.y = cluster.items.reduce((s, i) => s + i.y, 0) / cluster.items.length;
                }
                clusters.push({ ...cluster, centerLon, centerLat });
            });
        } else {
            // Individual pin mode - each exhibition is its own "cluster" of 1
            visibleProjected.forEach((p) => {
                clusters.push({
                    x: p.x,
                    y: p.y,
                    items: [p],
                    centerLon: p.ex.longitude,
                    centerLat: p.ex.latitude
                });
            });
        }

        // Store clusters for click detection
        clustersRef.current = clusters;

        // Draw clusters/pins - original D3GeoGlobeSimplified style
        clusters.forEach(cluster => {
            // NO proximity check needed here anymore because expanded items are already excluded!

            if (cluster.items.length === 1) {
                // Single pin - dark square with label
                const size = 8;
                ctx.fillStyle = '#111827';
                ctx.fillRect(cluster.x - size / 2, cluster.y - size / 2, size, size);
                ctx.strokeStyle = '#E5E7EB';
                ctx.lineWidth = 1;
                ctx.strokeRect(cluster.x - size / 2, cluster.y - size / 2, size, size);

                // Label
                const name = cluster.items[0].ex?.name || '';
                ctx.fillStyle = '#333';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                // White stroke for readability
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeText(name.substring(0, 15).toUpperCase(), cluster.x + 10, cluster.y);
                ctx.fillText(name.substring(0, 15).toUpperCase(), cluster.x + 10, cluster.y);
            } else {
                // Cluster - dark rounded rectangle with count
                const size = Math.max(22, 14 + Math.log2(cluster.items.length) * 4);
                const radius = 6;

                // Rounded rectangle
                ctx.beginPath();
                ctx.roundRect(cluster.x - size / 2, cluster.y - size / 2, size, size, radius);
                ctx.fillStyle = '#111827';
                ctx.fill();
                ctx.strokeStyle = '#E5E7EB';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Count text
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(10, 9 + Math.log2(cluster.items.length) * 1.1)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(cluster.items.length), cluster.x, cluster.y);
            }
        });

        // Draw expanded cluster pins (persist during drag/rotate) with left/right spider layout
        if (expandedCenterRef.current && expandedExhibitionsRef.current.length > 0) {
            const centerCoords = projection([expandedCenterRef.current.lon, expandedCenterRef.current.lat]);
            if (centerCoords) {
                const rot = projection.rotate();
                const deg2rad = Math.PI / 180;
                const toVec = (lon: number, lat: number) => {
                    const lam = lon * deg2rad;
                    const phi = lat * deg2rad;
                    return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
                };
                const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
                const centerVec = toVec(-rot[0], -rot[1]);

                // Only draw when the cluster center faces the viewer
                if (dot(toVec(expandedCenterRef.current.lon, expandedCenterRef.current.lat), centerVec) >= 0) {
                    const cx = centerCoords[0];
                    const cy = centerCoords[1];

                    // Anchor dot at the original cluster position
                    ctx.beginPath();
                    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#111827';
                    ctx.fill();
                    ctx.strokeStyle = '#E5E7EB';
                    ctx.lineWidth = 1.4;
                    ctx.stroke();

                    const items = [...expandedExhibitionsRef.current].sort((a, b) => {
                        return String(a?.name || a?.title || '').localeCompare(String(b?.name || b?.title || ''));
                    });

                    // Layout all items in a single column on the right side
                    const MIN_SPACING = 24; // Increased spacing for better readability
                    const COL_OFFSET = 100; // Offset from center to the right

                    const placed = items.map((ex, idx) => {
                        const y = (idx - (items.length - 1) / 2) * MIN_SPACING;
                        const x = cx + COL_OFFSET;
                        return { ex, x, y: cy + y, side: 'right' as const };
                    });

                    placed.forEach(({ ex, x: pinX, y: pinY }) => {
                        // Connecting line to original position
                        ctx.strokeStyle = 'rgba(31, 41, 55, 0.6)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(pinX, pinY);
                        ctx.stroke();

                        // Pin square at displaced position
                        const size = 8;
                        ctx.fillStyle = '#111827';
                        ctx.fillRect(pinX - size / 2, pinY - size / 2, size, size);
                        ctx.strokeStyle = '#E5E7EB';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(pinX - size / 2, pinY - size / 2, size, size);

                        // Label - right side, left aligned
                        const name = ex?.name || ex?.title || '';
                        ctx.fillStyle = '#333';
                        ctx.font = 'bold 10px sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 2.5;
                        const labelX = pinX + 12;
                        const label = name.substring(0, 28).toUpperCase();
                        ctx.strokeText(label, labelX, pinY);
                        ctx.fillText(label, labelX, pinY);
                    });
                }
            }
        }
    }, [exhibitions, getProjection, clusterMode]);

    // Re-render when cluster mode changes
    useEffect(() => {
        renderFrame();
    }, [clusterMode, renderFrame]);

    // Inertia animation loop
    const animateInertia = useCallback(() => {
        if (isDraggingRef.current) return;

        const vx = velocityRef.current.x;
        const vy = velocityRef.current.y;

        if (Math.abs(vx) < INERTIA_THRESHOLD && Math.abs(vy) < INERTIA_THRESHOLD) {
            velocityRef.current = { x: 0, y: 0 };
            return;
        }

        // Apply velocity
        rotationRef.current = {
            x: rotationRef.current.x + vx,
            y: Math.max(-85, Math.min(85, rotationRef.current.y + vy))
        };

        // Decay
        velocityRef.current = {
            x: vx * INERTIA_DECAY,
            y: vy * INERTIA_DECAY
        };

        renderFrame();
        requestAnimationFrame(animateInertia);
    }, [renderFrame]);

    // Fly-to animation
    const flyTo = useCallback((targetX: number, targetY: number, targetScale: number, duration = 1200) => {
        if (animatingRef.current) return;
        animatingRef.current = true;

        const startX = rotationRef.current.x;
        const startY = rotationRef.current.y;
        const startScale = scaleRef.current;

        // Shortest path for longitude
        let dx = targetX - startX;
        while (dx > 180) dx -= 360;
        while (dx < -180) dx += 360;
        const dy = targetY - startY;
        const ds = targetScale - startScale;

        const t0 = performance.now();
        const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const step = (now: number) => {
            const t = Math.min(1, (now - t0) / duration);
            const e = ease(t);

            rotationRef.current = {
                x: startX + dx * e,
                y: startY + dy * e
            };
            scaleRef.current = startScale + ds * e;

            renderFrame();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingRef.current = false;
            }
        };

        requestAnimationFrame(step);
    }, [renderFrame]);

    // Mouse/touch interactions
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let lastTime = 0;
        let totalMoved = 0;

        const handleMouseDown = (e: MouseEvent) => {
            if (animatingRef.current) return;
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            totalMoved = 0;
            velocityRef.current = { x: 0, y: 0 };
            lastTime = performance.now();
            canvas.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;

            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            const now = performance.now();
            const dt = Math.max(1, now - lastTime);

            // Sensitivity based on zoom level
            const sensitivity = 0.3 / Math.pow(scaleRef.current, 0.5);

            rotationRef.current = {
                x: rotationRef.current.x + dx * sensitivity,
                y: Math.max(-85, Math.min(85, rotationRef.current.y + dy * sensitivity))
            };

            // Track velocity for inertia
            velocityRef.current = {
                x: (dx * sensitivity) * (16 / dt),
                y: (dy * sensitivity) * (16 / dt)
            };

            // Accumulate total movement
            totalMoved += Math.abs(dx) + Math.abs(dy);

            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            lastTime = now;

            renderFrame();
        };

        const handleMouseUp = (_e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            canvas.style.cursor = 'grab';

            // Start inertia
            requestAnimationFrame(animateInertia);
        };

        const handleClick = (e: MouseEvent) => {
            if (animatingRef.current) return;

            // Check if it was a drag (total movement > threshold)
            if (totalMoved > 10) {
                totalMoved = 0; // Reset for next interaction
                return;
            }
            totalMoved = 0;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // First check if clicked on a cluster
            for (const cluster of clustersRef.current) {
                const dist = Math.sqrt((x - cluster.x) ** 2 + (y - cluster.y) ** 2);
                const radius = cluster.items.length === 1 ? 5 : Math.min(20, 10 + cluster.items.length * 2);

                if (dist < radius + 5) {
                    if (cluster.items.length === 1) {
                        // Single pin - select exhibition
                        const ex = cluster.items[0].ex;
                        if (ex && onSelectExhibition) {
                            onSelectExhibition(ex);
                        }
                    } else {
                        // Cluster click logic

                        // 1. Calculate geographic bounds of the cluster
                        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
                        cluster.items.forEach(item => {
                            minLon = Math.min(minLon, item.ex.longitude);
                            maxLon = Math.max(maxLon, item.ex.longitude);
                            minLat = Math.min(minLat, item.ex.latitude);
                            maxLat = Math.max(maxLat, item.ex.latitude);
                        });

                        const lonSpan = maxLon - minLon;
                        const latSpan = maxLat - minLat;
                        const maxSpan = Math.max(lonSpan, latSpan);

                        // Threshold for "tight" cluster (approx 5km or less)
                        // If items are spread out more than this, we just zoom in.
                        const TIGHT_CLUSTER_THRESHOLD = 0.05;

                        console.log(`[LineGlobe] Clicked cluster. Span: ${maxSpan.toFixed(4)}. Threshold: ${TIGHT_CLUSTER_THRESHOLD}`);

                        if (maxSpan > TIGHT_CLUSTER_THRESHOLD) {
                            console.log('[LineGlobe] Action: ZOOM');
                            // --- CASE A: Spread out cluster -> ZOOM IN ---
                            // Determine zoom level to fit bounds
                            // Formula approximation: 360 / span -> somewhat tight fit
                            // We want some padding, so maybe 180 / span or capped at a reasonable max
                            const targetScale = Math.min(MAX_ZOOM, Math.max(scaleRef.current * 1.5, 90 / (maxSpan + 0.1)));

                            // Fly to center of bounds
                            flyTo(-(minLon + maxLon) / 2, (minLat + maxLat) / 2, targetScale);

                            // Ensure we do NOT treat this as an expanded vertical list
                            expandedCenterRef.current = null;
                            expandedExhibitionsRef.current = [];
                        } else {
                            console.log('[LineGlobe] Action: SPIDERIFY');
                            // --- CASE B: Tight cluster -> SPIDERIFY (Vertical List) ---
                            const isCurrentlyExpanded = expandedCenterRef.current &&
                                Math.abs(cluster.centerLon - expandedCenterRef.current.lon) < 0.01 &&
                                Math.abs(cluster.centerLat - expandedCenterRef.current.lat) < 0.01;

                            if (isCurrentlyExpanded) {
                                // Collapse
                                expandedCenterRef.current = null;
                                expandedExhibitionsRef.current = [];
                            } else {
                                // Expand - store exhibitions and stay/zoom to center
                                expandedCenterRef.current = { lon: cluster.centerLon, lat: cluster.centerLat };
                                expandedExhibitionsRef.current = cluster.items.map((item, idx) => ({
                                    ...(item.ex as any),
                                    _key: getExKey(item.ex, idx)
                                }));
                                // Smooth zoom to cluster if needed, but not too close to lose context
                                flyTo(-cluster.centerLon, cluster.centerLat, Math.max(scaleRef.current, 5));
                            }
                        }
                        renderFrame();
                    }
                    return;
                }
            }

            // Clear expanded cluster when clicking elsewhere
            if (expandedCenterRef.current) {
                expandedCenterRef.current = null;
                expandedExhibitionsRef.current = [];
                renderFrame();
            }

            const projection = getProjection();
            const inv = (projection as any).invert;
            if (!inv) return;

            const coords = inv([x, y]);
            if (!coords) return;

            // Find clicked country
            const countries = countriesRef.current;
            let clicked: any = null;

            for (const feat of countries) {
                if (d3.geoContains(feat, coords)) {
                    clicked = feat;
                    break;
                }
            }

            if (clicked) {
                selectedCountryRef.current = clicked;

                // Fly to country center
                const centroid = clicked._centroid || d3.geoCentroid(clicked);
                if (centroid) {
                    const bounds = d3.geoBounds(clicked);
                    const lonSpan = Math.abs(bounds[1][0] - bounds[0][0]);
                    const latSpan = Math.abs(bounds[1][1] - bounds[0][1]);
                    const span = Math.max(lonSpan, latSpan);
                    const targetScale = Math.max(2, Math.min(10, 180 / span));

                    flyTo(-centroid[0], centroid[1], targetScale);
                }

                renderFrame();
            } else {
                selectedCountryRef.current = null;
                renderFrame();
            }
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (animatingRef.current) return;

            const delta = -e.deltaY * 0.001;
            scaleRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleRef.current * (1 + delta)));
            renderFrame();
        };

        const handleResize = () => renderFrame();

        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('resize', handleResize);

        canvas.style.cursor = 'grab';

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('wheel', handleWheel);
            window.removeEventListener('resize', handleResize);
        };
    }, [renderFrame, getProjection, animateInertia, flyTo]);

    return (
        <>
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    touchAction: 'none'
                }}
            />
            {/* Cluster Mode Toggle */}
            <div
                style={{
                    position: 'absolute',
                    top: 70,
                    right: 16,
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'rgba(255, 255, 255, 0.95)',
                    padding: '8px 14px',
                    borderRadius: 24,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#374151',
                    userSelect: 'none'
                }}
            >
                <span style={{ opacity: clusterMode ? 0.5 : 1, transition: 'opacity 0.2s' }}>All</span>
                <div
                    onClick={() => setClusterMode(!clusterMode)}
                    style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: clusterMode ? '#111827' : '#d1d5db',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.25s ease'
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: 2,
                            left: clusterMode ? 22 : 2,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'left 0.25s ease'
                        }}
                    />
                </div>
                <span style={{ opacity: clusterMode ? 1 : 0.5, transition: 'opacity 0.2s' }}>Cluster</span>
            </div>
        </>
    );
};

export default LineGlobe;
