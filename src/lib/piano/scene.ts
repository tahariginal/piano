/**
 * PianoScene — renders the instrument and owns its camera and pointer input.
 *
 * It draws on demand: a frame is rendered only while something moves (a key,
 * a string pulse, the camera), so an idle piano costs nothing. Sound never
 * waits on it: pointer presses call back into the controller first.
 */

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  type Sprite,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCase, CASE_W, STRING_SEGMENTS } from "./model-case";
import { buildKeys, KEY_TOP, keyX, PITCH, type KeyRig } from "./model-keys";
import { cOf, inRange, isBlack, noteName, shortcutFor, windowNotes } from "./notes";
import { keyInstruction } from "./learning";
import { makeKeyCue, makeLabel, radialTexture } from "./scene-labels";

export type PianoSceneOptions = {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  lowPower: boolean;
  /** Font family for the key labels (IBM Plex Mono, as loaded by next/font). */
  font: string;
  /** Space kept clear for overlays, in CSS pixels. Read on every fit, so it can follow the layout. */
  padding: () => { top: number; right: number; bottom: number; left: number };
  colors: { fg: string; accent: string; accentLight: string };
  onPress: (pointerId: number, midi: number, velocity: number) => void;
  onGlide: (pointerId: number, midi: number | null) => void;
  onLift: (pointerId: number) => void;
  onHover?: (midi: number | null) => void;
  onViewChange?: (moved: boolean) => void;
  /** The zoom level the view is heading to: 1 frames the view, 2 is twice as close. */
  onZoom?: (zoom: number) => void;
  onContextLost?: (lost: boolean) => void;
};

export type PianoView = "piano" | "keys";

export type PianoSceneHandle = {
  setKey(midi: number, down: boolean): void;
  setSustain(on: boolean): void;
  setOctave(octave: number): void;
  setTargets(midis: readonly number[]): void;
  feedback(midi: number, correct: boolean): void;
  clearFeedback(): void;
  /** Zoom by `factor`, keeping the middle of the view where it is. */
  zoomBy(factor: number): void;
  /** "piano" frames the whole instrument; "keys" glides down to the keyboard for close play. */
  setView(view: PianoView): void;
  resetView(): void;
  dispose(): void;
};

const AZ0 = 0.34;
const EL0 = 0.58;
/** Default angles per view. */
const VIEWS: Record<PianoView, { az: number; el: number }> = { piano: { az: AZ0, el: EL0 }, keys: { az: 0.1, el: 0.95 } };
const AZ_RANGE = 0.8;
const EL_MIN = 0.28;
const EL_MAX = 1.12;
/** Zoom limits: a little room around the framed view, out to four times closer. */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 4;

