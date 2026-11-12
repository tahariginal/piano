import { test } from "node:test";
import assert from "node:assert/strict";
import { lessons, melodies } from "../src/lib/piano/lessons";
import { accuracy, lessonExpected, lessonInput, lessonRelease, lessonStart, melodyInput, melodyStart } from "../src/lib/piano/tutorial";
import { inRange } from "../src/lib/piano/notes";

const first = lessons[0];

test("lesson 01 advances only on correct notes", () => {
  let s = lessonStart();
  assert.deepEqual(lessonExpected(first, s), [60]);

  let r = lessonInput(first, s, 62, [62]); // Re instead of Do
  assert.equal(r.feedback.kind, "wrong");
  assert.equal(r.state.step, 0, "a wrong note never advances");
  assert.equal(r.state.mistakes, 1);

  r = lessonInput(first, r.state, 60, [60]);
  assert.equal(r.feedback.kind, "step-done");
  assert.equal(r.state.step, 1);
  s = r.state;
  for (const m of [62, 64]) s = lessonInput(first, s, m, [m]).state;
  assert.equal(s.step, 3);

  // 1 → 2 → 3 → 2 → 1 with one slip in the middle
  for (const m of [60, 62]) s = lessonInput(first, s, m, [m]).state;
  r = lessonInput(first, s, 65, [65]);
  assert.equal(r.feedback.kind, "wrong");
  assert.equal(r.state.index, 2, "position kept after a slip");
  s = r.state;
  for (const m of [64, 62]) s = lessonInput(first, s, m, [m]).state;
  r = lessonInput(first, s, 60, [60]);
  assert.equal(r.feedback.kind, "complete");
  assert.ok(r.state.done);
  assert.deepEqual(lessonExpected(first, r.state), []);
  assert.equal(lessonInput(first, r.state, 60, [60]).feedback.kind, "none", "a finished lesson ignores input");
});

test("right note in the wrong octave gets its own feedback", () => {
  const r = lessonInput(first, lessonStart(), 72, [72]);
  assert.equal(r.feedback.kind, "wrong-octave");
  assert.equal(r.state.step, 0);
});

test("chord steps need the notes held together", () => {
  const chords = lessons.find((l) => l.id === "first-chords")!;
  let s = lessonStart();
  let r = lessonInput(chords, s, 60, [60]);
  assert.equal(r.feedback.kind, "correct");
  r = lessonInput(chords, r.state, 64, [60, 64]);
  assert.equal(r.feedback.kind, "correct");
  assert.deepEqual(lessonExpected(chords, r.state), [67]);
  // Lifting C before G lands means C must be played again.
  s = lessonRelease(chords, r.state, [64]);
  assert.deepEqual(lessonExpected(chords, s), [60, 67]);
  r = lessonInput(chords, s, 67, [64, 67]);
  assert.equal(r.feedback.kind, "correct", "not complete without C");
  r = lessonInput(chords, r.state, 60, [60, 64, 67]);
  assert.equal(r.feedback.kind, "step-done");
  assert.equal(r.state.step, 1);
  r = lessonInput(chords, r.state, 62, [62]);
  assert.equal(r.feedback.kind, "wrong", "D is not in F major");
});

test("every lesson and melody stays on the instrument", () => {
  for (const l of lessons) for (const st of l.steps) for (const m of st.notes) assert.ok(inRange(m), `${l.id} ${m}`);
  for (const m of melodies) for (const n of m.notes) assert.ok(inRange(n.midi) && n.beats > 0, m.id);
});

test("melody practice scores accuracy and completion, in order", () => {
  const m = melodies.find((x) => x.id === "warm-up")!;
  let s = melodyStart();
  assert.equal(accuracy(s), null);
  let r = melodyInput(m, s, 62); // D first: wrong
  assert.equal(r.feedback.kind, "wrong");
  assert.equal(r.state.index, 0, "a wrong note is never marked as played");
  s = r.state;
  for (const n of m.notes) {
    r = melodyInput(m, s, n.midi);
    s = r.state;
  }
  assert.equal(r.feedback.kind, "complete");
  assert.ok(s.done);
  assert.equal(s.correct, m.notes.length);
  assert.equal(s.wrong, 1);
  assert.equal(accuracy(s), Math.round((m.notes.length / (m.notes.length + 1)) * 100));
  assert.equal(melodyInput(m, s, 60).feedback.kind, "none");
});
