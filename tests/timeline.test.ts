import { test } from "node:test";
import assert from "node:assert/strict";
import { melodies } from "../src/lib/piano/lessons";
import { melodyTimeline, Recorder, sortEvents, stepTimeline, timelineEnd } from "../src/lib/piano/timeline";

test("recorder keeps timing, chords, velocity and octave", () => {
  const r = new Recorder();
  r.begin(1000, false);
  r.note("on", 60, 0.8, 4, 1000);
  r.note("on", 64, 0.8, 4, 1004); // chord, 4 ms apart
  r.note("on", 67, 0.6, 4, 1006);
  r.note("off", 60, 0, 4, 1500);
  r.note("off", 64, 0, 4, 1500);
  r.sustain(true, 1600);
  r.note("on", 72, 0.7, 5, 2000);
  const take = r.end(2600); // 67 and 72 still down, pedal still on
  assert.equal(take.notes, 4);
  const ons = take.events.filter((e) => e.type === "on");
  assert.deepEqual(ons.map((e) => e.t), [0, 0.004, 0.006, 1]);
  assert.deepEqual(ons.map((e) => (e.type === "on" ? e.octave : -1)), [4, 4, 4, 5]);
  assert.deepEqual(ons.map((e) => (e.type === "on" ? e.velocity : -1)), [0.8, 0.8, 0.6, 0.7]);
  const offs = take.events.filter((e) => e.type === "off").map((e) => e.type === "off" && e.midi);
  assert.deepEqual(offs.sort(), [60, 64, 67, 72].sort(), "every note is closed");
  assert.deepEqual(take.events.filter((e) => e.type === "pedal").map((e) => e.type === "pedal" && e.on), [true, false]);
  assert.equal(take.duration, 1.6);
  assert.equal(r.recording, false);
});

test("recorder ignores input when idle and offs for notes held before the take", () => {
  const r = new Recorder();
  r.note("on", 60, 0.8, 4, 0);
  r.begin(100, false);
  r.note("off", 60, 0, 4, 150);
  assert.equal(r.end(200).events.length, 0);
});

test("melody timeline follows the tempo and re-strikes repeats", () => {
  const tw = melodies.find((m) => m.id === "twinkle")!;
  const ev = melodyTimeline(tw);
  const spb = 60 / tw.bpm;
  const ons = ev.filter((e) => e.type === "on");
  assert.equal(ons.length, tw.notes.length);
  assert.ok(Math.abs(ons[1].t - spb) < 1e-9);
  const firstOff = ev.find((e) => e.type === "off")!;
  assert.ok(firstOff.t < ons[1].t, "the first C is lifted before the repeat");
  assert.ok(Math.abs(timelineEnd(ev) - (tw.notes.reduce((a, n) => a + n.beats, 0) - 2 + 2 * 0.88) * spb) < 1e-9);
});

test("sort puts offs before ons at the same time", () => {
  const ev = sortEvents([
    { t: 1, type: "on", midi: 60, velocity: 1, octave: 4 },
    { t: 1, type: "off", midi: 60 },
    { t: 0, type: "on", midi: 60, velocity: 1, octave: 4 },
  ]);
  assert.deepEqual(ev.map((e) => e.type), ["on", "off", "on"]);
});

test("chord demo strikes together", () => {
  const ev = stepTimeline([60, 64, 67], true);
  assert.deepEqual(ev.filter((e) => e.type === "on").map((e) => e.t), [0, 0, 0]);
});
