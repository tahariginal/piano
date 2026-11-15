import { test } from "node:test";
import assert from "node:assert/strict";
import { melodies, melodyPitches, type Melody } from "../src/lib/piano/lessons";
import { learningStart, learningInput, learningRelease, practiceAdvance, keyInstruction, startingOctave } from "../src/lib/piano/learning";
import { melodyTimeline, melodyTiming } from "../src/lib/piano/timeline";
import { inRange, octaveOf, resolveKey, shortcutFor, clampOctave } from "../src/lib/piano/notes";

const warmup = melodies.find((m) => m.id === "warm-up")!;
const harmony = melodies.find((m) => m.id === "little-chords")!;

test("a melody beginning on high C keeps its lower notes in the same keyboard window", () => {
  const m = melodies.find((m) => m.id === "despacito-excerpt")!;
  const octave = startingOctave(m);
  assert.equal(octave, 4);
  assert.equal(shortcutFor(m.notes[0].midi, octave), "8");
  for (const note of m.notes) assert.match(shortcutFor(note.midi, octave)!, /^[1-8]$/);
  assert.equal(startingOctave(melodies.find((m) => m.id === "octave-echo")!), 4);
});

test("every melody can be learned start to finish, with playable pitch/octave mappings", () => {
  for (const m of melodies) {
    let s = learningStart();
    for (const note of m.notes) {
      const held: number[] = [];
      for (const pitch of melodyPitches(note)) {
        assert.ok(inRange(pitch));
        const octave = clampOctave(octaveOf(pitch));
        const key = shortcutFor(pitch, octave)!;
        assert.deepEqual(resolveKey(/^\d$/.test(key) ? `Digit${key}` : `Key${key}`, octave), { kind: "note", midi: pitch });
        held.push(pitch);
        s = learningInput(m, s, pitch, held, m.notes.length).state;
      }
    }
    assert.equal(s.done, true, m.id);
    assert.equal(s.correct, m.notes.length);
    assert.equal(s.wrong, 0);
    assert.equal(learningInput(m, s, 60, [60], m.notes.length).state, s);
  }
});

test("mistakes and wrong octaves do not advance; a repeat needs another strike", () => {
  let s = learningStart();
  const wrong = learningInput(warmup, s, 61, [61], warmup.notes.length);
  assert.equal(wrong.feedback.kind, "wrong");
  const octave = learningInput(warmup, wrong.state, 72, [72], warmup.notes.length);
  assert.equal(octave.feedback.kind, "wrong-octave");
  assert.equal(octave.state.index, 0);
  s = learningInput(warmup, octave.state, 60, [60], warmup.notes.length).state;
  assert.equal(s.index, 1);
  assert.equal(s.wrong, 2);
});

test("chords require live notes held simultaneously, including after a release", () => {
  let s = learningInput(harmony, learningStart(), 60, [60], harmony.notes.length).state;
  s = learningInput(harmony, s, 64, [60, 64], harmony.notes.length).state;
  s = learningRelease(s, [64], false, [60, 64, 67]);
  s = learningInput(harmony, s, 67, [64, 67], harmony.notes.length).state;
  assert.equal(s.index, 0);
  assert.deepEqual(s.hits, [64, 67]);
  s = learningInput(harmony, s, 60, [60, 64, 67], harmony.notes.length).state;
  assert.equal(s.index, 1);
  assert.equal(s.correct, 1);
});

test("practice follows time, scores once per event, and counts missed events", () => {
  let s = learningStart();
  s = learningInput(warmup, s, 60, [60], warmup.notes.length, true).state;
  assert.equal(s.index, 0, "playing correctly does not move the clock");
  s = learningRelease(s, [], true, [60]);
  s = learningInput(warmup, s, 60, [60], warmup.notes.length, true).state;
  assert.equal(s.correct, 1, "repeated presses cannot inflate the score");
  s = practiceAdvance(warmup, s, 2.01, warmup.notes.length, 60);
  assert.equal(s.index, 2);
  assert.equal(s.missed, 1);
  s = practiceAdvance(warmup, s, Infinity, warmup.notes.length, 60);
  assert.equal(s.done, true);
  assert.equal(s.correct + s.missed, warmup.notes.length);
});

test("a selected section completes at its boundary", () => {
  let s = learningStart(4);
  for (const n of warmup.notes.slice(4, 8)) s = learningInput(warmup, s, n.midi, [n.midi], 8).state;
  assert.equal(s.done, true);
  assert.equal(s.index, 8);
  assert.equal(s.correct, 4);
});

test("timelines preserve rests, durations, octave and simultaneous chord starts", () => {
  const m: Melody = { id: "test", title: "test", credit: "test", difficulty: "Easy", bpm: 60,
    notes: [{ midi: 61, chord: [65, 68], beats: 2, duration: 1 }, { midi: 76, at: 4, beats: 1, duration: 0.5 }] };
  assert.deepEqual(melodyTiming(m), [{ start: 0, end: 2, release: 1 }, { start: 4, end: 5, release: 4.5 }]);
  const events = melodyTimeline(m);
  assert.deepEqual(events.filter((e) => e.type === "on").map((e) => [e.t, e.midi, e.octave]), [[0, 61, 4], [0, 65, 4], [0, 68, 4], [4, 76, 5]]);
  assert.deepEqual(melodyTiming(m, 120).map((t) => t.start), [0, 2]);
  assert.equal(keyInstruction(61, 4), "X");
  assert.equal(keyInstruction(82, 4), "] then N");
  assert.equal(keyInstruction(76, 4), "] then 3");
  assert.equal(keyInstruction(36, 4), "[ ×2 then 1");
  assert.equal(keyInstruction(72, 4), "8");
  assert.equal(keyInstruction(96, 4), "] ×2 then 8");
});
