"use client";

import { useEffect, useRef, useState } from "react";
import type { PianoController } from "@/lib/piano/controller";
import { cOf, noteName, octaveOf, shortcutFor, solfege } from "@/lib/piano/notes";
import { Player } from "@/lib/piano/player";
import type { TimedEvent } from "@/lib/piano/timeline";
import type { Feedback } from "@/lib/piano/tutorial";

/** The key that plays `midi` in octave 4, which is where lessons live: "1", "⇧2"… */
export const lessonKey = (midi: number) => shortcutFor(midi, 4) ?? shortcutFor(midi, octaveOf(midi)) ?? noteName(midi);

/** How to reach `midi` from the current octave, if the number row cannot. */
function reach(midi: number, octave: number) {
  const k = shortcutFor(midi, octave);
  if (k) return k;
  const up = midi > cOf(octave) + 12;
  return `${up ? "]" : "["} then ${shortcutFor(midi, octaveOf(midi)) ?? noteName(midi)}`;
}

export function feedbackText(f: Feedback, octave: number, doneLabel: string): { text: string; tone: "good" | "bad" | "info" } | null {
  switch (f.kind) {
    case "none":
      return null;
    case "correct":
      return { text: `✓ ${solfege(f.midi)} (${shortcutFor(f.midi, octave) ?? noteName(f.midi)})`, tone: "good" };
    case "step-done":
      return { text: "✓ Step done — next one", tone: "good" };
    case "complete":
      return { text: `✓ ${doneLabel}`, tone: "good" };
    case "wrong": {
      const want = f.expected[0];
      const wantText = f.expected.length > 1 ? f.expected.map((m) => `${solfege(m)} (${reach(m, octave)})`).join(", ") : `${solfege(want)} (${reach(want, octave)})`;
      return { text: `× That was ${solfege(f.midi)} (${noteName(f.midi)}). Try ${wantText}.`, tone: "bad" };
    }
    case "wrong-octave": {
      const want = f.expected.find((m) => m % 12 === f.midi % 12) ?? f.expected[0];
      const dir = f.midi > want ? "[ to go down" : "] to go up";
      return { text: `× Right note, wrong octave: you played ${noteName(f.midi)}, the lesson wants ${noteName(want)}. Press ${dir}.`, tone: "bad" };
    }
  }
}

export function NoteChip({ midi, state, label }: { midi: number; state: "todo" | "next" | "done"; label?: string }) {
  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 border px-2.5 transition-colors duration-150 ${
        state === "next" ? "border-accent text-fg" : state === "done" ? "border-line text-fg-3" : "border-line text-fg-2"
      }`}
    >
      <kbd className={`label tabular ${state === "next" ? "text-accent-light" : ""}`}>{label ?? lessonKey(midi)}</kbd>
      <span className="text-[0.85rem]">{solfege(midi)}</span>
    </span>
  );
}

/** A demo player bound to the controller; stops itself when hidden or unmounted. */
export function useDemo(ctrl: PianoController | null, active: boolean) {
  const player = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!ctrl) return;
    const p = new Player(ctrl, "demo");
    player.current = p;
    return () => {
      p.stop();
      player.current = null;
      setPlaying(false);
    };
  }, [ctrl]);

  useEffect(() => {
    if (!active) {
      player.current?.stop();
      setPlaying(false);
    }
  }, [active]);

  const play = (events: TimedEvent[]) => {
    const p = player.current;
    if (!p) return;
    setPlaying(true);
    p.play(events, () => setPlaying(false));
  };
  const stop = () => {
    player.current?.stop();
    setPlaying(false);
  };
  return { playing, play, stop };
}

/** Briefly true after a wrong note, for a small visual cue. */
export function useMiss() {
  const [miss, setMiss] = useState(0);
  useEffect(() => {
    if (!miss) return;
    const t = window.setTimeout(() => setMiss(0), 450);
    return () => window.clearTimeout(t);
  }, [miss]);
  return [miss > 0, () => setMiss((n) => n + 1)] as const;
}
