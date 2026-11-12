"use client";

import { useEffect, useRef, useState } from "react";
import { isLive } from "@/lib/piano/controller";
import { Player } from "@/lib/piano/player";
import { Recorder, type Recording } from "@/lib/piano/timeline";
import { usePiano } from "./context";

type Phase = "idle" | "recording" | "playing";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** Record a performance and replay it through the real engine, chords and pedal included. */
export default function RecorderStrip() {
  const { ctrl, ready } = usePiano();
  const recorder = useRef(new Recorder());
  const player = useRef<Player | null>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const t0 = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [take, setTake] = useState<Recording | null>(null);

  // Capture live input only: demos and replays are never recorded.
  useEffect(() => {
    if (!ctrl) return;
    const rec = recorder.current;
    const offNote = ctrl.onNote((e) => {
      if (isLive(e.source)) rec.note(e.type, e.midi, e.velocity, ctrl.controls.octave, e.time);
    });
    const offState = ctrl.onState((s) => rec.sustain(s.sustain || s.pedal, performance.now()));
    const p = new Player(ctrl, "replay");
    player.current = p;
    return () => {
      offNote();
      offState();
      p.stop();
      if (rec.recording) rec.end(performance.now());
      player.current = null;
    };
  }, [ctrl]);

  // Running clock while recording or playing, written straight to the DOM.
  useEffect(() => {
    if (phase === "idle") return;
    const id = window.setInterval(() => {
      if (clock.current) clock.current.textContent = fmt(Math.max(0, (performance.now() - t0.current) / 1000));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  const record = () => {
    if (!ctrl) return;
    player.current?.stop();
    t0.current = performance.now();
    recorder.current.begin(t0.current, ctrl.controls.sustain || ctrl.controls.pedal);
    setPhase("recording");
  };
  const stop = () => {
    if (phase === "recording") {
      const r = recorder.current.end(performance.now());
      setTake(r.notes ? r : null);
    } else player.current?.stop();
    setPhase("idle");
  };
  const play = () => {
    if (!take || !player.current) return;
    t0.current = performance.now() + 60;
    setPhase("playing");
    player.current.play(take.events, () => setPhase("idle"));
  };
  const clear = () => {
    player.current?.stop();
    setTake(null);
    setPhase("idle");
  };

  const btn = "label flex h-9 items-center gap-2 border border-line px-3 text-fg-2 transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recorder">
      {phase === "recording" ? (
        <button type="button" onClick={stop} className={`${btn} border-accent-deep text-fg`}>
          <span className="inline-block size-2 bg-fg" aria-hidden="true" /> Stop
        </button>
      ) : (
        <button type="button" onClick={record} disabled={!ready || phase === "playing"} className={btn}>
          <span className="inline-block size-2 rounded-full bg-accent" aria-hidden="true" /> {take ? "Record new" : "Record"}
        </button>
      )}
      {phase === "playing" ? (
        <button type="button" onClick={stop} className={`${btn} text-fg`}>
          <span className="inline-block size-2 bg-fg" aria-hidden="true" /> Stop
        </button>
      ) : (
        <button type="button" onClick={play} disabled={!take || phase === "recording" || !ready} className={btn}>
          <span aria-hidden="true">▶</span> Replay
        </button>
      )}
      <button type="button" onClick={clear} disabled={!take || phase === "recording"} className={btn}>
        Clear
      </button>
      <p className="label ml-1 flex items-center gap-2 text-fg-3" aria-live="polite">
        {phase === "recording" ? (
          <>
            <span className="inline-block size-1.5 rounded-full bg-accent motion-safe:animate-[blink_1s_steps(1)_infinite]" aria-hidden="true" />
            <span className="text-fg">Rec</span>
            <span ref={clock} className="tabular text-fg">
              0:00.0
            </span>
          </>
        ) : phase === "playing" ? (
          <>
            <span className="text-fg">Replay</span>
            <span ref={clock} className="tabular text-fg">
              0:00.0
            </span>
            {take && <span className="tabular">/ {fmt(take.duration)}</span>}
          </>
        ) : take ? (
          <span className="tabular">
            {take.notes} notes · {fmt(take.duration)}
          </span>
        ) : (
          <span>{ready ? "Nothing recorded" : "Recorder waits for sound"}</span>
        )}
      </p>
    </div>
  );
}
