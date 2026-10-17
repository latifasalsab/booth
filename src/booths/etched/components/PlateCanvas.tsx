"use client";
/**
 * Three.js plate on a transparent canvas (renderer alpha: true). Silver rounded-rectangle plate, 4 chrome studs,
 * brushed + scratched roughness map, procedural gradient environment, normal map rebuilt from the height canvas
 * whenever versionRef changes, light steered by pointer/tilt. The CSS drop-shadow on the canvas (class etb-shadow)
 * makes it look like a physical plate resting on the page. snapshot() renders a tight, transparent-background image for the print.
 * While a pointer is down on the plate (dragging, scaling or rotating an element) the pointer-following light eases to a
 * neutral top-left position (~200ms) and ignores the pointer until release, then eases back (~400ms); the tilt holds still.
 * In EDIT it also draws the selected element's frame (1px line, small handles, no glow) and reports pointer gestures
 * on the plate surface: down / move / up, and two-finger pinchStart / pinch (scale, rotation) / pinchEnd.
 * Orientation: canvas row 0 is the top of the plate and column 0 its left (texture flipY = true), uv.y is flipped back
 * when picking, so left and right never swap.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Frame } from "../lib/elements";
import { HH, HW } from "../lib/heightMap";
import { heightToNormal } from "../lib/normalMap";
import { buildPlate, fitCamera, FRONT_Z, makeEnvironment, PLATE_H, PLATE_W, type MetalKey } from "../lib/plateScene";
import type { Pt } from "../lib/strokePath";

export interface PenState {
  x: number;
  y: number;
  on: boolean;
}
export interface SurfaceEvent {
  type: "down" | "move" | "up" | "pinchStart" | "pinch" | "pinchEnd";
  pos: Pt | null;
  /** pinch: distance ratio since the gesture started */
  scale?: number;
  /** pinch: rotation (radians) since the gesture started */
  rot?: number;
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
  /** Selected element's frame (normalized plate coordinates), or null. */
  frame: Frame | null;
  editing: boolean;
  onSurface?: (e: SurfaceEvent) => void;
  /** Called once, after the first rendered frame (or when WebGL is unavailable): lets the route be revealed. */
  onFirstFrame?: () => void;
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
      propsRef.current.onFirstFrame?.();
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

    // Pen tip and selection frame (both hidden in snapshots).
    const penZ = FRONT_Z + 0.04;
    const penCore = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const penHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xd3fb43, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const lineMat = new THREE.LineBasicMaterial({ color: 0xd3fb43, depthTest: false });
    const handleMat = new THREE.MeshBasicMaterial({ color: 0xd3fb43, depthTest: false });
    const frameGeo = new THREE.BufferGeometry();
    frameGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const cornerGeo = new THREE.PlaneGeometry(0.04, 0.04);
    const rotGeo = new THREE.CircleGeometry(0.024, 24);
    const frameLine = new THREE.Line(frameGeo, lineMat);
    const stemLine = new THREE.Line(stemGeo, lineMat);
    const corners = Array.from({ length: 4 }, () => new THREE.Mesh(cornerGeo, handleMat));
    const rotHandle = new THREE.Mesh(rotGeo, handleMat);
    const sel = new THREE.Group();
    sel.add(frameLine, stemLine, rotHandle, ...corners);
    sel.children.forEach((c) => {
      c.renderOrder = 10;
      c.frustumCulled = false;
    });
    penCore.visible = penHalo.visible = sel.visible = false;
    plate.group.add(penCore, penHalo, sel);
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

    // Surface picking (EDIT step): one pointer = down/move/up, two pointers = pinch (scale + rotation).
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (cx: number, cy: number): Pt | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      plate.group.updateMatrixWorld(true);
      const h = ray.intersectObject(plate.front.mesh, false)[0];
      return h && h.uv ? { x: h.uv.x, y: 1 - h.uv.y } : null;
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let frozen = false; // pointer down on the plate: light and tilt stop following the pointer
    let down = false;
    let pinch: { d0: number; a0: number } | null = null;
    const pair = () => {
      const [a, b] = Array.from(pointers.values());
      return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    const emit = (e: SurfaceEvent) => propsRef.current.onSurface?.(e);
    const onDown = (e: PointerEvent) => {
      const p = propsRef.current;
      if (!p.editing || !p.onSurface) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      frozen = true;
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        if (down) {
          down = false;
          emit({ type: "up", pos: null });
        }
        const g = pair();
        pinch = { d0: g.d, a0: g.a };
        emit({ type: "pinchStart", pos: null });
        return;
      }
      if (pointers.size === 1) {
        const pos = hit(e.clientX, e.clientY);
        down = !!pos;
        emit({ type: "down", pos });
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const g = pair();
        emit({ type: "pinch", pos: null, scale: g.d / pinch.d0, rot: g.a - pinch.a0 });
        return;
      }
      if (!down) return;
      const pos = hit(e.clientX, e.clientY);
      if (pos) emit({ type: "move", pos });
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) frozen = false;
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null;
          emit({ type: "pinchEnd", pos: null });
        }
        down = false;
        return;
      }
      if (down) {
        down = false;
        emit({ type: "up", pos: null });
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    let lastMetal: MetalKey | null = null;
    let lastVersion = -1;
    let firstFrame = false;
    let raf = 0;
    let lastT = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(64, now - lastT);
      lastT = now;
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
      sel.visible = !!p.frame && p.editing;
      if (p.frame && p.editing) {
        const f = p.frame;
        const fp = frameGeo.attributes.position as THREE.BufferAttribute;
        [...f.corners, f.corners[0]].forEach((c, i) => {
          const [x, y] = toPlate(c.x, c.y);
          fp.setXYZ(i, x, y, penZ);
        });
        fp.needsUpdate = true;
        const sp = stemGeo.attributes.position as THREE.BufferAttribute;
        f.stem.forEach((c, i) => {
          const [x, y] = toPlate(c.x, c.y);
          sp.setXYZ(i, x, y, penZ);
        });
        sp.needsUpdate = true;
        f.corners.forEach((c, i) => {
          const [x, y] = toPlate(c.x, c.y);
          corners[i].position.set(x, y, penZ);
        });
        const [hx, hy] = toPlate(f.handle.x, f.handle.y);
        rotHandle.position.set(hx, hy, penZ);
      }
      if (!reduced && !frozen) {
        tilt.x += (tilt.tx - tilt.x) * 0.08;
        tilt.y += (tilt.ty - tilt.y) * 0.08;
        const k = p.editing ? 0.4 : 1;
        plate.group.rotation.set(-tilt.y * 0.1 * k, tilt.x * 0.14 * k, 0);
      }
      // neutral while the user edits (about 200ms to settle), back to the pointer after release (about 400ms)
      light.position.lerp(frozen ? DEFAULT_LIGHT : lightTarget, 1 - Math.exp(-dt / (frozen ? 70 : 130)));
      renderer.render(scene, camera);
      if (!firstFrame) {
        firstFrame = true;
        propsRef.current.onFirstFrame?.();
      }
    };
    tick();

    snapRef.current = () => {
      const W = 800;
      const H = 1000;
      const prev = renderer.getSize(new THREE.Vector2());
      const prevAspect = camera.aspect;
      const rot = plate.group.rotation.clone();
      const lp = light.position.clone();
      const vis = [penCore.visible, penHalo.visible, sel.visible];
      penCore.visible = penHalo.visible = sel.visible = false;
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
      [penCore.visible, penHalo.visible, sel.visible] = vis as [boolean, boolean, boolean];
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
      for (const m of [penCore, penHalo]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      [frameGeo, stemGeo, cornerGeo, rotGeo, lineMat, handleMat].forEach((o) => o.dispose());
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
