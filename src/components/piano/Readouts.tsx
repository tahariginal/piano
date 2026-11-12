"use client";

import { useEffect, useRef } from "react";
import { noteName, shortcutFor, solfege } from "@/lib/piano/notes";
import { usePiano } from "./context";

/** Small technical readouts: note, octave, key, pedal and output level. */
export default function Readouts({ notice }: { notice: string | null }) {
  const { ctrl, ready, controls, active, last } = usePiano();
  const level = useRef<HTMLSpanElement>(null);

  // Output level straight from the audio graph, written to the DOM (no React state per tick).
  useEffect(() => {
    if (!ctrl || !ready) return;
    const id = window.setInterval(() => {
      if (document.hidden || !level.current) return;
      const db = ctrl.engine.level();
      level.current.textContent = Number.isFinite(db) && db > -90 ? `${db.toFixed(1)} dB` : "— dB";
    }, 100);
    return () => window.clearInterval(id);
  }, [ctrl, ready]);

  const shown = active.length ? active : last ? [last.midi] : [];
  const note = shown.length ? shown.map(noteName).join(" ") : "—";
  const sol = shown.length ? shown.map(solfege).join(" ") : "—";
  const keyHint = shown.length ? shown.map((m) => shortcutFor(m, controls.octave) ?? "·").join(" ") : "—";

  return (
    <div className="label text-fg-3 lg:text-right">
    <dl className="grid grid-cols-3 gap-x-5 gap-y-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-5 lg:justify-end">
      <Item k="Note">
        <span className={active.length ? "text-accent-light" : "text-fg"}>{note}</span>
      </Item>
      <Item k="Solfège">{sol}</Item>
      <Item k="Key">{keyHint}</Item>
      <Item k="Octave">
        {controls.octave} <span className="text-fg-3">[ ]</span>
      </Item>
      <Item k="Sustain">{controls.sustain || controls.pedal ? "on" : "off"}</Item>
      <Item k="Out">
        <span ref={level}>{ready ? "— dB" : "off"}</span>
      </Item>
    </dl>
      <p className="mt-1 min-h-[1.4em] text-fg-2" aria-live="polite">
        {notice ?? ""}
      </p>
    </div>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt>{k}</dt>
      <dd className="tabular text-fg">{children}</dd>
    </div>
  );
}
