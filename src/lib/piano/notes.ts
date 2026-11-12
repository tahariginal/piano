/**
 * The note model shared by audio, scene, tutorial and recording.
 * A note is a MIDI number (C4 = 60). Everything else is derived from it.
 */

export const LOWEST = 36; // C2
export const HIGHEST = 96; // C7
export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6; // keys 1–8 span C6–C7 at the top
export const DEFAULT_OCTAVE = 4;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const SOLFEGE = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
export const isBlack = (midi: number) => BLACK.has(pitchClass(midi));
/** "C#4" */
export const noteName = (midi: number) => `${NAMES[pitchClass(midi)]}${octaveOf(midi)}`;
/** "C#" — the name without the octave. */
export const letterName = (midi: number) => NAMES[pitchClass(midi)];
export const solfege = (midi: number) => SOLFEGE[pitchClass(midi)];
export const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const inRange = (midi: number) => midi >= LOWEST && midi <= HIGHEST;
export const clampOctave = (o: number) => Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, Math.round(o)));
/** MIDI number of C in an octave: C4 → 60. */
export const cOf = (octave: number) => (octave + 1) * 12;

/** Every key on the instrument, low to high. */
export const KEYBOARD: readonly number[] = Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i);

/* ------------------------------------------------------------------
   Physical keyboard. Mapped by `KeyboardEvent.code`, so the layout
   (AZERTY, QWERTZ, Arabic…) never changes which note a key plays.
   ------------------------------------------------------------------ */

/** Number key → semitone offset from C of the current octave. */
const WHITE_KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 2, Digit3: 4, Digit4: 5, Digit5: 7, Digit6: 9, Digit7: 11, Digit8: 12,
  Numpad1: 0, Numpad2: 2, Numpad3: 4, Numpad4: 5, Numpad5: 7, Numpad6: 9, Numpad7: 11, Numpad8: 12,
};
/** Shift + number key → the black key just above that white key. 3, 7 and 8 have none. */
const BLACK_KEYS: Record<string, number> = { Digit1: 1, Digit2: 3, Digit4: 6, Digit5: 8, Digit6: 10 };

export const OCTAVE_DOWN = "BracketLeft";
export const OCTAVE_UP = "BracketRight";

export type KeyResolution =
  | { kind: "note"; midi: number }
  /** A number key that has no black key above it (Shift + 3, 7, 8). */
  | { kind: "no-black"; digit: number }
  | { kind: "none" };

/** Resolve a physical key to the note it plays in `octave`. */
export function resolveKey(code: string, shift: boolean, octave: number): KeyResolution {
  const c = cOf(clampOctave(octave));
  if (shift && code.startsWith("Digit")) {
    const off = BLACK_KEYS[code];
    if (off === undefined) return code in WHITE_KEYS ? { kind: "no-black", digit: Number(code.slice(5)) } : { kind: "none" };
    return { kind: "note", midi: c + off };
  }
  const off = WHITE_KEYS[code];
  return off === undefined ? { kind: "none" } : { kind: "note", midi: c + off };
}

/**
 * The key hint for a note in the current octave: "1", "⇧1", or null when the
 * note is outside the eight-key window.
 */
export function shortcutFor(midi: number, octave: number): string | null {
  const off = midi - cOf(clampOctave(octave));
  for (const [code, o] of Object.entries(WHITE_KEYS)) if (code.startsWith("Digit") && o === off) return code.slice(5);
  for (const [code, o] of Object.entries(BLACK_KEYS)) if (o === off) return `⇧${code.slice(5)}`;
  return null;
}

/** The thirteen notes reachable from the number keys in an octave, low to high. */
export function windowNotes(octave: number): number[] {
  const c = cOf(clampOctave(octave));
  return Array.from({ length: 13 }, (_, i) => c + i);
}
