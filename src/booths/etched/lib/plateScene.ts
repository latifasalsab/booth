/**
 * Three.js pieces for the plate: procedural gradient environment, rounded-rectangle body,
 * a front face (carries the normal + roughness maps), four chrome studs, and camera fitting.
 * The body has no normal map because extruded side walls have degenerate UVs; only the flat front face does.
 */
import * as THREE from "three";
import { HH, HW } from "./heightMap";
import { makeRoughnessCanvas } from "./normalMap";

export const PLATE_W = 1.6;
export const PLATE_H = 2.0;
const DEPTH = 0.07;
const BEVEL = 0.025;
const RADIUS = 0.16;
export const FRONT_Z = DEPTH / 2 + BEVEL;

export type MetalKey = "silver" | "gold" | "rose";
export const METALS: Record<MetalKey, { label: string; color: number; swatch: string }> = {
  silver: { label: "Silver", color: 0xdadce0, swatch: "linear-gradient(135deg,#f2f3f5,#a9acb3)" },
  gold: { label: "Gold", color: 0xe3b856, swatch: "linear-gradient(135deg,#f7dc8f,#b8862a)" },
  rose: { label: "Rose gold", color: 0xe0a493, swatch: "linear-gradient(135deg,#f6cfc2,#b9705f)" },
};

/** Gradient sky with a few bright softboxes, baked to a PMREM texture. No external HDRI. */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 50 + 1) / 2;
    colors.push(0.04 + 0.5 * t * t, 0.045 + 0.53 * t * t, 0.055 + 0.58 * t * t);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w: number, h: number, p: [number, number, number], k: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }),
    );
    m.position.set(...p);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(30, 18, [-25, 22, 25], 6);
  box(12, 40, [30, 5, 10], 3);
  box(40, 6, [0, -30, 20], 1.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  geo.dispose();
  return rt.texture;
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export interface PlateParts {
  group: THREE.Group;
  front: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial };
  setMetal: (k: MetalKey) => void;
  dispose: () => void;
}

export function buildPlate(): PlateParts {
  const group = new THREE.Group();
  const shape = roundedRect(PLATE_W, PLATE_H, RADIUS);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 4,
    curveSegments: 28,
  });
  bodyGeo.translate(0, 0, -DEPTH / 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: METALS.silver.color, metalness: 1, roughness: 0.4 });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Front face: UVs span exactly 0..1 so the height/normal canvases line up with the plate.
  const frontGeo = new THREE.ShapeGeometry(shape, 28);
  const p = frontGeo.attributes.position;
  const uv = frontGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + PLATE_W / 2) / PLATE_W, (p.getY(i) + PLATE_H / 2) / PLATE_H);
  uv.needsUpdate = true;
  const rough = new THREE.CanvasTexture(makeRoughnessCanvas(HW, HH));
  rough.anisotropy = 4;
  const frontMat = new THREE.MeshStandardMaterial({
    color: METALS.silver.color,
    metalness: 1,
    roughness: 1,
    roughnessMap: rough,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const front = new THREE.Mesh(frontGeo, frontMat);
  front.position.z = FRONT_Z + 0.0004;
  group.add(front);

  const studGeo = new THREE.SphereGeometry(0.055, 32, 16);
  const studMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.07 });
  const sx = PLATE_W / 2 - 0.17;
  const sy = PLATE_H / 2 - 0.17;
  for (const [x, y] of [[-sx, sy], [sx, sy], [-sx, -sy], [sx, -sy]]) {
    const stud = new THREE.Mesh(studGeo, studMat);
    stud.position.set(x, y, FRONT_Z + 0.012);
    group.add(stud);
  }

  return {
    group,
    front: { mesh: front, material: frontMat },
    setMetal: (k) => {
      bodyMat.color.setHex(METALS[k].color);
      frontMat.color.setHex(METALS[k].color);
    },
    dispose: () => {
      [bodyGeo, frontGeo, studGeo, bodyMat, frontMat, studMat, rough].forEach((o) => o.dispose());
      frontMat.normalMap?.dispose();
    },
  };
}

/** Position the camera so the whole plate fits with the given relative margin. */
export function fitCamera(cam: THREE.PerspectiveCamera, margin: number): void {
  const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const dh = (PLATE_H * (1 + margin)) / 2 / th;
  const dw = (PLATE_W * (1 + margin)) / 2 / (th * cam.aspect);
  cam.position.set(0, 0, Math.max(dh, dw) + FRONT_Z);
  cam.lookAt(0, 0, 0);
}
