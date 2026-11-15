import { test } from "node:test";
import assert from "node:assert/strict";
import { frequency, isBlack, KEYBOARD, noteName, resolveKey, shortcutFor, solfege, windowNotes } from "../src/lib/piano/notes";
import { nearestSample, SAMPLE_NOTES, sampleFile } from "../src/lib/piano/samples";

test("number keys 1–8 play C4–C5 in octave 4", () => {
  const want = [60, 62, 64, 65, 67, 69, 71, 72];
  for (let d = 1; d <= 8; d++) assert.deepEqual(resolveKey(`Digit${d}`, 4), { kind: "note", midi: want[d - 1] });
  assert.equal(noteName(60), "C4");
  assert.equal(solfege(67), "Sol");
  assert.equal(noteName(72), "C5");
});

test("X C V B N play the black keys; other letters play nothing", () => {
  const want: Record<string, string> = { X: "C#4", C: "D#4", V: "F#4", B: "G#4", N: "A#4" };
  for (const [k, name] of Object.entries(want)) {
    const r = resolveKey(`Key${k}`, 4);
    assert.equal(r.kind, "note");
    if (r.kind === "note") {
      assert.equal(noteName(r.midi), name);
      assert.ok(isBlack(r.midi));
    }
  }
  for (const k of ["Z", "M", "Q"]) assert.deepEqual(resolveKey(`Key${k}`, 4), { kind: "none" });
});

test("mapping uses physical codes and follows the octave", () => {
  assert.deepEqual(resolveKey("Digit1", 5), { kind: "note", midi: 72 });
  assert.deepEqual(resolveKey("Digit1", 2), { kind: "note", midi: 36 });
  assert.deepEqual(resolveKey("Digit8", 6), { kind: "note", midi: 96 });
  assert.deepEqual(resolveKey("Digit1", 99), { kind: "note", midi: 96 - 12 }, "octave is clamped to 6");
  assert.deepEqual(resolveKey("Numpad3", 4), { kind: "note", midi: 64 });
  assert.deepEqual(resolveKey("KeyA", 4), { kind: "none" });
  assert.deepEqual(resolveKey("Digit9", 4), { kind: "none" });
});

test("shortcut hints", () => {
  assert.equal(shortcutFor(60, 4), "1");
  assert.equal(shortcutFor(61, 4), "X");
  assert.equal(shortcutFor(70, 4), "N");
  assert.equal(shortcutFor(72, 4), "8");
  assert.equal(shortcutFor(73, 4), null);
  assert.equal(shortcutFor(72, 5), "1");
  assert.equal(windowNotes(4).length, 13);
});

test("pitch reference", () => {
  assert.ok(Math.abs(frequency(69) - 440) < 1e-9);
  assert.ok(Math.abs(frequency(60) - 261.6256) < 1e-3);
});

test("21 samples cover every key within one semitone", () => {
  assert.equal(SAMPLE_NOTES.length, 21);
  assert.equal(sampleFile(63), "Ds4.mp3");
  assert.equal(sampleFile(66), "Fs4.mp3");
  for (const m of KEYBOARD) {
    const p = nearestSample(m);
    assert.ok(p && Math.abs(p.shift) <= 1, `${noteName(m)} shift ${p?.shift}`);
    assert.equal(p!.sample + p!.shift, m);
  }
});
