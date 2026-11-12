/**
 * The instrument around the keys: a small grand (curved bentside, open lid on
 * its prop), the plate, strings drawn as hairlines, dampers, legs, the pedal
 * lyre and the tray it stands on. Shapes are drawn in a top view where
 * x = across and d = distance back from the key fronts; world z = −d.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { KEYBOARD } from "./notes";
import { KEY_TOP, KEYBOARD_W, keyX } from "./model-keys";

export const CASE_BOTTOM = 0.6;
const RIM_H = 0.25;
export const CASE_TOP = CASE_BOTTOM + RIM_H;
const CHEEK_W = 0.034;
export const CASE_W = KEYBOARD_W + CHEEK_W * 2;
const D0 = 0.17; // case front, behind the fallboard
const RIM = 0.022;
const LID_ANGLE = (36 * Math.PI) / 180;
export const STRING_SEGMENTS = 24;
const STRING_Y = CASE_BOTTOM + 0.088;

/** The grand's outline, counter-clockwise in (x, d). */
function outline(): Vector2[] {
  const h = CASE_W / 2;
  const s = new Shape();
  s.moveTo(-h, D0);
  s.lineTo(h, D0);
  s.lineTo(h, D0 + 0.3);
  s.bezierCurveTo(h, D0 + 0.62, 0.1, D0 + 0.6, 0.07, D0 + 0.9);
  s.bezierCurveTo(0.05, D0 + 1.1, -0.36, D0 + 1.12, -h, D0 + 1.0);
  s.lineTo(-h, D0);
  return s.getSpacedPoints(160).slice(0, -1);
}

/** Move every vertex inward by `t` along its averaged normal. */
function inset(poly: Vector2[], t: number): Vector2[] {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const e1 = new Vector2(p.x - a.x, p.y - a.y).normalize();
    const e2 = new Vector2(b.x - p.x, b.y - p.y).normalize();
    const nrm = new Vector2(-(e1.y + e2.y), e1.x + e2.x).normalize(); // left of travel = inside for CCW
    return new Vector2(p.x + nrm.x * t, p.y + nrm.y * t);
  });
}

const toShape = (poly: Vector2[], holes: Vector2[][] = []) => {
  const s = new Shape(poly);
  for (const h of holes) s.holes.push(new Path([...h].reverse()));
  return s;
};

/** Extrude a top-view shape upward between y0 and y0 + h; shape d maps to world −z. */
function slab(shape: Shape, y0: number, h: number, bevel = 0) {
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, h - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(Math.PI / 2); // (x, d, z) → (x, −z, d)…
  g.scale(1, -1, -1); // …→ (x, z, −d): up, and backwards
  g.translate(0, y0 + bevel, 0);
  return g;
}

/** Back end of the string area at x: the farthest inner-rim point, minus room for the hitch pins. */
function stringEnd(inner: Vector2[], x: number) {
  let best = D0 + 0.4;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const y = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    best = Math.max(best, y);
  }
  return best - 0.05;
}