export function createPianoScene(o: PianoSceneOptions): PianoSceneHandle {
  // Throws when WebGL is unavailable; the caller falls back to the 2D keys.
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.lowPower, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  let dprCap = o.lowPower ? 1.5 : 2;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTex: Texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.28;

  scene.add(new AmbientLight(0xffffff, 0.22));
  const key = new DirectionalLight(0xfff4e6, 1.9);
  key.position.set(-1.6, 3.2, 2.2);
  const rim = new DirectionalLight(0xc8d6ff, 0.7);
  rim.position.set(2.4, 1.6, -2.6);
  const fill = new DirectionalLight(0xffffff, 0.35);
  fill.position.set(1.5, 1.2, 2.5);
  scene.add(key, rim, fill);
  const spark = new PointLight(o.colors.accent, 0, 0.9, 2);
  spark.position.set(0, KEY_TOP + 0.09, 0.03);
  scene.add(spark);

  const piano = new Group();
  scene.add(piano);
  const body = buildCase(o.colors.fg);
  const keys = buildKeys(o.colors.fg);
  piano.add(body.root, keys.group);

  // Contact shadow and the blue floor glow that answers to playing.
  const shadowTex = radialTexture("rgba(0,0,0,0.6)", "rgba(0,0,0,0)");
  const shadow = new Mesh(new PlaneGeometry(CASE_W + 0.4, 1.5).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, 0.0012, -0.55);
  const glowTex = radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const glowMat = new MeshBasicMaterial({ map: glowTex, color: o.colors.accent, transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new Mesh(new PlaneGeometry(CASE_W + 0.4, 0.9).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(0, 0.0016, 0.05);
  piano.add(shadow, glow);

  // Tuning pins.
  const pinGeo = new BufferGeometry();
  pinGeo.setAttribute("position", new BufferAttribute(body.pins, 3));
  const pinMat = new PointsMaterial({ color: o.colors.fg, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.45 });
  piano.add(new Points(pinGeo, pinMat));

  // Octave window: a blue hairline under the thirteen keys the number row plays.
  const windowBar = new Mesh(new PlaneGeometry(1, 0.0016), new MeshBasicMaterial({ color: o.colors.accent, toneMapped: false }));
  windowBar.position.set(0, KEY_TOP - 0.03, 0.0145);
  piano.add(windowBar);
  const bar = { x: 0, w: 0, tx: 0, tw: 0 };

  // Key numbers 1–8 printed on the fallboard above the white keys of the current octave.
  // White-key numbers on one row; the black-key letters on a row above, between them.
  const labelMeshes = windowNotes(4).map((m) => {
    const label = makeLabel(shortcutFor(m, 4) ?? "", o.font, isBlack(m) ? 0.016 : 0.019);
    label.position.y = isBlack(m) ? 0.019 : 0;
    return label;
  });
  labelMeshes.forEach((l) => body.fallFace.add(l));
  const fgC = new Color(o.colors.fg);
  const accentC = new Color(o.colors.accentLight);

  // ---------------------------------------------------------------- state
  const reduced = o.reducedMotion;
  const rigs = keys.rigs;
  const meshes: Object3D[] = [...rigs.values()].map((r) => r.mesh);
  let sustain = 0;
  let sustainTarget = 0;
  let octave = 4;
  let targets: number[] = [];
  let targetSet = new Set<number>();
  const feedback = new Map<number, { correct: boolean; until: number }>();
  const cues = new Map<number, Sprite>();
  const blue = new Color(0x1685ff), green = new Color(0x22c55e), red = new Color(0xef4444);
  const whiteBase = new Color(0xe6e0d6), blackBase = new Color(0x0b0b0b);
  let zoom = 1, targetZoom = 1;
  // Zoomed in, the view can travel: an offset from the framed centre, in camera-space world units.
  const pan = { x: 0, y: 0 };
  // While a zoom glides, this point of the scene stays under this pixel (the pointer, or the view's middle).
  let anchor: { wx: number; wy: number; px: number; py: number } | null = null;
  // The last fit: world units per CSS pixel, and the view centre.
  let scale = 1, viewX = 0, viewY = 0;
  let pulse = 0;
  let activity = 0;
  const strings = new Map<number, { e: number; head: number; held: boolean }>();
  const baseString = fgC.clone().multiplyScalar(0.2);
  const stringColor = new Color(o.colors.accentLight);
  const colors = body.stringColors;
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = baseString.r;
    colors[i + 1] = baseString.g;
    colors[i + 2] = baseString.b;
  }

  const cam = { az: AZ0, el: EL0, taz: AZ0, tel: EL0 };
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  const bounds = new Box3().setFromObject(body.root).union(new Box3().setFromObject(keys.group));
  const center = bounds.getCenter(new Vector3());
  // Frame the real silhouette, not its bounding box: a few thousand vertices of the instrument.
  piano.updateMatrixWorld(true);
  const hull: number[] = [];
  const tmp = new Vector3();
  for (const root of [body.root, keys.group]) {
    root.traverse((obj) => {
      const pos = (obj as Mesh).isMesh ? (obj as Mesh).geometry.getAttribute("position") : null;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        hull.push(tmp.x, tmp.y, tmp.z);
      }
    });
  }
  const corners: Vector3[] = [];
  for (let i = 0; i < hull.length; i += 3) corners.push(new Vector3(hull[i], hull[i + 1], hull[i + 2]));
  // The keyboard alone, for the close "keys" view.
  const kbCorners: Vector3[] = [];
  for (const r of rigs.values()) {
    const pos = r.mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 40))) kbCorners.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(r.mesh.matrixWorld));
  }
  let view: PianoView = "piano";
  let focus = 0; // 0 = whole piano framed, 1 = keyboard framed
  let W = 1;
  let H = 1;

  const extent = (pts: Vector3[]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new Vector3();
    for (const c of pts) {
      v.copy(c).applyMatrix4(camera.matrixWorldInverse);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    return [x0, x1, y0, y1];
  };

  /** Place the camera and frame the whole instrument inside the padded viewport. */
  const fit = () => {
    const dir = new Vector3(Math.sin(cam.az) * Math.cos(cam.el), Math.sin(cam.el), Math.cos(cam.az) * Math.cos(cam.el));
    camera.position.copy(center).addScaledVector(dir, 8);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    // Blend the framing of the whole piano and of the keyboard, so the change of view is one glide.
    const a = focus < 1 ? extent(corners) : null;
    const b = focus > 0 ? extent(kbCorners) : null;
    const f = focus * focus * (3 - 2 * focus);
    const mix = (i: number) => (a && b ? a[i] + (b[i] - a[i]) * f : (a ?? b)![i]);
    const [x0, x1, y0, y1] = [mix(0), mix(1), mix(2), mix(3)];
    const p = o.padding();
    const availW = Math.max(40, W - p.left - p.right);
    const availH = Math.max(40, H - p.top - p.bottom);
    // World units per CSS pixel, so the box fits both ways with a small margin.
    const s = Math.max((x1 - x0) / availW, (y1 - y0) / availH) * 1.04 / zoom;
    let cx = (x0 + x1) / 2 - ((p.left - p.right) / 2) * s;
    let cy = (y0 + y1) / 2 + ((p.top - p.bottom) / 2) * s;
    if (anchor) {
      pan.x = anchor.wx - (anchor.px - W / 2) * s - cx;
      pan.y = anchor.wy - (H / 2 - anchor.py) * s - cy;
    }
    // The view may travel only as far as the framed box's edge: none at all once it fits again.
    const mx = Math.max(0, (x1 - x0 - availW * s) / 2);
    const my = Math.max(0, (y1 - y0 - availH * s) / 2);
    pan.x = Math.min(mx, Math.max(-mx, pan.x));
    pan.y = Math.min(my, Math.max(-my, pan.y));
    cx += pan.x;
    cy += pan.y;
    scale = s;
    viewX = cx;
    viewY = cy;
    camera.left = cx - (W / 2) * s;
    camera.right = cx + (W / 2) * s;
    camera.top = cy + (H / 2) * s;
    camera.bottom = cy - (H / 2) * s;
    camera.updateProjectionMatrix();
  };

  const resize = () => {
    const r = o.canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    fit();
    invalidate();
  };

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = 0;
  let disposed = false;
  let wasAnimating = false;
  const frameTimes: number[] = [];

  const invalidate = () => {
    if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const stepKey = (r: KeyRig, dt: number) => {
    let moving = false;
    if (reduced) r.p = r.target;
    else {
      const down = r.target > r.p;
      const k = down ? 2600 : 950;
      const c = down ? 82 : 46; // the return is a touch under-damped, so the key settles like wood on felt
      for (let t = 0; t < dt; t += 1 / 240) {
        const h = Math.min(1 / 240, dt - t);
        r.v += (-k * (r.p - r.target) - c * r.v) * h;
        r.p += r.v * h;
      }
      if (Math.abs(r.p - r.target) < 0.0005 && Math.abs(r.v) < 0.01) {
        r.p = r.target;
        r.v = 0;
      } else moving = true;
    }
    r.pivot.rotation.x = Math.max(-0.1, r.p) * keys.maxAngle;
    const glowTarget = r.target > 0 ? 0.4 : 0;
    const before = r.glow;
    r.glow += (glowTarget - r.glow) * (1 - Math.exp(-dt * (r.target > 0 ? 3 : 7)));
    if (Math.abs(r.glow - glowTarget) < 0.003) r.glow = glowTarget;
    let result = feedback.get(r.midi);
    if (result && performance.now() >= result.until) { feedback.delete(r.midi); result = undefined; }
    const guided = targetSet.has(r.midi);
    const tint = result ? (result.correct ? green : red) : blue;
    r.material.color.copy(r.black ? blackBase : whiteBase);
    if (result || guided) r.material.color.lerp(tint, result && !result.correct ? 0.45 : 0.8);
    if (guided || result?.correct) r.material.color.copy(tint).multiplyScalar(0.3);
    r.material.emissive.copy(tint);
    const aim = result || guided ? (result && !result.correct ? 0.4 : 0.95) : 0;
    r.material.emissiveIntensity = Math.max(aim, r.glow * (r.black ? 1.5 : 0.62)) + r.hover * (r.black ? 0.25 : 0.06);
    const d = body.dampers.get(r.midi);
    if (d) d.position.y = (d.userData.y0 as number) + Math.max(Math.min(1, r.p), sustain) * 0.011;
    return moving || r.glow !== before || !!result;
  };

  const stepStrings = (dt: number) => {
    let live = false;
    for (const [midi, s] of strings) {
      const meta = body.strings.get(midi);
      if (!meta) continue;
      const damped = !s.held && sustain < 0.5;
      s.e *= Math.exp(-dt * (damped ? 6 : 0.55));
      s.head += dt * (reduced ? 0 : 1.6 / Math.max(0.4, meta.len));
      const glowAmt = reduced ? s.e * 0.7 : s.e * 0.35;
      for (let k = 0; k < STRING_SEGMENTS; k++) {
        const t = (k + 0.5) / STRING_SEGMENTS;
        const pulseAmt = reduced ? 0 : s.e * Math.exp(-(((t - s.head) / 0.09) ** 2)) * 1.3;
        const a = Math.min(1, glowAmt + pulseAmt);
        for (const j of [0, 1]) {
          const i = (meta.start + k * 2 + j) * 3;
          colors[i] = baseString.r + (stringColor.r - baseString.r) * a;
          colors[i + 1] = baseString.g + (stringColor.g - baseString.g) * a;
          colors[i + 2] = baseString.b + (stringColor.b - baseString.b) * a;
        }
      }
      if (s.e < 0.004) {
        for (let k = meta.start * 3; k < (meta.start + STRING_SEGMENTS * 2) * 3; k += 3) {
          colors[k] = baseString.r;
          colors[k + 1] = baseString.g;
          colors[k + 2] = baseString.b;
        }
        strings.delete(midi);
      } else live = true;
    }
    (body.stringGeo.getAttribute("color") as BufferAttribute).needsUpdate = true;
    return live;
  };

  const frame = (now: number) => {
    raf = 0;
    // Capped so a stall never jumps, but loose enough that slow devices still finish moves on time.
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    let animating = false;

    for (const r of rigs.values()) {
      const hoverTarget = hovered === r.midi ? 1 : 0;
      if (r.hover !== hoverTarget) {
        r.hover += (hoverTarget - r.hover) * (1 - Math.exp(-dt * 14));
        if (Math.abs(r.hover - hoverTarget) < 0.01) r.hover = hoverTarget;
        else animating = true;
      }
      if (stepKey(r, dt)) animating = true;
    }
    if (strings.size && stepStrings(dt)) animating = true;

    const sPrev = sustain;
    sustain = reduced ? sustainTarget : sustain + (sustainTarget - sustain) * (1 - Math.exp(-dt * 16));
    if (Math.abs(sustain - sustainTarget) < 0.002) sustain = sustainTarget;
    if (sustain !== sPrev) {
      animating = true;
      body.sustainPedal.rotation.x = sustain * 0.11;
      for (const r of rigs.values()) {
        const d = body.dampers.get(r.midi);
        if (d) d.position.y = (d.userData.y0 as number) + Math.max(Math.min(1, r.p), sustain) * 0.011;
      }
    }

    pulse *= Math.exp(-dt * 5);
    if (pulse < 0.003) pulse = 0;
    spark.intensity = reduced ? 0 : pulse * 0.08;
    let held = 0;
    for (const r of rigs.values()) if (r.target > 0) held++;
    const actTarget = Math.min(1, held / 3);
    activity += (actTarget - activity) * (1 - Math.exp(-dt * (actTarget > activity ? 10 : 2.2)));
    if (Math.abs(activity - actTarget) < 0.002) activity = actTarget;
    glowMat.opacity = 0.05 + activity * 0.16 + pulse * 0.08;
    if (pulse > 0 || activity !== actTarget) animating = true;

    // Octave window bar glides to its keys.
    const kb = reduced ? 1 : 1 - Math.exp(-dt * 12);
    bar.x += (bar.tx - bar.x) * kb;
    bar.w += (bar.tw - bar.w) * kb;
    if (Math.abs(bar.x - bar.tx) > 1e-5 || Math.abs(bar.w - bar.tw) > 1e-5) animating = true;
    windowBar.position.x = bar.x;
    windowBar.scale.x = Math.max(0.001, bar.w);

    // View focus (piano ↔ keys) and the key numbers that only read up close.
    const focusT = view === "keys" ? 1 : 0;
    let refit = false;
    if (zoom !== targetZoom) {
      zoom = reduced ? targetZoom : zoom + (targetZoom - zoom) * (1 - Math.exp(-dt * 9));
      if (Math.abs(zoom - targetZoom) < 0.001) zoom = targetZoom;
      refit = true;
      animating = true;
    }
    if (focus !== focusT) {
      focus = reduced ? focusT : focus + (focusT - focus) * (1 - Math.exp(-dt * 5));
      if (Math.abs(focus - focusT) < 0.002) focus = focusT;
      refit = true;
      animating = true;
      tintLabels();
    }

    // Camera: eased towards its target; the frame is re-fitted as it turns.
    const kc = reduced ? 1 : 1 - Math.exp(-dt * 9);
    const daz = cam.taz - cam.az;
    const del = cam.tel - cam.el;
    if (Math.abs(daz) > 1e-4 || Math.abs(del) > 1e-4) {
      cam.az += daz * kc;
      cam.el += del * kc;
      fit();
      animating = true;
    } else if (daz !== 0 || del !== 0) {
      cam.az = cam.taz;
      cam.el = cam.tel;
      fit();
    } else if (refit) fit();
    if (zoom === targetZoom) anchor = null;

    renderer.render(scene, camera);
    // Adaptive quality: if continuous animation runs below ~40 fps, drop to 1× pixel ratio.
    if (wasAnimating && frameTimes.length < 40 && dprCap > 1) {
      frameTimes.push(dt);
      if (frameTimes.length === 40) {
        const avg = frameTimes.slice(8).reduce((a, b) => a + b, 0) / 32;
        if (avg > 1 / 40) {
          dprCap = 1;
          resize();
        }
      }
    }
    wasAnimating = animating;
    if (animating) invalidate();
    else last = 0;
  };

  // ---------------------------------------------------------------- input
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pick = (e: PointerEvent): number | null => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const midi = hit?.object.userData.midi;
    return typeof midi === "number" ? midi : null;
  };

  const playing = new Map<number, number | null>(); // pointerId → key under it
  let orbit: { id: number; x: number; y: number; az: number; el: number } | null = null;
  let hovered: number | null = null;
  let hoverQueued: PointerEvent | null = null;

  const setHover = (midi: number | null) => {
    if (midi === hovered) return;
    hovered = midi;
    o.onHover?.(midi);
    invalidate();
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const midi = pick(e);
    o.canvas.setPointerCapture(e.pointerId);
    if (midi !== null) {
      // Playing never moves the camera, even if the pointer slides off the keys.
      playing.set(e.pointerId, midi);
      const v = e.pointerType === "pen" && e.pressure > 0 ? 0.35 + e.pressure * 0.6 : 0.76;
      o.onPress(e.pointerId, midi, v);
      e.preventDefault();
    } else if (!orbit && playing.size === 0) {
      orbit = { id: e.pointerId, x: e.clientX, y: e.clientY, az: cam.taz, el: cam.tel };
      o.canvas.style.cursor = "grabbing";
    }
  };

  const onMove = (e: PointerEvent) => {
    if (playing.has(e.pointerId)) {
      const midi = pick(e);
      if (midi !== playing.get(e.pointerId)) {
        playing.set(e.pointerId, midi);
        o.onGlide(e.pointerId, midi);
      }
      return;
    }
    if (orbit && orbit.id === e.pointerId) {
      const k = 3.2 / Math.max(320, Math.min(W, 1400));
      const base = VIEWS[view];
      cam.taz = Math.min(base.az + AZ_RANGE, Math.max(base.az - AZ_RANGE, orbit.az - (e.clientX - orbit.x) * k));
      cam.tel = Math.min(EL_MAX, Math.max(EL_MIN, orbit.el + (e.clientY - orbit.y) * k));
      o.onViewChange?.(true);
      invalidate();
      return;
    }
    if (e.pointerType === "mouse" && !hoverQueued) {
      hoverQueued = e;
      requestAnimationFrame(() => {
        const ev = hoverQueued;
        hoverQueued = null;
        if (!ev || disposed) return;
        const midi = pick(ev);
        setHover(midi);
        o.canvas.style.cursor = midi !== null ? "pointer" : "grab";
      });
    }
  };

  const onUp = (e: PointerEvent) => {
    if (playing.has(e.pointerId)) {
      playing.delete(e.pointerId);
      o.onLift(e.pointerId);
    }
    if (orbit?.id === e.pointerId) {
      orbit = null;
      o.canvas.style.cursor = "grab";
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !playing.size) setHover(null);
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    o.onContextLost?.(true);
  };
  /** Zoom by `factor` around a canvas pixel; by default the middle of the free area. */
  const zoomAt = (factor: number, px?: number, py?: number) => {
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom * factor));
    if (next === targetZoom) return;
    const p = o.padding();
    px ??= p.left + Math.max(40, W - p.left - p.right) / 2;
    py ??= p.top + Math.max(40, H - p.top - p.bottom) / 2;
    anchor = { wx: viewX + (px - W / 2) * scale, wy: viewY + (H / 2 - py) * scale, px, py };
    targetZoom = next;
    o.onZoom?.(next);
    o.onViewChange?.(true);
    invalidate();
  };
  /** Back to the framed view; the travel shrinks back to nothing as the zoom glides out. */
  const unzoom = () => {
    anchor = null;
    targetZoom = 1;
    o.onZoom?.(1);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = o.canvas.getBoundingClientRect();
    // Lines and pages (Firefox) become pixels; a trackpad pinch arrives as Ctrl + small deltas.
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
    zoomAt(Math.exp(-Math.max(-100, Math.min(100, dy)) * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
  };
  const onRestored = () => {
    o.onContextLost?.(false);
    resize();
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      last = 0;
      invalidate();
    }
  };

  o.canvas.addEventListener("pointerdown", onDown);
  o.canvas.addEventListener("wheel", onWheel, { passive: false });
  o.canvas.addEventListener("pointermove", onMove);
  o.canvas.addEventListener("pointerup", onUp);
  o.canvas.addEventListener("pointercancel", onUp);
  o.canvas.addEventListener("lostpointercapture", onUp);
  o.canvas.addEventListener("pointerleave", onLeave);
  o.canvas.addEventListener("webglcontextlost", onLost);
  o.canvas.addEventListener("webglcontextrestored", onRestored);
  document.addEventListener("visibilitychange", onVisibility);
  const ro = new ResizeObserver(resize);
  ro.observe(o.canvas);
  o.canvas.style.cursor = "grab";

  // ---------------------------------------------------------------- api
  const placeLabels = () => {
    const notes = windowNotes(octave);
    labelMeshes.forEach((label, i) => {
      const midi = notes[i];
      label.userData.inRange = midi !== undefined && inRange(midi);
      if (label.userData.inRange) label.position.x = keyX(midi);
    });
    const c = cOf(octave);
    const x0 = keyX(c) - PITCH / 2;
    const x1 = keyX(Math.min(c + 12, 96)) + PITCH / 2;
    bar.tx = (x0 + x1) / 2;
    bar.tw = x1 - x0;
    if (bar.w === 0) {
      bar.x = bar.tx;
      bar.w = bar.tw;
    }
    tintLabels();
  };

  const tintLabels = () => {
    const notes = windowNotes(octave);
    labelMeshes.forEach((label, i) => {
      const mat = label.material as MeshBasicMaterial;
      const target = targets.includes(notes[i]);
      mat.color.copy(target ? accentC : fgC);
      mat.opacity = (target ? 1 : 0.6) * focus;
      label.visible = focus > 0.02 && label.userData.inRange !== false;
    });
  };

  const placeCues = () => {
    for (const cue of cues.values()) {
      cue.removeFromParent();
      cue.material.map?.dispose();
      cue.material.dispose();
    }
    cues.clear();
    for (const midi of targets) {
      const rig = rigs.get(midi);
      if (!rig) continue;
      const cue = makeKeyCue(noteName(midi), keyInstruction(midi, octave), o.font);
      // These positions are local to the same pivot as the physical key mesh.
      cue.position.set(0, rig.black ? 0.066 : 0.052, rig.black ? 0.248 : 0.31);
      rig.pivot.add(cue);
      cues.set(midi, cue);
    }
  };

  placeLabels();
  resize();

  const disposeObject = (root: Object3D) => {
    const seenM = new Set<Material>();
    root.traverse((obj) => {
      const m = obj as Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (seenM.has(mat)) continue;
        seenM.add(mat);
        (mat as MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
  };

  return {
    setKey(midi, down) {
      const r = rigs.get(midi);
      if (!r) return;
      r.target = down ? 1 : 0;
      if (down) {
        r.glow = 1;
        pulse = 1;
        spark.position.x = keyX(midi);
        strings.set(midi, { e: 1, head: 0, held: true });
      } else {
        const s = strings.get(midi);
        if (s) s.held = false;
      }
      invalidate();
    },
    setSustain(on) {
      sustainTarget = on ? 1 : 0;
      invalidate();
    },
    setOctave(oct) {
      octave = oct;
      placeLabels();
      placeCues();
      invalidate();
    },
    setTargets(midis) {
      if (targets.length === midis.length && targets.every((m, i) => m === midis[i])) return;
      targets = [...midis];
      targetSet = new Set(targets);
      tintLabels();
      placeCues();
      invalidate();
    },
    feedback(midi, correct) {
      feedback.set(midi, { correct, until: performance.now() + (correct ? 330 : 230) });
      invalidate();
    },
    clearFeedback() { feedback.clear(); invalidate(); },
    zoomBy: (factor) => zoomAt(factor),
    setView(v) {
      view = v;
      unzoom();
      cam.taz = VIEWS[v].az;
      cam.tel = VIEWS[v].el;
      o.onViewChange?.(v !== "piano");
      invalidate();
    },
    resetView() {
      view = "piano";
      unzoom();
      cam.taz = AZ0;
      cam.tel = EL0;
      o.onViewChange?.(false);
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      o.canvas.removeEventListener("pointerdown", onDown);
      o.canvas.removeEventListener("wheel", onWheel);
      o.canvas.removeEventListener("pointermove", onMove);
      o.canvas.removeEventListener("pointerup", onUp);
      o.canvas.removeEventListener("pointercancel", onUp);
      o.canvas.removeEventListener("lostpointercapture", onUp);
      o.canvas.removeEventListener("pointerleave", onLeave);
      o.canvas.removeEventListener("webglcontextlost", onLost);
      o.canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVisibility);
      disposeObject(scene);
      body.geometries.forEach((g) => g.dispose());
      body.materials.forEach((m) => m.dispose());
      keys.geometries.forEach((g) => g.dispose());
      keys.materials.forEach((m) => m.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
