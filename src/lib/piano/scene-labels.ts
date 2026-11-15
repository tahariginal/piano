/**
 * Small labels drawn on canvas textures: the number-key hints
 * for the current octave, printed on the fallboard.
 */

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from "three";

/** Camera-facing cue anchored to the moving key, including raised black keys. */
export function makeKeyCue(note: string, shortcut: string, font: string) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 176;
  const g = c.getContext("2d")!;
  g.fillStyle = "#101722";
  g.fillRect(0, 0, c.width, 154);
  g.strokeStyle = "#60a5fa";
  g.lineWidth = 5;
  g.strokeRect(3, 3, c.width - 6, 148);
  g.fillStyle = "#60a5fa";
  g.beginPath(); g.moveTo(178, 154); g.lineTo(206, 154); g.lineTo(192, 176); g.fill();
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.font = `500 76px ${font}, monospace`;
  g.fillText(note, 192, 70);
  g.fillStyle = "#93c5fd";
  g.font = `500 ${shortcut.length > 12 ? 25 : shortcut.length > 4 ? 38 : 60}px ${font}, monospace`;
  g.fillText(shortcut, 192, 135);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(0.055, 0.026, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export function labelTexture(text: string, font: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `500 ${text.length > 1 ? 54 : 74}px ${font}, ui-monospace, monospace`;
  g.fillText(text, 64, 68);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A label plane facing +z (upright), or lying flat when `flat`. */
export function makeLabel(text: string, font: string, size: number, flat = false) {
  const geo = new PlaneGeometry(size, size);
  if (flat) geo.rotateX(-Math.PI / 2);
  const mat = new MeshBasicMaterial({ map: labelTexture(text, font), transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}


/** Radial gradient on a canvas, for the contact shadow and the floor glow. */
export function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
