import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export interface Entity {
  id: string;
  name: string;
  type: string;
  created_at: number;
  updated_at: number;
}

export interface MemoryProfile {
  entity: Entity;
  facts: any[];
  relationships: { type: string; target: string; direction: 'from' | 'to' }[];
}

interface BrainConstellationProps {
  profiles: MemoryProfile[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}

const TYPE_COLORS: Record<string, number> = {
  person: 0x00f0ff,
  organization: 0x8cff00,
  project: 0xff008c,
  concept: 0xffae00,
  place: 0x00ff8c,
  event: 0xbc00ff,
  other: 0xffffff,
};

export const BrainConstellation: React.FC<BrainConstellationProps> = ({ profiles, onSelect, selectedId }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const profilesRef = useRef(profiles);
  const selectedIdRef = useRef(selectedId);
  const attributesRef = useRef<{
    sizes: THREE.BufferAttribute;
    colors: THREE.BufferAttribute;
    geometry: THREE.BufferGeometry;
  } | null>(null);

  // Sync refs and update attributes on prop changes
  useEffect(() => {
    profilesRef.current = profiles;
    selectedIdRef.current = selectedId;

    if (attributesRef.current) {
      const { sizes, colors } = attributesRef.current;
      const nodeCount = sizes.count;
      for (let i = 0; i < nodeCount; i++) {
        const profile = profiles[i];
        if (profile) {
          sizes.setX(i, profile.entity.id === selectedId ? 3.5 : 1.2);
          const type = profile.entity.type || 'other';
          const color = new THREE.Color(TYPE_COLORS[type] || TYPE_COLORS.other);
          colors.setXYZ(i, color.r, color.g, color.b);
        } else {
          sizes.setX(i, 0.15);
          colors.setXYZ(i, 0.1, 0.1, 0.3);
        }
      }
      sizes.needsUpdate = true;
      colors.needsUpdate = true;
    }
  }, [profiles, selectedId]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020205, 0.05);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 40;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // --- Glow Texture ---
    const createGlowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(canvas);
    };
    const glowTexture = createGlowTexture();

    // --- Geometry Construction ---
    const nodeCount = Math.max(profilesRef.current.length, 80);
    const positions = new Float32Array(nodeCount * 3);
    const colors = new Float32Array(nodeCount * 3);
    const sizes = new Float32Array(nodeCount);
    const phases = new Float32Array(nodeCount);

    const radius = 15;
    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;

      const profile = profilesRef.current[i];
      if (!profile) {
        colors[i * 3] = 0.1; colors[i * 3 + 1] = 0.1; colors[i * 3 + 2] = 0.3;
        sizes[i] = 0.15;
      } else {
        const type = profile.entity.type || 'other';
        const color = new THREE.Color(TYPE_COLORS[type] || TYPE_COLORS.other);
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
        sizes[i] = profile.entity.id === selectedIdRef.current ? 3.5 : 1.2;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colorsAttr = new THREE.BufferAttribute(colors, 3);
    const sizesAttr = new THREE.BufferAttribute(sizes, 1);
    geometry.setAttribute('color', colorsAttr);
    geometry.setAttribute('size', sizesAttr);
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    attributesRef.current = { sizes: sizesAttr, colors: colorsAttr, geometry };

    const material = new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: glowTexture }, time: { value: 0 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float phase;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float time;
        void main() {
          vColor = color;
          float pulse = 0.8 + 0.2 * sin(time * 2.0 + phase);
          vAlpha = pulse;
          vec3 pos = position;
          pos += 0.15 * sin(time * 0.7 + phase) * normalize(position);
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * pulse * (450.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, vAlpha) * tex;
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // --- Interaction ---
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 1.2; // Increased for better mobile hit detection
    const mouse = new THREE.Vector2();

    const updateMouse = (clientX: number, clientY: number) => {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handleAction = () => {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(points);
      if (hits.length > 0 && hits[0]) {
        const idx = hits[0].index;
        if (idx !== undefined && profilesRef.current[idx]) {
          onSelect(profilesRef.current[idx]!.entity.id);
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => updateMouse(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches[0]) updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      handleAction();
    };

    mountRef.current.addEventListener('mousemove', onMouseMove);
    mountRef.current.addEventListener('click', handleAction);
    mountRef.current.addEventListener('touchstart', onTouchStart, { passive: true });

    // --- Animation ---
    let frame: number;
    const clock = new THREE.Clock();
    const animate = () => {
      const dt = clock.getElapsedTime();
      frame = requestAnimationFrame(animate);
      material.uniforms.time!.value = dt;
      points.rotation.y = dt * 0.05;
      points.rotation.z = dt * 0.02;
      camera.position.x += (mouse.x * 2 - camera.position.x) * 0.05;
      camera.position.y += (mouse.y * 2 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      mountRef.current?.removeEventListener('mousemove', onMouseMove);
      mountRef.current?.removeEventListener('click', handleAction);
      mountRef.current?.removeEventListener('touchstart', onTouchStart);
      cancelAnimationFrame(frame);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [profiles.length]); // Only re-init if count changes significantly

  return (
    <div 
      ref={mountRef} 
      className="brain-constellation"
      style={{ 
        width: '100%', 
        height: '100%', 
        cursor: 'crosshair',
        background: 'radial-gradient(circle at center, #020210 0%, #000000 100%)'
      }} 
    />
  );
};
