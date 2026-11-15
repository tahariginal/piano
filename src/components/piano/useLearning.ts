"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { melodyPitches, type Melody } from "@/lib/piano/lessons";
import { learningInput, learningRelease, learningStart, practiceAdvance, type LearningMode, type LearningState } from "@/lib/piano/learning";
import { Player } from "@/lib/piano/player";
import { melodyTiming, sortEvents, type TimedEvent } from "@/lib/piano/timeline";
import type { Feedback } from "@/lib/piano/tutorial";
import { usePiano } from "./context";

type Transport = "learn" | "listen" | "paused";

export function useLearning(melody: Melody, active: boolean) {
  const { ctrl, ready, setTargets, feedbackKey, clearFeedback, enable } = usePiano();
  const [mode, setModeState] = useState<LearningMode>("step");
  const [transport, setTransport] = useState<Transport>("learn");
  const [bpm, setBpmState] = useState(melody.bpm);
  const [range, setRange] = useState({ start: 0, end: melody.notes.length });
  const [state, setState] = useState<LearningState>(() => learningStart());
  const stateRef = useRef(state);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });
  const [seconds, setSeconds] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const player = useRef<Player | null>(null);
  const clock = useRef<(() => number) | null>(null);
  const pausedTransport = useRef<Transport>("learn");
  const listenIndex = useRef(0);
  const timing = useMemo(() => melodyTiming(melody, bpm), [melody, bpm]);
  const apply = useCallback((s: LearningState) => { stateRef.current = s; setState(s); }, []);
  const stop = useCallback(() => { player.current?.stop(); clock.current = null; setSeconds(null); }, []);

  const pause = useCallback(() => {
    pausedTransport.current = transport === "paused" ? pausedTransport.current : transport;
    if (transport === "listen" && clock.current) {
      const t = clock.current();
      const i = timing.findIndex((note, i) => i >= range.start && i < range.end && t < note.end);
      if (i >= 0) listenIndex.current = i;
    }
    stop();
    setTransport("paused");
    clearFeedback();
  }, [transport, stop, clearFeedback, timing, range]);

  useEffect(() => {
    if (!active) pause();
    // Becoming visible never starts playback unexpectedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const hide = () => { if (document.hidden) pause(); };
    const blur = () => pause();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", blur);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("blur", blur); };
  }, [pause]);

  // Both the cue position and scoring read the exact clock used by Player.
  useEffect(() => {
    if (!ctrl || !ready || !active || transport === "paused" || mode === "free") return;
    if (transport !== "listen" && mode !== "practice") return;
    const first = transport === "listen" ? listenIndex.current : stateRef.current.done ? range.start : stateRef.current.index;
    const origin = timing[first].start;
    const countIn = 2 * 60 / bpm;
    const duration = timing[range.end - 1].end - origin + countIn;
    const events: TimedEvent[] = [];
    for (let i = first; i < range.end; i++) {
      for (const midi of melodyPitches(melody.notes[i])) {
        events.push({ type: "on", midi, velocity: 0.6, octave: Math.floor(midi / 12) - 1, t: timing[i].start - origin + countIn });
        events.push({ type: "off", midi, t: Math.min(timing[i].release - origin + countIn, duration) });
      }
    }
    const p = new Player(ctrl, "demo");
    player.current = p;
    const time = () => p.elapsed - countIn + origin;
    clock.current = time;
    setSeconds(origin - countIn);
    let frame = 0;
    let last = -Infinity;
    let cancelled = false;
    p.play(sortEvents(events), () => {
      if (cancelled) return;
      if (transport === "learn") apply(practiceAdvance(melody, stateRef.current, Infinity, range.end, bpm));
      clock.current = null;
      setSeconds(null);
      pausedTransport.current = "learn";
      setTransport("paused");
    }, duration);
    const tick = (now: number) => {
      if (cancelled || !p.playing) return;
      if (now - last >= 32) {
        last = now;
        const t = time();
        setSeconds(t);
        if (transport === "learn") {
          const next = practiceAdvance(melody, stateRef.current, t, range.end, bpm);
          if (next !== stateRef.current) apply(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      p.stop();
      if (player.current === p) { player.current = null; clock.current = null; }
    };
  }, [ctrl, ready, active, transport, mode, bpm, range, revision, melody, timing, apply]);

  useEffect(() => {
    if (!ctrl || !active || !ready || mode === "free" || transport !== "learn") return;
    return ctrl.onInput((e) => {
      let s = stateRef.current;
      if (mode === "practice") {
        const time = clock.current?.();
        if (time === undefined) return;
        s = practiceAdvance(melody, s, time, range.end, bpm);
        if (s !== stateRef.current) apply(s);
        if (s.done || time < timing[s.index].start) return;
      }
      if (s.done) return;
      if (e.type === "off") {
        const next = learningRelease(s, ctrl.liveActive, mode === "practice", melodyPitches(melody.notes[s.index]));
        if (next !== s) apply(next);
        return;
      }
      const result = learningInput(melody, s, e.midi, ctrl.liveActive, range.end, mode === "practice");
      apply(result.state);
      setFeedback(result.feedback);
      if (result.feedback.kind !== "none") {
        feedbackKey(e.midi, result.feedback.kind !== "wrong" && result.feedback.kind !== "wrong-octave");
      }
    });
  }, [ctrl, ready, active, mode, transport, melody, range, bpm, timing, apply, feedbackKey]);

  const visualIndex = transport === "listen" && seconds !== null
    ? Math.max(range.start, timing.findIndex((t, i) => i >= range.start && i < range.end && seconds < t.end))
    : Math.min(state.index, range.end - 1);
  const countingIn = seconds !== null && seconds < timing[visualIndex].start;
  const guided = active && mode !== "free" && transport !== "paused" && !state.done;
  const pitches = melodyPitches(melody.notes[visualIndex]);
  const targetsKey = guided ? pitches.filter((p) => transport === "listen" || !state.hits.includes(p)).join(",") : "";
  useEffect(() => {
    if (active) setTargets(targetsKey ? targetsKey.split(",").map(Number) : []);
  }, [active, targetsKey, setTargets]);
  useEffect(() => () => { clearFeedback(); }, [clearFeedback]);

  const restartAt = (start: number, end: number, nextTransport: Transport = "learn") => {
    stop();
    clearFeedback();
    apply(learningStart(start));
    listenIndex.current = start;
    setFeedback({ kind: "none" });
    setRange({ start, end });
    setTransport(nextTransport);
    setRevision((n) => n + 1);
    enable();
  };
  return {
    mode, transport, bpm, range, state, feedback, seconds, visualIndex, countingIn, timing,
    pause,
    resume: () => {
      enable();
      const s = stateRef.current;
      if (!s.done) apply(learningRelease(s, ctrl?.liveActive ?? [], mode === "practice", melodyPitches(melody.notes[s.index])));
      setTransport(pausedTransport.current);
      setRevision((n) => n + 1);
    },
    restart: () => restartAt(range.start, range.end),
    section: (start: number, end: number) => restartAt(start, end),
    replay: () => restartAt(range.start, range.end, "listen"),
    setMode: (value: LearningMode) => { stop(); setModeState(value); restartAt(range.start, range.end); },
    setBpm: (value: number) => {
      // Resume the current event at the new tempo, preserving the score.
      if (transport === "listen") listenIndex.current = visualIndex;
      stop(); setBpmState(value); setRevision((n) => n + 1);
    },
  };
}
