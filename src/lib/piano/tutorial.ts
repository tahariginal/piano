/**
 * TutorialEngine — pure state transitions for guided lessons and melody
 * practice. No timers, no DOM: the UI feeds it live note-ons and renders the
 * result. It checks which notes were played and in what order; it does not
 * judge rhythm.
 */

import type { Lesson, Melody } from "./lessons";
import { pitchClass } from "./notes";

export type Feedback =
  | { kind: "none" }
  | { kind: "correct"; midi: number }
  /** A step's last note (or chord) landed; the lesson moved on. */
  | { kind: "step-done"; midi: number }
  | { kind: "complete"; midi: number }
  | { kind: "wrong"; midi: number; expected: number[] }
  /** Right note name, wrong octave — usually the [ ] keys. */
  | { kind: "wrong-octave"; midi: number; expected: number[] };

/* ---------------------------------------------------------------- lessons */

export type LessonState = {
  step: number;
  /** Position inside a sequence step. */
  index: number;
  /** Chord notes already down in a chord step. */
  chordHits: number[];
  mistakes: number;
  done: boolean;
};

export const lessonStart = (): LessonState => ({ step: 0, index: 0, chordHits: [], mistakes: 0, done: false });

export const atStep = (step: number): LessonState => ({ ...lessonStart(), step: Math.max(0, step) });

/** The notes the learner should play next. */
export function lessonExpected(lesson: Lesson, s: LessonState): number[] {
  if (s.done) return [];
  const step = lesson.steps[s.step];
  if (!step) return [];
  return step.kind === "chord" ? step.notes.filter((n) => !s.chordHits.includes(n)) : [step.notes[s.index]];
}

function miss(midi: number, expected: number[]): Feedback {
  return expected.some((e) => pitchClass(e) === pitchClass(midi))
    ? { kind: "wrong-octave", midi, expected }
    : { kind: "wrong", midi, expected };
}

function nextStep(lesson: Lesson, s: LessonState, midi: number): { state: LessonState; feedback: Feedback } {
  if (s.step + 1 >= lesson.steps.length) {
    return { state: { ...s, index: 0, chordHits: [], done: true }, feedback: { kind: "complete", midi } };
  }
  return { state: { ...s, step: s.step + 1, index: 0, chordHits: [] }, feedback: { kind: "step-done", midi } };
}

/**
 * Feed one live note-on. `held` is every note down right now (including this one),
 * which is how chords are recognised.
 */
export function lessonInput(lesson: Lesson, s: LessonState, midi: number, held: readonly number[]): { state: LessonState; feedback: Feedback } {
  if (s.done) return { state: s, feedback: { kind: "none" } };
  const step = lesson.steps[s.step];
  if (!step) return { state: s, feedback: { kind: "none" } };

  if (step.kind === "chord") {
    if (!step.notes.includes(midi)) {
      return { state: { ...s, mistakes: s.mistakes + 1 }, feedback: miss(midi, lessonExpected(lesson, s)) };
    }
    // Only notes still held count: a chord is played together, not one by one.
    const hits = step.notes.filter((n) => held.includes(n));
    if (hits.length === step.notes.length) return nextStep(lesson, s, midi);
    return { state: { ...s, chordHits: hits }, feedback: { kind: "correct", midi } };
  }

  const expected = step.notes[s.index];
  if (midi !== expected) return { state: { ...s, mistakes: s.mistakes + 1 }, feedback: miss(midi, [expected]) };
  if (s.index + 1 >= step.notes.length) return nextStep(lesson, s, midi);
  return { state: { ...s, index: s.index + 1 }, feedback: { kind: "correct", midi } };
}

/** A note was lifted during a chord step: it no longer counts as held. */
export function lessonRelease(lesson: Lesson, s: LessonState, held: readonly number[]): LessonState {
  const step = lesson.steps[s.step];
  if (s.done || !step || step.kind !== "chord") return s;
  const hits = step.notes.filter((n) => held.includes(n));
  return hits.length === s.chordHits.length ? s : { ...s, chordHits: hits };
}

/* ---------------------------------------------------------------- melodies */

export type MelodyState = { index: number; correct: number; wrong: number; done: boolean };

export const melodyStart = (): MelodyState => ({ index: 0, correct: 0, wrong: 0, done: false });

export const melodyExpected = (m: Melody, s: MelodyState): number | null => (s.done ? null : (m.notes[s.index]?.midi ?? null));

export function melodyInput(m: Melody, s: MelodyState, midi: number): { state: MelodyState; feedback: Feedback } {
  const expected = melodyExpected(m, s);
  if (expected === null) return { state: s, feedback: { kind: "none" } };
  if (midi !== expected) return { state: { ...s, wrong: s.wrong + 1 }, feedback: miss(midi, [expected]) };
  const index = s.index + 1;
  const done = index >= m.notes.length;
  return { state: { ...s, index, correct: s.correct + 1, done }, feedback: { kind: done ? "complete" : "correct", midi } };
}

/** Correct notes over every note played, 0–100. Null before the first note. */
export function accuracy(s: MelodyState): number | null {
  const total = s.correct + s.wrong;
  return total === 0 ? null : Math.round((s.correct / total) * 100);
}