export function buildCase(edgeColor: string) {
  const root = new Group();
  root.name = "case";
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const track = <T extends BufferGeometry>(g: T) => (geos.push(g), g);
  const trackM = <T extends Material>(m: T) => (mats.push(m), m);

  const lacquer = trackM(new MeshPhysicalMaterial({ color: 0x111110, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.16 }));
  const satin = trackM(new MeshStandardMaterial({ color: 0x151514, roughness: 0.72, metalness: 0 }));
  const board = trackM(new MeshStandardMaterial({ color: 0x1b1813, roughness: 0.85 }));
  const iron = trackM(new MeshStandardMaterial({ color: 0x24221e, roughness: 0.42, metalness: 0.55 }));
  const metal = trackM(new MeshStandardMaterial({ color: 0x8a857e, roughness: 0.3, metalness: 0.9 }));
  const felt = trackM(new MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.95 }));
  const hair = trackM(new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.2 }));
  const faint = trackM(new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.1 }));

  const add = (geo: BufferGeometry, mat: Material, edges: LineBasicMaterial | null = hair, parent: Group = root, threshold = 28) => {
    const m = new Mesh(track(geo), mat);
    if (edges) m.add(new LineSegments(track(new EdgesGeometry(geo, threshold)), edges));
    parent.add(m);
    return m;
  };

  const outer = outline();
  const inner = inset(outer, RIM);

  // Rim, case floor, soundboard and the iron plate.
  add(slab(toShape(outer, [inner]), CASE_BOTTOM, RIM_H, 0.003), lacquer);
  add(slab(toShape(outer), CASE_BOTTOM - 0.02, 0.02), satin, faint);
  add(slab(toShape(inner), CASE_BOTTOM, 0.035), board, null);
  const plateOuter = inset(outer, RIM + 0.03);
  const holes = [0.32, 0.55, 0.78].map((f) => {
    const cy = D0 + 0.12 + f * 0.62;
    const cx = -0.12 + f * 0.05;
    return Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      return new Vector2(cx + Math.cos(a) * 0.12 * (1 - f * 0.45), cy + Math.sin(a) * 0.055);
    });
  });
  add(slab(toShape(plateOuter, holes), CASE_BOTTOM + 0.05, 0.018, 0.002), iron, faint);

  // Strings: one hairline per key, subdivided so a pulse of light can travel along it.
  const strings = new Map<number, { start: number; x: number; len: number }>();
  const pos: number[] = [];
  KEYBOARD.forEach((midi, i) => {
    const x = keyX(midi) * 0.9;
    const d0 = D0 + 0.12;
    const d1 = stringEnd(inner, x);
    strings.set(midi, { start: i * STRING_SEGMENTS * 2, x, len: d1 - d0 });
    for (let k = 0; k < STRING_SEGMENTS; k++) {
      const a = d0 + ((d1 - d0) * k) / STRING_SEGMENTS;
      const b = d0 + ((d1 - d0) * (k + 1)) / STRING_SEGMENTS;
      pos.push(x, STRING_Y, -a, x, STRING_Y, -b);
    }
  });
  const stringGeo = track(new BufferGeometry());
  stringGeo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  const stringColors = new Float32Array(pos.length);
  stringGeo.setAttribute("color", new BufferAttribute(stringColors, 3));
  const stringMat = trackM(new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  root.add(new LineSegments(stringGeo, stringMat));

  // Dampers sit on the strings and lift while a key (or the pedal) holds them.
  const damperGeo = track(new BoxGeometry(0.0085, 0.016, 0.03));
  const dampers = new Map<number, Mesh>();
  for (const midi of KEYBOARD) {
    if (midi > 88) continue; // the top strings have no dampers, as on a real grand
    const s = strings.get(midi)!;
    const m = new Mesh(damperGeo, felt);
    m.position.set(s.x, STRING_Y + 0.009, -(D0 + 0.2));
    m.userData.y0 = m.position.y;
    root.add(m);
    dampers.set(midi, m);
  }

  // Keybed, key slip, cheek blocks and fallboard frame the keys.
  const kbW = KEYBOARD_W + 0.004;
  add(new BoxGeometry(kbW, KEY_TOP - 0.022 - CASE_BOTTOM - 0.004, D0 + 0.012).translate(0, (KEY_TOP - 0.022 + CASE_BOTTOM - 0.004) / 2, -(D0 - 0.012) / 2), satin, faint);
  add(new BoxGeometry(kbW, 0.05, 0.012).translate(0, KEY_TOP - 0.036, 0.008), lacquer);
  for (const side of [-1, 1]) {
    add(new BoxGeometry(CHEEK_W, 0.135, D0 + 0.014).translate(side * (KEYBOARD_W / 2 + CHEEK_W / 2), CASE_BOTTOM + 0.0675, -(D0 - 0.014) / 2), lacquer);
  }
  const fall = add(new BoxGeometry(kbW, 0.06, 0.05), lacquer);
  fall.position.set(0, KEY_TOP + 0.03, -0.16);
  fall.rotation.x = -0.32;
  // Printed key numbers live on the fallboard's front face (local z = +0.025).
  const fallFace = new Group();
  fallFace.position.set(0, 0.002, 0.0256);
  fall.add(fallFace);

  // Lid, hinged along the spine and held open by its prop.
  const lidPivot = new Group();
  lidPivot.position.set(-CASE_W / 2, CASE_TOP, 0);
  const lidGeo = slab(toShape(outer), 0, 0.014, 0.002);
  lidGeo.translate(CASE_W / 2, 0, 0);
  add(lidGeo, lacquer, hair, lidPivot);
  lidPivot.rotation.z = LID_ANGLE;
  root.add(lidPivot);
  const propBase = new Vector3(CASE_W / 2 - 0.06, CASE_TOP, -(D0 + 0.42));
  const reach = CASE_W - 0.12;
  const propTop = new Vector3(-CASE_W / 2 + reach * Math.cos(LID_ANGLE), CASE_TOP + reach * Math.sin(LID_ANGLE), propBase.z);
  const propLen = propBase.distanceTo(propTop);
  const prop = add(new CylinderGeometry(0.006, 0.006, propLen, 8), satin, null);
  prop.position.copy(propBase).add(propTop).multiplyScalar(0.5);
  prop.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), propTop.clone().sub(propBase).normalize());

  // Legs.
  const legGeo = track(new CylinderGeometry(0.03, 0.021, CASE_BOTTOM - 0.02, 16).translate(0, (CASE_BOTTOM - 0.02) / 2, 0));
  const cupGeo = track(new CylinderGeometry(0.03, 0.034, 0.02, 16).translate(0, 0.01, 0));
  const legEdges = track(new EdgesGeometry(legGeo, 40));
  for (const [x, d] of [
    [-CASE_W / 2 + 0.07, 0.22],
    [CASE_W / 2 - 0.07, 0.22],
    [-0.12, D0 + 0.92],
  ]) {
    const leg = new Mesh(legGeo, lacquer);
    leg.add(new LineSegments(legEdges, hair));
    leg.position.set(x, 0, -d);
    const cup = new Mesh(cupGeo, metal);
    cup.position.set(x, 0, -d);
    root.add(leg, cup);
  }

  // Pedal lyre; the right pedal is the sustain pedal and moves with it.
  const lyreZ = -0.34;
  for (const side of [-1, 1]) add(new BoxGeometry(0.014, CASE_BOTTOM - 0.11, 0.022).translate(side * 0.06, 0.11 + (CASE_BOTTOM - 0.11) / 2, lyreZ), lacquer);
  add(new BoxGeometry(0.24, 0.05, 0.08).translate(0, 0.075, lyreZ), lacquer);
  const pedals: Group[] = [];
  for (const x of [-0.05, 0, 0.05]) {
    const g = new Group();
    g.position.set(x, 0.07, lyreZ + 0.03);
    add(new BoxGeometry(0.022, 0.008, 0.075).translate(0, 0, 0.0375), metal, null, g);
    root.add(g);
    pedals.push(g);
  }

  // Tray: a plate with an inset hairline, like an object on a plinth.
  const trayW = CASE_W + 0.26;
  const trayFront = 0.17;
  const trayBack = D0 + 1.12;
  const rounded = (w: number, d: number, r: number, cz: number) => {
    const s = new Shape();
    const x0 = -w / 2;
    const y0 = cz - d / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + d - r);
    s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
    s.lineTo(x0 + r, y0 + d);
    s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  };
  const trayD = trayBack + trayFront;
  const trayCz = (trayBack - trayFront) / 2;
  const tray = slab(rounded(trayW, trayD, 0.06, trayCz), -0.035, 0.035, 0.004);
  add(tray, satin, hair, root, 30);
  const insetPts = rounded(trayW - 0.1, trayD - 0.1, 0.035, trayCz).getSpacedPoints(120);
  const insetPos: number[] = [];
  for (let i = 0; i < insetPts.length - 1; i++) insetPos.push(insetPts[i].x, 0.0006, -insetPts[i].y, insetPts[i + 1].x, 0.0006, -insetPts[i + 1].y);
  const insetGeo = track(new BufferGeometry());
  insetGeo.setAttribute("position", new BufferAttribute(new Float32Array(insetPos), 3));
  root.add(new LineSegments(insetGeo, faint));

  // Tuning pins as a double row of points (the site's own vocabulary).
  const pins: number[] = [];
  for (const midi of KEYBOARD) {
    const s = strings.get(midi)!;
    pins.push(s.x - 0.002, STRING_Y + 0.004, -(D0 + 0.085), s.x + 0.002, STRING_Y + 0.004, -(D0 + 0.1));
  }

  return {
    root,
    strings,
    stringColors,
    stringGeo,
    dampers,
    sustainPedal: pedals[2],
    fallFace,
    pins: new Float32Array(pins),
    footprint: { w: trayW, front: trayFront, back: trayBack },
    geometries: geos,
    materials: mats,
  };
}
