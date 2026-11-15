import { melodyPitches, type Melody } from "./lessons";
import { clampOctave, octaveOf, pitchClass, shortcutFor } from "./notes";
import type { Feedback } from "./tutorial";
import { melodyTiming } from "./timeline";

export type LearningMode = "step" | "practice" | "free";
export type LearningState = {
  index: number;
  hits: number[];
  correct: number;
  wrong: number;
  missed: number;
  done: boolean;
};
export const learningStart = (index = 0): LearningState => ({ index, hits: [], correct: 0, wrong: 0, missed: 0, done: false });

/** Keep a melody in one number-key window when possible, even if it starts on high C. */
export function startingOctave(m: Melody): number {
  const pitches = m.notes.flatMap(melodyPitches);
  const lowest = clampOctave(octaveOf(Math.min(...pitches)));
  return pitches.every((p) => shortcutFor(p, lowest) !== null)
    ? lowest
    : clampOctave(octaveOf(m.notes[0].midi));
}

export function learningInput(m: Melody, s: LearningState, midi: number, held: readonly number[], end: number, timed = false): { state: LearningState; feedback: Feedback } {
  if (s.done || !m.notes[s.index]) return { state: s, feedback: { kind: "none" } };
  const pitches = melodyPitches(m.notes[s.index]);
  if (!pitches.includes(midi)) {
    return { state: { ...s, wrong: s.wrong + 1 }, feedback: { kind: pitches.some((p) => pitchClass(p) === pitchClass(midi)) ? "wrong-octave" : "wrong", midi, expected: pitches } };
  }
  // A timed event is scored once; playing it again is harmless.
  if (s.hits.length === pitches.length) return { state: s, feedback: { kind: "none" } };
  const hits = pitches.filter((p) => held.includes(p));
  const complete = hits.length === pitches.length;
  const correct = s.correct + (complete ? 1 : 0);
  const index = complete && !timed ? s.index + 1 : s.index;
  const done = index >= end;
  return {
    state: { ...s, index, correct, hits: complete && !timed ? [] : hits, done },
    feedback: { kind: done ? "complete" : "correct", midi },
  };
}

export function learningRelease(s: LearningState, held: readonly number[], timed: boolean, pitches: readonly number[]): LearningState {
  if (timed && s.hits.length === pitches.length) return s; // keep a scored timed event
  const hits = s.hits.filter((p) => held.includes(p));
  return hits.length === s.hits.length ? s : { ...s, hits };
}

/** Move only by the playback clock. Missed events never count as correct. */
export function practiceAdvance(m: Melody, s: LearningState, seconds: number, end: number, bpm: number): LearningState {
  const timing = melodyTiming(m, bpm);
  let next = s;
  while (!next.done && next.index < end && seconds >= timing[next.index].end) {
    const missed = next.missed + (next.hits.length === melodyPitches(m.notes[next.index]).length ? 0 : 1);
    const index = next.index + 1;
    next = { ...next, index, hits: [], missed, done: index >= end };
  }
  return next;
}

/** Exact instructions for pitches outside the current keyboard window. */
export function keyInstruction(midi: number, octave: number): string {
  const key = shortcutFor(midi, octave);
  if (key) return key;
  const target = clampOctave(octaveOf(midi));
  const delta = target - octave;
  return `${delta > 0 ? "]" : "["}${Math.abs(delta) > 1 ? ` ×${Math.abs(delta)}` : ""} then ${shortcutFor(midi, target) ?? "click key"}`;
}
