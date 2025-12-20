import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

interface FastGlobeProps {
    exhibitions?: Exhibition[];
    onSelectExhibition?: (ex: Exhibition | null) => void;
}

const FastGlobe: React.FC<FastGlobeProps> = ({ exhibitions = [], onSelectExhibition }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>(0);

    // Data refs
    const countriesRef = useRef<any[]>([]);
    const pathCacheRef = useRef<Map<any, Path2D>>(new Map());

    // Rotation state (mutable for 60fps)
    const rotationRef = useRef({ x: 0, y: -20 });
    const targetRotationRef = useRef({ x: 0, y: -20 });
    const velocityRef = useRef({ x: 0.15, y: 0 }); // Auto-rotate
    const scaleRef = useRef(1);
    const targetScaleRef = useRef(1);

    // Interaction state
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const hoverCountryRef = useRef<any>(null);

    // Projection cache
    const projectionRef = useRef<d3.GeoProjection | null>(null);

    // Spring physics constants
    const SPRING_STIFFNESS = 0.12;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false })!;
        let width = window.innerWidth;
        let height = window.innerHeight;

        // Setup canvas size
        const setupCanvas = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Rebuild projection
            projectionRef.current = d3.geoOrthographic()
                .scale(scaleRef.current * 0.45 * Math.min(width, height))
                .translate([width / 2, height / 2])
                .rotate([rotationRef.current.x, rotationRef.current.y])
                .clipAngle(90);

            // Clear path cache on resize
            pathCacheRef.current.clear();
        };
        setupCanvas();

        // Load countries data
        const loadData = async () => {
            try {
                const urls = [
                    '/geodata/countries-110m.json',
                    '/atlas/countries-110m.json',
                ];

                let data: any = null;
                for (const url of urls) {
                    try {
                        const res = await fetch(url);
                        if (res.ok) {
                            data = await res.json();
                            break;
                        }
                    } catch { }
                }

                if (!data) return;

                let features: any[] = [];
                if (data.type === 'FeatureCollection') {
                    features = data.features || [];
                } else if (data.type === 'Topology' && data.objects) {
                    const keys = Object.keys(data.objects);
                    const key = keys.find(k => k.toLowerCase().includes('countries')) || keys[0];
                    const fc = topojson.feature(data, data.objects[key]) as any;
                    features = fc.features || [];
                }

                countriesRef.current = features;
            } catch (e) {
                console.error('Failed to load countries', e);
            }
        };
        loadData();

        // Main render function - optimized for 60fps
        const render = () => {
            const proj = projectionRef.current;
            if (!proj) return;

            // Update projection with current rotation/scale
            proj.scale(scaleRef.current * 0.45 * Math.min(width, height))
                .rotate([rotationRef.current.x, rotationRef.current.y]);

            // Clear
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, width, height);

            // Draw sphere
            const path = d3.geoPath(proj, ctx);
            ctx.beginPath();
            path({ type: 'Sphere' });
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw graticule (sparse for performance)
            const graticule = d3.geoGraticule().step([30, 30])();
            ctx.beginPath();
            path(graticule);
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Draw countries
            const countries = countriesRef.current;
            if (countries.length > 0) {
                ctx.lineWidth = 0.6;

                for (const feature of countries) {
                    const isHover = feature === hoverCountryRef.current;

                    ctx.beginPath();
                    path(feature);

                    if (isHover) {
                        ctx.fillStyle = '#e0f2fe';
                        ctx.fill();
                    }

                    ctx.strokeStyle = isHover ? '#0284c7' : '#94a3b8';
                    ctx.stroke();
                }
            }

            // Draw exhibition markers
            if (exhibitions.length > 0) {
                for (const ex of exhibitions) {
                    if (typeof ex.latitude !== 'number' || typeof ex.longitude !== 'number') continue;

                    const coords = proj([ex.longitude, ex.latitude]);
                    if (!coords) continue;

                    // Check if visible (front of globe)
                    const dist = d3.geoDistance(
                        [ex.longitude, ex.latitude],
                        [-rotationRef.current.x, -rotationRef.current.y]
                    );
                    if (dist > Math.PI / 2) continue;

                    // Draw marker
                    ctx.beginPath();
                    ctx.arc(coords[0], coords[1], 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        };

        // Animation loop with spring physics
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);

            // Auto-rotate when not dragging
            if (!isDraggingRef.current) {
                targetRotationRef.current.x += velocityRef.current.x;

                // Apply friction to velocity
                velocityRef.current.x *= 0.995;
                velocityRef.current.y *= 0.995;

                // Minimum auto-rotation
                if (Math.abs(velocityRef.current.x) < 0.05) {
                    velocityRef.current.x = 0.08;
                }
            }

            // Spring physics for smooth interpolation
            const dx = targetRotationRef.current.x - rotationRef.current.x;
            const dy = targetRotationRef.current.y - rotationRef.current.y;

            rotationRef.current.x += dx * SPRING_STIFFNESS;
            rotationRef.current.y += dy * SPRING_STIFFNESS;

            // Scale interpolation
            const ds = targetScaleRef.current - scaleRef.current;
            scaleRef.current += ds * SPRING_STIFFNESS;

            render();
        };
        animate();

        // Event handlers
        const handleResize = () => {
            setupCanvas();
        };

        const handleMouseDown = (e: MouseEvent) => {
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingRef.current) {
                const dx = e.clientX - lastMouseRef.current.x;
                const dy = e.clientY - lastMouseRef.current.y;

                // Update target rotation
                targetRotationRef.current.x += dx * 0.3;
                targetRotationRef.current.y -= dy * 0.3;

                // Clamp vertical rotation
                targetRotationRef.current.y = Math.max(-60, Math.min(60, targetRotationRef.current.y));

                // Store velocity for inertia
                velocityRef.current.x = dx * 0.15;
                velocityRef.current.y = dy * 0.15;

                lastMouseRef.current = { x: e.clientX, y: e.clientY };
            } else {
                // Hover detection
                const proj = projectionRef.current;
                if (!proj) return;

                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const coords = proj.invert?.([x, y]);

                if (coords) {
                    let found: any = null;
                    for (const feature of countriesRef.current) {
                        if (d3.geoContains(feature, coords)) {
                            found = feature;
                            break;
                        }
                    }

                    if (found !== hoverCountryRef.current) {
                        hoverCountryRef.current = found;
                        canvas.style.cursor = found ? 'pointer' : 'grab';
                    }
                }
            }
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            canvas.style.cursor = hoverCountryRef.current ? 'pointer' : 'grab';
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = -e.deltaY * 0.001;
            targetScaleRef.current = Math.max(0.5, Math.min(5, targetScaleRef.current + delta));
        };

        const handleClick = (e: MouseEvent) => {
            // Check if clicked on exhibition marker
            const proj = projectionRef.current;
            if (!proj) return;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            for (const ex of exhibitions) {
                if (typeof ex.latitude !== 'number' || typeof ex.longitude !== 'number') continue;

                const coords = proj([ex.longitude, ex.latitude]);
                if (!coords) continue;

                const dist = Math.hypot(coords[0] - x, coords[1] - y);
                if (dist < 10) {
                    onSelectExhibition?.(ex);
                    return;
                }
            }
        };

        // Touch handlers for mobile
        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                isDraggingRef.current = true;
                lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 1 && isDraggingRef.current) {
                e.preventDefault();
                const dx = e.touches[0].clientX - lastMouseRef.current.x;
                const dy = e.touches[0].clientY - lastMouseRef.current.y;

                targetRotationRef.current.x += dx * 0.3;
                targetRotationRef.current.y -= dy * 0.3;
                targetRotationRef.current.y = Math.max(-60, Math.min(60, targetRotationRef.current.y));

                velocityRef.current.x = dx * 0.15;
                lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const handleTouchEnd = () => {
            isDraggingRef.current = false;
        };

        // Attach events
        window.addEventListener('resize', handleResize);
        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
            window.removeEventListener('resize', handleResize);
            canvas.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('wheel', handleWheel);
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        };
    }, [exhibitions, onSelectExhibition]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                cursor: 'grab',
            }}
        />
    );
};

export default FastGlobe;
