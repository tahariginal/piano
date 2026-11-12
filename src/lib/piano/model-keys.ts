/**
 * Keys of the 3D piano: notched white keys, raised black keys, each on a
 * pivot hidden under the fallboard so the front dips like a real key.
 * Units are metres. +z points at the player, +y up, keys run along x.
 */

import {
  BufferGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
} from "three";
import { HIGHEST, isBlack, KEYBOARD, LOWEST } from "./notes";

export const PITCH = 0.0235; // white key spacing
const GAP = 0.0011;
export const WHITE_LEN = 0.15;
const WHITE_H = 0.022;
const HEAD = 0.05; // front part of a white key, full width
const BLACK_W = 0.0128;
export const BLACK_LEN = 0.096;
const BLACK_H = 0.011; // above the white key tops
export const KEY_TOP = 0.7; // white key top, from the floor
const PIVOT_Z = -0.32; // balance rail, hidden under the case
export const DIP = 0.0105; // white key front travel

/** Offset of each black key from the boundary between its two white keys, in key pitches. */
const BLACK_OFFSET: Record<number, number> = { 1: -0.12, 3: 0.12, 6: -0.16, 8: 0, 10: 0.16 };

const whiteIndex = (midi: number) => {
  let n = 0;
  for (let m = LOWEST; m < midi; m++) if (!isBlack(m)) n++;
  return n;
};
export const WHITE_COUNT = whiteIndex(HIGHEST) + 1;
export const KEYBOARD_W = WHITE_COUNT * PITCH;

/** Centre x of a key. */
export function keyX(midi: number) {
  if (!isBlack(midi)) return (whiteIndex(midi) + 0.5) * PITCH - KEYBOARD_W / 2;
  const boundary = whiteIndex(midi) * PITCH - KEYBOARD_W / 2;
  return boundary + BLACK_OFFSET[midi % 12] * PITCH;
}

export type KeyRig = {
  midi: number;
  black: boolean;
  pivot: Group;
  mesh: Mesh;
  material: MeshStandardMaterial | MeshPhysicalMaterial;
  /** 0 = up, 1 = fully down. Driven by a spring in the scene. */
  p: number;
  v: number;
  target: number;
  /** Blue light on the key, 0–1. */
  glow: number;
  hover: number;
};

/** White key outline seen from above: full-width head, tail narrowed where black keys sit. */
function whiteShape(midi: number): Shape {
  const cx = keyX(midi);
  const half = (PITCH - GAP) / 2;
  let tailL = cx - half;
  let tailR = cx + half;
  const below = midi - 1;
  const above = midi + 1;
  if (below >= LOWEST && isBlack(below)) tailL = keyX(below) + BLACK_W / 2 + GAP;
  if (above <= HIGHEST && isBlack(above)) tailR = keyX(above) - BLACK_W / 2 - GAP;
  // Shape space: x across, y = distance back from the key front. Relative to the key centre.
  const s = new Shape();
  const l = -half;
  const r = half;
  const tl = tailL - cx;
  const tr = tailR - cx;
  s.moveTo(l, 0);
  s.lineTo(r, 0);
  s.lineTo(r, HEAD);
  s.lineTo(tr, HEAD);
  s.lineTo(tr, WHITE_LEN);
  s.lineTo(tl, WHITE_LEN);
  s.lineTo(tl, HEAD);
  s.lineTo(l, HEAD);
  s.closePath();
  return s;
}

function blackShape(): Shape {
  const h = BLACK_W / 2;
  const s = new Shape();
  s.moveTo(-h, 0);
  s.lineTo(h, 0);
  s.lineTo(h, BLACK_LEN);
  s.lineTo(-h, BLACK_LEN);
  s.closePath();
  return s;
}

/** Extrude a top-view outline upward: shape (x, back) → world (x, up, −back). */
function slab(shape: Shape, height: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel, // keep the walls on the outline so neighbouring keys never touch
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

export function buildKeys(edgeColor: string) {
  const group = new Group();
  group.name = "keys";
  const rigs = new Map<number, KeyRig>();
  const whiteMat = new MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.38, metalness: 0, emissive: 0x3b82f6, emissiveIntensity: 0 });
  const blackMat = new MeshPhysicalMaterial({ color: 0x0b0b0b, roughness: 0.28, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2, emissive: 0x3b82f6, emissiveIntensity: 0 });
  const whiteEdge = new LineBasicMaterial({ color: 0x0c0c0b, transparent: true, opacity: 0.28 });
  const blackEdge = new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.22 });
  const blackGeo = slab(blackShape(), BLACK_H + 0.006, 0.0012);
  const blackEdges = new EdgesGeometry(blackGeo, 25);
  // White keys come in a handful of notch patterns (C, D, E…): build each once.
  const whiteGeos = new Map<string, { geo: BufferGeometry; edges: EdgesGeometry }>();
  const whiteFor = (midi: number) => {
    const shape = whiteShape(midi);
    const id = shape.getPoints().map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join(";");
    let entry = whiteGeos.get(id);
    if (!entry) {
      const geo = slab(shape, WHITE_H, 0.0009);
      entry = { geo, edges: new EdgesGeometry(geo, 25) };
      whiteGeos.set(id, entry);
    }
    return entry;
  };

  for (const midi of KEYBOARD) {
    const black = isBlack(midi);
    const pivot = new Group();
    pivot.position.set(keyX(midi), KEY_TOP - WHITE_H, PIVOT_Z);
    // Each key gets its own material so it can light up on its own.
    const material = (black ? blackMat : whiteMat).clone();
    const shared = black ? { geo: blackGeo, edges: blackEdges } : whiteFor(midi);
    const mesh = new Mesh(shared.geo, material);
    // Key front sits at world z = 0 (white) or z = −HEAD + a little (black).
    const frontZ = black ? -HEAD + 0.004 : 0;
    mesh.position.set(0, black ? WHITE_H - 0.006 : 0, frontZ - PIVOT_Z);
    mesh.userData.midi = midi;
    const edges = new LineSegments(shared.edges, black ? blackEdge : whiteEdge);
    mesh.add(edges);
    pivot.add(mesh);
    group.add(pivot);
    rigs.set(midi, { midi, black, pivot, mesh, material, p: 0, v: 0, target: 0, glow: 0, hover: 0 });
  }

  /** Maximum pivot rotation: the white key front travels DIP. */
  const maxAngle = Math.atan2(DIP, -PIVOT_Z);
  const geometries: BufferGeometry[] = [blackGeo, blackEdges, ...[...whiteGeos.values()].flatMap((e) => [e.geo, e.edges])];
  return { group, rigs, maxAngle, materials: [whiteMat, blackMat, whiteEdge, blackEdge], geometries };
}
