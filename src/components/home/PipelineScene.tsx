'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Hero scene: a 3D pipe network with water particles flowing through it. One branch carries a leak
 * (amber, with a pulsing ring and escaping spray), which is the product story: detect it early.
 * Motion is decorative-but-motivated: flow = live monitoring, spray = detected anomaly.
 */

const BRANCHES: { pts: [number, number, number][]; leak?: boolean }[] = [
  { pts: [[-7.5, -0.5, 0], [-5, -0.3, 0.2], [-2.5, 0, 0]] },
  { pts: [[-2.5, 0, 0], [-0.6, 1.8, -1], [2, 2.6, -1.2], [4.8, 2.2, -0.5]] },
  { pts: [[-2.5, 0, 0], [0, 0.2, 0.8], [3, 0, 1], [6.2, 0.8, 0.5]] },
  { pts: [[-2.5, 0, 0], [-1, -2, 0.5], [1.5, -3, 1.2], [4.2, -3.3, 0.4]], leak: true },
  { pts: [[3, 0, 1], [4.6, -1.5, 2], [6.6, -2, 1.2]] },
];
const LEAK_U = 0.55;
const FLOW_VERT = `attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uPixel; uniform float uBoost;
void main(){ vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPixel * uBoost * (1.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FLOW_FRAG = `uniform vec3 uColor; varying float vAlpha;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`;

const cssColor = (el: Element, name: string, fallback: string) => new THREE.Color(getComputedStyle(el).getPropertyValue(name).trim() || fallback);

export default function PipelineScene() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      el.dataset.fallback = 'true';
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const world = new THREE.Group();
    scene.add(world);

    // ---------- materials (re-colored on theme change) ----------
    const pipeMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.38 });
    const leakMat = new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.4 });
    const nodeMat = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.3 });
    const flowMat = new THREE.ShaderMaterial({ vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color() }, uPixel: { value: 1 }, uBoost: { value: 1 } } });
    const sprayMat = new THREE.ShaderMaterial({ vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color() }, uPixel: { value: 1 }, uBoost: { value: 1 } } });
    const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const grid = new THREE.GridHelper(34, 34, 0x000000, 0x000000);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.18;
    grid.position.y = -5;
    world.add(grid);
    const key = new THREE.PointLight(0xffffff, 150, 0, 2); key.position.set(0, 6, 7);
    const fill = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(key, fill);

    // ---------- geometry ----------
    const curves = BRANCHES.map((b) => new THREE.CatmullRomCurve3(b.pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.15));
    BRANCHES.forEach((b, i) => {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curves[i], 140, 0.1, 12, false), b.leak ? leakMat : pipeMat);
      world.add(tube);
    });
    const junctions = [new THREE.Vector3(-2.5, 0, 0), new THREE.Vector3(3, 0, 1), new THREE.Vector3(4.8, 2.2, -0.5), new THREE.Vector3(6.2, 0.8, 0.5), new THREE.Vector3(4.2, -3.3, 0.4), new THREE.Vector3(6.6, -2, 1.2)];
    junctions.forEach((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), nodeMat); m.position.copy(p); world.add(m); });
    const plant = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), nodeMat); plant.position.set(-7.6, -0.5, 0); world.add(plant);

    // flowing particles
    const flow: { c: number; u: number; speed: number; off: THREE.Vector3; size: number }[] = [];
    curves.forEach((c, ci) => {
      const n = Math.round(c.getLength() * 16);
      for (let i = 0; i < n; i++) flow.push({ c: ci, u: Math.random(), speed: 0.045 + Math.random() * 0.05, off: new THREE.Vector3((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09), size: 0.045 + Math.random() * 0.045 });
    });
    const fPos = new Float32Array(flow.length * 3), fAlpha = new Float32Array(flow.length), fSize = new Float32Array(flow.length);
    flow.forEach((f, i) => { fSize[i] = f.size; });
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    fGeo.setAttribute('aAlpha', new THREE.BufferAttribute(fAlpha, 1));
    fGeo.setAttribute('aSize', new THREE.BufferAttribute(fSize, 1));
    const flowPts = new THREE.Points(fGeo, flowMat); flowPts.frustumCulled = false; world.add(flowPts);

    // leak spray
    const leakPoint = curves[3].getPointAt(LEAK_U);
    const N_SPRAY = 110;
    const spray = Array.from({ length: N_SPRAY }, () => ({ life: Math.random(), max: 0.9 + Math.random() * 0.8, v: new THREE.Vector3(), p: new THREE.Vector3() }));
    const respawn = (s: (typeof spray)[number]) => {
      s.life = 0; s.max = 0.9 + Math.random() * 0.8;
      s.p.copy(leakPoint);
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.1;
      s.v.set(Math.cos(a) * r * 0.6, 0.6 + Math.random() * 1.6, Math.sin(a) * r * 0.6);
    };
    spray.forEach((s) => { respawn(s); s.life = Math.random() * s.max; });
    const sPos = new Float32Array(N_SPRAY * 3), sAlpha = new Float32Array(N_SPRAY), sSize = new Float32Array(N_SPRAY).fill(0.075);
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1));
    sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    const sprayPts = new THREE.Points(sGeo, sprayMat); sprayPts.frustumCulled = false; world.add(sprayPts);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.38, 48), ringMat); ring.position.copy(leakPoint); world.add(ring);

    // ---------- theme ----------
    const applyTheme = () => {
      const dark = document.documentElement.dataset.theme !== 'light';
      const accent = cssColor(el, '--accent', '#4ab0d9');
      const warn = cssColor(el, '--warn', '#ec8b3c');
      const steel = new THREE.Color(dark ? '#5d7384' : '#6f8696');
      pipeMat.color.copy(steel); pipeMat.emissive.copy(accent).multiplyScalar(dark ? 0.12 : 0.02);
      leakMat.color.copy(warn).lerp(steel, 0.35); leakMat.emissive.copy(warn).multiplyScalar(0.25);
      nodeMat.color.copy(dark ? new THREE.Color('#9fb4c2') : new THREE.Color('#41596a')); nodeMat.emissive.copy(accent).multiplyScalar(dark ? 0.2 : 0);
      flowMat.uniforms.uColor.value.copy(accent); sprayMat.uniforms.uColor.value.copy(warn);
      const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      flowMat.blending = blend; sprayMat.blending = blend; flowMat.needsUpdate = true; sprayMat.needsUpdate = true;
      ringMat.color.copy(warn);
      const gc = new THREE.Color(dark ? '#4a6272' : '#8aa0ae');
      (grid.material as THREE.LineBasicMaterial).color.copy(gc);
      key.intensity = dark ? 150 : 90;
      flowMat.uniforms.uBoost.value = dark ? 1 : 2.1; sprayMat.uniforms.uBoost.value = dark ? 1 : 1.5;
    };
    applyTheme();
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---------- layout ----------
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { pointer.tx = (e.clientX / window.innerWidth) * 2 - 1; pointer.ty = (e.clientY / window.innerHeight) * 2 - 1; };
    window.addEventListener('pointermove', onMove, { passive: true });
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const narrow = camera.aspect < 0.95;
      camera.position.set(0, 3.2, narrow ? 31 : 21.5);
      camera.lookAt(0, 0, 0);
      world.position.set(narrow ? 0 : 3.1, narrow ? 2.4 : 0.4, 0);
      world.scale.setScalar(narrow ? 0.85 : 1);
      camera.updateProjectionMatrix();
      const px = renderer.getPixelRatio();
      flowMat.uniforms.uPixel.value = px * h * 1.374; sprayMat.uniforms.uPixel.value = px * h * 1.374;
    };
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(6, 0.016); });
    ro.observe(el);

    // ---------- frame ----------
    const tmp = new THREE.Vector3();
    function draw(t: number, dt: number) {
      pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
      world.rotation.y = -0.4 + Math.sin(t * 0.12) * 0.22 + pointer.x * 0.18;
      world.rotation.x = pointer.y * 0.07;
      for (let i = 0; i < flow.length; i++) {
        const f = flow[i];
        const u = (f.u + t * f.speed) % 1;
        curves[f.c].getPointAt(u, tmp);
        fPos[i * 3] = tmp.x + f.off.x; fPos[i * 3 + 1] = tmp.y + f.off.y; fPos[i * 3 + 2] = tmp.z + f.off.z;
        // downstream of the leak, flow thins out
        const thin = BRANCHES[f.c].leak && u > LEAK_U ? ((i % 3 === 0) ? 0.55 : 0) : 1;
        fAlpha[i] = thin * (0.55 + 0.45 * Math.sin(u * Math.PI));
      }
      (fGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (fGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
      for (let i = 0; i < N_SPRAY; i++) {
        const s = spray[i];
        s.life += dt; if (s.life > s.max) respawn(s);
        s.v.y -= 2.4 * dt; s.p.addScaledVector(s.v, dt);
        sPos[i * 3] = s.p.x; sPos[i * 3 + 1] = s.p.y; sPos[i * 3 + 2] = s.p.z;
        sAlpha[i] = Math.max(0, 1 - s.life / s.max) * 0.9;
      }
      (sGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (sGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
      const pulse = (t * 0.9) % 1;
      ring.scale.setScalar(1 + pulse * 1.6); ringMat.opacity = (1 - pulse) * 0.8;
      ring.quaternion.copy(camera.quaternion);
      renderer.render(scene, camera);
    }

    let raf = 0, last = performance.now(), visible = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      draw(now / 1000, dt);
    };
    resize();
    if (reduce) draw(6, 0.016); else raf = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="scene" aria-hidden="true" />;
}
