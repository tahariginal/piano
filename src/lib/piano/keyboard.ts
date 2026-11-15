/**
 * KeyboardController — physical keys → controller holds.
 *
 * Each physical key holds the note it struck under `key:<code>`, so releasing
 * the key always releases that note, whatever happened to the octave in between.
 */

import type { PianoController } from "./controller";
import { OCTAVE_DOWN, OCTAVE_UP, resolveKey } from "./notes";

export type KeyboardHooks = {
  /** First gesture: start or resume audio. */
  onGesture?: () => void;
  /** `-` / `=` (or numpad − / +): zoom the view out (-1) or in (1). */
  onZoom?: (direction: 1 | -1) => void;
};

const KEY_VELOCITY = 0.78;
const ZOOM_KEYS: Record<string, 1 | -1> = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };

/** Typing into a field, or a focused control that uses the key itself. */
function isEditable(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null;
}
function usesSpace(t: EventTarget | null) {
  return t instanceof HTMLElement && t.closest("button, a, [role='button'], [role='tab'], [role='switch'], summary, input, textarea, select") !== null;
}

export function attachKeyboard(ctrl: PianoController, hooks: KeyboardHooks = {}) {
  let spaceDown = false;

  const onDown = (e: KeyboardEvent) => {
    if (e.isComposing || isEditable(e.target)) return;
    // Cmd/Ctrl/Alt chords belong to the browser and OS (Cmd+1 switches tabs).
    // macOS also swallows key-ups while Cmd is down, so let go of everything now.
    if (e.key === "Meta" || e.key === "Control" || e.key === "Alt") {
      ctrl.releaseAll("key:");
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
      e.preventDefault();
      if (!e.repeat) ctrl.shiftOctave(e.code === OCTAVE_UP ? 1 : -1);
      return;
    }
    if (e.code in ZOOM_KEYS) {
      e.preventDefault();
      hooks.onZoom?.(ZOOM_KEYS[e.code]); // holding the key keeps zooming
      return;
    }
    if (e.code === "Space") {
      if (usesSpace(e.target)) return;
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        ctrl.setPedal(true);
      }
      return;
    }

    const r = resolveKey(e.code, ctrl.controls.octave);
    if (r.kind === "none") return;
    e.preventDefault();
    if (e.repeat) return; // a held key never re-strikes
    hooks.onGesture?.();
    // Until the samples are decoded and audio runs, a key only starts the engine:
    // the instrument never pretends to play.
    if (!ctrl.engine.ready) return;
    ctrl.press(`key:${e.code}`, r.midi, KEY_VELOCITY, "key");
  };

  const onUp = (e: KeyboardEvent) => {
    if (e.code === "Space" && spaceDown) {
      spaceDown = false;
      ctrl.setPedal(false);
      return;
    }
    ctrl.release(`key:${e.code}`);
  };

  /** Focus left the page: key-ups will never arrive, so nothing may stay down. */
  const letGo = () => {
    spaceDown = false;
    ctrl.releaseAll("key:");
    ctrl.releaseAll("pointer:");
    ctrl.setPedal(false);
  };
  const onVisibility = () => document.hidden && letGo();

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", letGo);
  window.addEventListener("pagehide", letGo);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", letGo);
    window.removeEventListener("pagehide", letGo);
    document.removeEventListener("visibilitychange", onVisibility);
    letGo();
  };
}
