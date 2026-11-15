/**
 * PianoController — the one authoritative record of which notes are down.
 *
 * Every input path (physical keys, pointer, replay, demo) "holds" a note under
 * its own holder id. A note sounds while at least one holder holds it, so two
 * input paths can never trigger it twice. Audio is fired first, synchronously,
 * then listeners (scene, UI, tutorial, recorder) are told.
 */

import type { PianoAudioEngine } from "./audio";
import { clampOctave, DEFAULT_OCTAVE, inRange } from "./notes";

export type Source = "key" | "pointer" | "replay" | "demo";
/** Learner input — what lessons check and what the recorder captures. */
export const isLive = (s: Source) => s === "key" || s === "pointer";

export type NoteEvent = {
  type: "on" | "off";
  midi: number;
  velocity: number;
  source: Source;
  /** performance.now() when the note sounds. */
  time: number;
};

export type ControlState = { octave: number; sustain: boolean; pedal: boolean };

type Listener = (e: NoteEvent) => void;
type Held = { midi: number; source: Source; pending?: { id: number; event: NoteEvent } };

export class PianoController {
  readonly engine: PianoAudioEngine;
  private holders = new Map<string, Held>();
  private count = new Map<number, number>();
  private noteListeners = new Set<Listener>();
  private inputListeners = new Set<Listener>();
  private stateListeners = new Set<(s: ControlState) => void>();
  /** Latched sustain (the toggle) and the held pedal (Space) combine. */
  private state: ControlState = { octave: DEFAULT_OCTAVE, sustain: false, pedal: false };

  constructor(engine: PianoAudioEngine) {
    this.engine = engine;
  }

  onNote(fn: Listener) {
    this.noteListeners.add(fn);
    return () => {
      this.noteListeners.delete(fn);
    };
  }

  onState(fn: (s: ControlState) => void) {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  /** Every learner gesture, even when a demo already holds the same pitch. */
  onInput(fn: Listener) {
    this.inputListeners.add(fn);
    return () => { this.inputListeners.delete(fn); };
  }

  get liveActive(): number[] {
    return [...new Set([...this.holders.values()].filter((h) => isLive(h.source)).map((h) => h.midi))];
  }

  get controls() {
    return this.state;
  }

  /** Notes currently down, low to high. */
  get active(): number[] {
    return [...this.count.keys()].sort((a, b) => a - b);
  }

  isDown(midi: number) {
    return this.count.has(midi);
  }

  /**
   * Hold `midi` under `holder`. Returns true when the note was newly struck.
   * `at` (audio-clock seconds) schedules the strike precisely; listeners hear
   * about it when it actually sounds.
   */
  press(holder: string, midi: number, velocity: number, source: Source, at?: number): boolean {
    if (!inRange(midi)) return false;
    const prev = this.holders.get(holder);
    if (prev?.midi === midi) return false; // key auto-repeat, or a pointer still on the same key
    if (prev) this.release(holder);
    const rec: Held = { midi, source };
    this.holders.set(holder, rec);
    const n = this.count.get(midi) ?? 0;
    this.count.set(midi, n + 1);
    if (n > 0) {
      if (isLive(source)) this.emitInput("on", midi, velocity, source);
      return false; // already sounding from another input
    }
    this.engine.noteOn(midi, velocity, at);
    const on: NoteEvent = { type: "on", midi, velocity, source, time: 0 };
    const delay = at === undefined ? 0 : (at - this.engine.now) * 1000;
    if (delay < 4) this.emit(on);
    else {
      rec.pending = { id: window.setTimeout(() => (rec.pending = undefined, this.emit(on)), delay), event: on };
    }
    if (isLive(source)) this.emitInput("on", midi, velocity, source);
    return true;
  }

  /** Let go of whatever `holder` holds. */
  release(holder: string) {
    const h = this.holders.get(holder);
    if (!h) return;
    this.holders.delete(holder);
    if (isLive(h.source)) this.emitInput("off", h.midi, 0, h.source);
    const n = (this.count.get(h.midi) ?? 1) - 1;
    if (h.pending) {
      window.clearTimeout(h.pending.id);
      // Still sounding for another holder: the strike happened, so report it now.
      if (n > 0) this.emit(h.pending.event);
    }
    if (n > 0) {
      this.count.set(h.midi, n);
      return;
    }
    this.count.delete(h.midi);
    this.engine.noteOff(h.midi);
    // Listeners never saw a strike that was cancelled before it sounded.
    if (!h.pending) this.emit({ type: "off", midi: h.midi, velocity: 0, source: h.source, time: 0 });
  }

  /** Release every holder whose id starts with `prefix` ("key:", "replay:"…), or everything. */
  releaseAll(prefix = "") {
    for (const id of [...this.holders.keys()]) if (id.startsWith(prefix)) this.release(id);
    if (!prefix) {
      this.setPedal(false);
      this.engine.allNotesOff();
    }
  }

  setOctave(o: number) {
    const octave = clampOctave(o);
    if (octave !== this.state.octave) this.update({ octave });
  }

  shiftOctave(delta: number) {
    this.setOctave(this.state.octave + delta);
  }

  /** The latched sustain toggle. */
  setSustain(on: boolean) {
    if (on !== this.state.sustain) this.update({ sustain: on });
  }

  /** The momentary pedal (held Space, or a recorded pedal during replay). */
  setPedal(on: boolean) {
    if (on !== this.state.pedal) this.update({ pedal: on });
  }

  private update(patch: Partial<ControlState>) {
    this.state = { ...this.state, ...patch };
    this.engine.setSustain(this.state.sustain || this.state.pedal);
    this.stateListeners.forEach((fn) => fn(this.state));
  }

  private emit(e: NoteEvent) {
    e.time = performance.now();
    this.noteListeners.forEach((fn) => fn(e));
  }

  private emitInput(type: "on" | "off", midi: number, velocity: number, source: Source) {
    const e = { type, midi, velocity, source, time: performance.now() };
    this.inputListeners.forEach((fn) => fn(e));
  }

  dispose() {
    this.releaseAll();
    this.noteListeners.clear();
    this.inputListeners.clear();
    this.stateListeners.clear();
  }
}
