// @ts-nocheck - Legacy component, not actively used
import React, { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

interface TossGlobeProps {
    exhibitions?: Exhibition[];
    onSelectExhibition?: (ex: Exhibition | null) => void;
}

// Default Clay Shader
const clayVertexShader = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vDisplacement;

uniform sampler2D tHeight;
uniform float uDisplacementScale;
uniform float uDisplacementBias;

void main() {
    vUv = uv;
    // Calculate new position with displacement along normal
    // We strictly use the map height to push vertices out
    vec3 normal = normalize(normalMatrix * normal);
    vNormal = normal;
    
    // Displacement map lookup
    float h = texture2D(tHeight, uv).r;
    vDisplacement = h;
    
    // Calculate new position
    vec3 transformed = position + normal * (h * uDisplacementScale + uDisplacementBias);
    
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const clayFragmentShader = `
uniform vec3 uColorOcean;
uniform vec3 uColorLand;
uniform vec3 uLightPosition;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vDisplacement;

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(uLightPosition);
    
    // Soft diffuse
    float NdotL = dot(normal, lightDir);
    float diffuse = smoothstep(-0.2, 0.8, NdotL);
    
    // Rim lighting
    float rim = 1.0 - max(0.0, dot(viewDir, normal));
    rim = pow(rim, 3.0) * 0.5;
    
    // Color mixing based on displacement (height)
    // vDisplacement is 0 (ocean) to 1 (land)
    // We add a small transition so the 'beach' isn't too jagged
    float isLand = smoothstep(0.05, 0.15, vDisplacement);
    
    vec3 finalBaseColor = mix(uColorOcean, uColorLand, isLand);
    
    // Add shadow scaling for depth
    vec3 shadowColor = finalBaseColor * 0.6;
    vec3 highlightColor = finalBaseColor * 1.15;
    
    vec3 finalColor = mix(shadowColor, finalBaseColor, diffuse);
    finalColor = mix(finalColor, highlightColor, rim);
    
    // Ambient Occlusion sim based on height (darker in valleys/ocean)
    float ao = smoothstep(0.0, 0.4, vDisplacement) * 0.3 + 0.7;
    finalColor *= ao;

    // Matte finish (desaturate slightly)
    float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(vec3(gray), finalColor, 0.1);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const TossGlobe: React.FC<TossGlobeProps> = ({ exhibitions = [] }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const globeRef = useRef<THREE.Mesh | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const animationFrameRef = useRef<number>(0);

    // Rotation state
    const rotationRef = useRef({ x: 0, y: 0 });
    const targetRotationRef = useRef({ x: 0, y: 0 });
    const velocityRef = useRef({ x: 0.002, y: 0 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    const lightPosition = useMemo(() => new THREE.Vector3(5, 3, 5), []);

    // Generate Height Map Texture from GeoJSON
    const generateHeightMap = async (): Promise<THREE.Texture> => {
        const width = 2048;
        const height = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Fill background (Ocean - Black/Low)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Load data
        try {
            const urls = [
                '/atlas/ne_110m_admin_0_countries.geojson',
                '/geodata/countries-110m.json'
            ];

            let data: any = null;
            for (const url of urls) {
                try {
                    const r = await fetch(url);
                    if (r.ok) {
                        data = await r.json();
                        break;
                    }
                } catch (e) { }
            }

            if (data) {
                // If TopoJSON, convert to GeoJSON
                if (data.type === 'Topology') {
                    const keys = Object.keys(data.objects);
                    const key = keys.find(k => k.toLowerCase().includes('countries')) || keys[0];
                    data = topojson.feature(data, data.objects[key]);
                }

                const projection = d3.geoEquirectangular()
                    .scale(width / (2 * Math.PI))
                    .translate([width / 2, height / 2]);

                const path = d3.geoPath(projection, ctx);

                // 1. Draw Land Mass with Blur (Soft Volume)
                ctx.shadowColor = '#FFFFFF';
                ctx.shadowBlur = 15; // Soft edges for clay look
                ctx.fillStyle = '#FFFFFF';

                ctx.beginPath();
                path(data);
                ctx.fill();
                ctx.fill(); // Double fill for stronger center height

                // Reset shadow for sharp cuts
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';

                // 2. Draw Borders (Cuts/Grooves)
                // We draw black lines to cut into the white volume
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2; // Groove width
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                ctx.beginPath();
                path(data);
                ctx.stroke();
            }
        } catch (e) {
            console.error("Failed to render map", e);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#f0f5fa');
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = 3.5;
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Setup Globe
        const initGlobe = async () => {
            const heightMap = await generateHeightMap();

            // High segment count for displacement
            const geometry = new THREE.SphereGeometry(1, 512, 512);

            // Shader Material with displacement
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    tHeight: { value: heightMap },
                    uDisplacementScale: { value: 0.12 }, // Thickness of clay continents
                    uDisplacementBias: { value: 0.0 },
                    uColorOcean: { value: new THREE.Color('#4080d0') },
                    uColorLand: { value: new THREE.Color('#7de2c0') },
                    uLightPosition: { value: lightPosition },
                },
                vertexShader: clayVertexShader,
                fragmentShader: clayFragmentShader,
            });

            const globe = new THREE.Mesh(geometry, material);
            scene.add(globe);
            globeRef.current = globe;
        };
        initGlobe();

        // Clouds (Simple blobs)
        const createClouds = () => {
            const cloudsGroup = new THREE.Group();
            const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });

            const addCloud = (x: number, y: number, z: number, scale: number) => {
                const cloud = new THREE.Group();
                const tuftGeo = new THREE.SphereGeometry(1, 16, 16);

                // Random puffs
                const positions = [
                    { x: 0, y: 0, z: 0, s: 1 },
                    { x: 0.8, y: -0.1, z: 0.2, s: 0.75 },
                    { x: -0.8, y: 0.1, z: -0.2, s: 0.75 },
                    { x: 0.4, y: 0.8, z: 0, s: 0.6 },
                ];

                positions.forEach(pos => {
                    const tuft = new THREE.Mesh(tuftGeo, cloudMaterial);
                    tuft.position.set(pos.x * scale, pos.y * scale, pos.z * scale);
                    tuft.scale.setScalar(pos.s * scale);
                    cloud.add(tuft);
                });

                cloud.position.set(x, y, z);
                cloud.lookAt(0, 0, 0);
                cloudsGroup.add(cloud);
            };

            addCloud(1.4, 0.4, 0.4, 0.12);
            addCloud(-1.3, -0.3, 0.6, 0.1);
            addCloud(-0.5, 0.8, -1.0, 0.15);

            scene.add(cloudsGroup);
            return cloudsGroup;
        };
        const clouds = createClouds();

        // Pedestal
        const createPedestal = () => {
            const geo = new THREE.CylinderGeometry(0.6, 0.8, 0.1, 64);
            const mat = new THREE.MeshBasicMaterial({
                color: '#d0e0ff',
                transparent: true,
                opacity: 0.5
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = -1.4;
            scene.add(mesh);

            const ringGeo = new THREE.TorusGeometry(0.7, 0.02, 16, 100);
            const ringMat = new THREE.MeshBasicMaterial({ color: '#80b0ff' });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = -1.4;
            scene.add(ring);
        };
        createPedestal();


        // Animation
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);

            if (!isDraggingRef.current) {
                targetRotationRef.current.x += velocityRef.current.x;
                velocityRef.current.x *= 0.99; // Inertia
            }

            rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.1;
            rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.1;

            if (globeRef.current) {
                globeRef.current.rotation.y = rotationRef.current.x;
                globeRef.current.rotation.x = rotationRef.current.y;
            }
            if (clouds) {
                clouds.rotation.y += 0.0005;
            }

            renderer.render(scene, camera);
        };
        animate();

        // Handlers
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };

        const handleMouseDown = (e: MouseEvent) => {
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            targetRotationRef.current.x += dx * 0.005;
            targetRotationRef.current.y += dy * 0.005;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => isDraggingRef.current = false;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            camera.position.z = Math.max(2.0, Math.min(8.0, camera.position.z + e.deltaY * 0.002));
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('wheel', handleWheel);
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };

    }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', cursor: 'grab' }} />;
};

export default TossGlobe;
