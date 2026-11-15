import { test } from "node:test";
import assert from "node:assert/strict";
import type { PianoAudioEngine } from "../src/lib/piano/audio";
import { PianoController, type NoteEvent } from "../src/lib/piano/controller";
import { Player } from "../src/lib/piano/player";
import type { TimedEvent } from "../src/lib/piano/timeline";

// The player and controller use window timers; Node has the same ones on globalThis.
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;

/** An engine that only logs what it is asked to do, on the real clock. */
function fakeEngine() {
  const ons: { midi: number; at: number }[] = [];
  const offs: number[] = [];
  const engine = {
    ready: true,
    get now() {
      return performance.now() / 1000;
    },
    noteOn: (midi: number, _v?: number, at?: number) => void ons.push({ midi, at: at ?? performance.now() / 1000 }),
    noteOff: (midi: number) => void offs.push(midi),
    setSustain: () => {},
    allNotesOff: () => {},
  };
  return { engine: engine as unknown as PianoAudioEngine, ons, offs };
}

const play = (p: Player, events: TimedEvent[]) => new Promise<void>((done) => p.play(events, done));

test("a key repeated faster than the lookahead strikes every time", async () => {
  const { engine, ons, offs } = fakeEngine();
  const ctrl = new PianoController(engine);
  const heard: NoteEvent[] = [];
  ctrl.onNote((e) => heard.push(e));
  // Four strikes of C4, each lifted 40 ms before the next: shorter than the 120 ms lookahead.
  const events: TimedEvent[] = [];
  for (let i = 0; i < 4; i++) {
    events.push({ t: i * 0.1, type: "on", midi: 60, velocity: 0.7, octave: 4 });
    events.push({ t: i * 0.1 + 0.06, type: "off", midi: 60 });
  }
  await play(new Player(ctrl, "replay"), events);
  assert.equal(ons.length, 4, "four strikes");
  const gaps = ons.slice(1).map((o, i) => o.at - ons[i].at);
  for (const g of gaps) assert.ok(Math.abs(g - 0.1) < 0.002, `strikes keep their spacing (${g.toFixed(4)} s)`);
  assert.equal(offs.length, 4, "four releases");
  assert.deepEqual(heard.map((e) => e.type), ["on", "off", "on", "off", "on", "off", "on", "off"]);
  assert.deepEqual(ctrl.active, [], "nothing left down");
});

test("stopping mid-way lifts every note the player holds", async () => {
  const { engine } = fakeEngine();
  const ctrl = new PianoController(engine);
  const p = new Player(ctrl, "demo");
  p.play([
    { t: 0, type: "on", midi: 60, velocity: 0.7, octave: 4 },
    { t: 0, type: "on", midi: 64, velocity: 0.7, octave: 4 },
    { t: 5, type: "off", midi: 60 },
    { t: 5, type: "off", midi: 64 },
  ]);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(ctrl.active, [60, 64]);
  p.stop();
  assert.deepEqual(ctrl.active, []);
  assert.equal(p.playing, false);
});

test("live input on the same key is not cut by a replay", async () => {
  const { engine, ons } = fakeEngine();
  const ctrl = new PianoController(engine);
  ctrl.press("key:Digit1", 60, 0.8, "key");
  await play(new Player(ctrl, "replay"), [
    { t: 0, type: "on", midi: 60, velocity: 0.7, octave: 4 },
    { t: 0.05, type: "off", midi: 60 },
  ]);
  assert.equal(ons.length, 1, "already sounding: no second strike");
  assert.deepEqual(ctrl.active, [60], "the held key still sounds");
  ctrl.release("key:Digit1");
  assert.deepEqual(ctrl.active, []);
});

test("practice receives live input even when the demo owns the same key", async () => {
  const { engine } = fakeEngine();
  const ctrl = new PianoController(engine);
  const input: NoteEvent[] = [];
  ctrl.onInput((e) => input.push(e));
  const p = new Player(ctrl, "demo");
  p.play([
    { t: 0, type: "on", midi: 60, velocity: 0.7, octave: 4 },
    { t: 1, type: "off", midi: 60 },
  ]);
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(ctrl.liveActive, [], "scheduled/demo notes never count as a learner chord");
  ctrl.press("key:Digit1", 60, 0.8, "key");
  assert.deepEqual(ctrl.liveActive, [60]);
  ctrl.press("key:Digit1", 60, 0.8, "key");
  assert.equal(input.length, 1, "a held key does not repeat");
  ctrl.release("key:Digit1");
  assert.deepEqual(input.map((e) => [e.type, e.midi]), [["on", 60], ["off", 60]]);
  assert.deepEqual(ctrl.liveActive, []);
  p.stop();
  assert.deepEqual(ctrl.active, []);
});
