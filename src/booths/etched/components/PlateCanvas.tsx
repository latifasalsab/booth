"use client";
/**
 * Three.js plate on a transparent canvas (renderer alpha: true). Silver rounded-rectangle plate, 4 chrome studs,
 * brushed + scratched roughness map, procedural gradient environment, normal map rebuilt from the height canvas
 * whenever versionRef changes, light steered by pointer/tilt. The CSS drop-shadow on the canvas (class etb-shadow)
 * makes it look like a physical plate resting on the page. snapshot() renders a tight, transparent-background image for the print.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { HH, HW } from "../lib/heightMap";
import { heightToNormal } from "../lib/normalMap";
import { buildPlate, fitCamera, FRONT_Z, makeEnvironment, PLATE_H, PLATE_W, type MetalKey } from "../lib/plateScene";
import type { Pt } from "../lib/strokePath";

export interface PenState {
  x: number;
  y: number;
  on: boolean;
}
export interface Selection {
  x: number;
  y: number;
  r: number;
}
export interface SurfaceEvent {
  type: "down" | "move" | "up";
  pos: Pt | null;
}
export interface PlateHandle {
  snapshot: () => HTMLCanvasElement | null;
}

interface Props {
  heightCanvas: HTMLCanvasElement | null;
  versionRef: MutableRefObject<number>;
  penRef: MutableRefObject<PenState>;
  metal: MetalKey;
  depth: number;
  selection: Selection | null;
  editing: boolean;
  onSurface?: (e: SurfaceEvent) => void;
  className?: string;
}

const DEFAULT_LIGHT = new THREE.Vector3(-2.4, 3, 3.5);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const PlateCanvas = forwardRef<PlateHandle, Props>(function PlateCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const snapRef = useRef<() => HTMLCanvasElement | null>(() => null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({ snapshot: () => snapRef.current() }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const el = renderer.domElement;
    el.className = "etb-shadow";
    el.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    host.appendChild(el);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const env = makeEnvironment(renderer);
    scene.environment = env;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const plate = buildPlate();
    scene.add(plate.group);
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.copy(DEFAULT_LIGHT);
    scene.add(light);

    // Normal map, rebuilt from the height canvas.
    const normalCanvas = document.createElement("canvas");
    normalCanvas.width = HW;
    normalCanvas.height = HH;
    const nctx = normalCanvas.getContext("2d");
    if (nctx) {
      nctx.fillStyle = "rgb(128,128,255)";
      nctx.fillRect(0, 0, HW, HH);
    }
    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.anisotropy = 4;
    plate.front.material.normalMap = normalTex;

    // Pen tip and selection ring (hidden in snapshots).
    const penZ = FRONT_Z + 0.04;
    const penCore = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const penHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xd3fb43, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xd3fb43, transparent: true, opacity: 0.95, depthTest: false }),
    );
    ring.renderOrder = 10;
    penCore.visible = penHalo.visible = ring.visible = false;
    plate.group.add(penCore, penHalo, ring);
    const toPlate = (x: number, y: number): [number, number] => [(x - 0.5) * PLATE_W, (0.5 - y) * PLATE_H];

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fitCamera(camera, 0.34);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Light + tilt control
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const lightTarget = DEFAULT_LIGHT.clone();
    const aim = (nx: number, ny: number) => {
      tilt.tx = nx;
      tilt.ty = ny;
      lightTarget.set(nx * 3.2, -ny * 3.2 + 0.6, 3.2);
    };
    const onPointerMove = (e: PointerEvent) => aim((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      aim(clamp(e.gamma / 30, -1, 1), clamp((e.beta - 40) / 30, -1, 1));
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("deviceorientation", onOrient);

    // Surface picking (EDIT step)
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (e: PointerEvent): Pt | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      plate.group.updateMatrixWorld(true);
      const h = ray.intersectObject(plate.front.mesh, false)[0];
      return h && h.uv ? { x: h.uv.x, y: 1 - h.uv.y } : null;
    };
    let down = false;
    const onDown = (e: PointerEvent) => {
      const p = propsRef.current;
      if (!p.editing || !p.onSurface) return;
      const pos = hit(e);
      if (pos) {
        down = true;
        el.setPointerCapture(e.pointerId);
      }
      p.onSurface({ type: "down", pos });
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const pos = hit(e);
      if (pos) propsRef.current.onSurface?.({ type: "move", pos });
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      propsRef.current.onSurface?.({ type: "up", pos: null });
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    let lastMetal: MetalKey | null = null;
    let lastVersion = -1;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = propsRef.current;
      if (p.metal !== lastMetal) {
        plate.setMetal(p.metal);
        lastMetal = p.metal;
      }
      const ns = 0.25 + p.depth * 1.9;
      plate.front.material.normalScale.set(ns, ns);
      if (p.heightCanvas && p.versionRef.current !== lastVersion) {
        lastVersion = p.versionRef.current;
        heightToNormal(p.heightCanvas, normalCanvas, 2);
        normalTex.needsUpdate = true;
      }
      const pen = p.penRef.current;
      penCore.visible = penHalo.visible = pen.on;
      if (pen.on) {
        const [x, y] = toPlate(pen.x, pen.y);
        penCore.position.set(x, y, penZ);
        penHalo.position.set(x, y, penZ);
      }
      ring.visible = !!p.selection;
      if (p.selection) {
        const [x, y] = toPlate(p.selection.x, p.selection.y);
        ring.position.set(x, y, penZ);
        ring.scale.setScalar(p.selection.r * PLATE_W);
      }
      if (!reduced) {
        tilt.x += (tilt.tx - tilt.x) * 0.08;
        tilt.y += (tilt.ty - tilt.y) * 0.08;
        const k = p.editing ? 0.4 : 1;
        plate.group.rotation.set(-tilt.y * 0.1 * k, tilt.x * 0.14 * k, 0);
      }
      light.position.lerp(lightTarget, 0.12);
      renderer.render(scene, camera);
    };
    tick();

    snapRef.current = () => {
      const W = 800;
      const H = 1000;
      const prev = renderer.getSize(new THREE.Vector2());
      const prevAspect = camera.aspect;
      const rot = plate.group.rotation.clone();
      const lp = light.position.clone();
      const vis = [penCore.visible, penHalo.visible, ring.visible];
      penCore.visible = penHalo.visible = ring.visible = false;
      plate.group.rotation.set(0, 0, 0);
      light.position.copy(DEFAULT_LIGHT);
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      fitCamera(camera, 0.06);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      out.getContext("2d")?.drawImage(el, 0, 0, W, H);
      renderer.setPixelRatio(dpr);
      renderer.setSize(prev.x, prev.y, false);
      camera.aspect = prevAspect;
      fitCamera(camera, 0.34);
      camera.updateProjectionMatrix();
      plate.group.rotation.copy(rot);
      light.position.copy(lp);
      [penCore.visible, penHalo.visible, ring.visible] = vis as [boolean, boolean, boolean];
      return out;
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("deviceorientation", onOrient);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      snapRef.current = () => null;
      plate.dispose();
      [penCore, penHalo, ring].forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      normalTex.dispose();
      env.dispose();
      renderer.dispose();
      el.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={props.className}>
      {failed && <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">Your browser could not start 3D graphics (WebGL), so the plate cannot be shown.</div>}
    </div>
  );
});

export default PlateCanvas;
