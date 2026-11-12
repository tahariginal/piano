"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isLive } from "@/lib/piano/controller";
import { melodies } from "@/lib/piano/lessons";
import { melodyTimeline } from "@/lib/piano/timeline";
import { accuracy, melodyExpected, melodyInput, melodyStart, type Feedback, type MelodyState } from "@/lib/piano/tutorial";
import { usePiano } from "./context";
import { feedbackText, NoteChip, useDemo, useMiss } from "./tutorial-ui";

/**
 * Melody practice: play the tune note by note. Scores which notes were right
 * and whether the tune was finished — not rhythm, which is not measured.
 */
export default function Melodies({ active }: { active: boolean }) {
  const { ctrl, ready, controls, setTargets, enable } = usePiano();
  const [idx, setIdx] = useState(0);
  const [st, setSt] = useState<MelodyState>(melodyStart);
  const stRef = useRef(st);
  const [fb, setFb] = useState<Feedback>({ kind: "none" });
  const [miss, flagMiss] = useMiss();
  const demo = useDemo(ctrl, active);
  const melody = melodies[idx];
  const listRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((next: MelodyState, f: Feedback) => {
    stRef.current = next;
    setSt(next);
    setFb(f);
  }, []);

  useEffect(() => {
    if (!ctrl || !active) return;
    return ctrl.onNote((e) => {
      if (e.type !== "on" || !isLive(e.source)) return;
      const r = melodyInput(melody, stRef.current, e.midi);
      if (r.feedback.kind === "wrong" || r.feedback.kind === "wrong-octave") flagMiss();
      apply(r.state, r.feedback);
    });
  }, [ctrl, active, melody, apply, flagMiss]);

  useEffect(() => {
    if (!active) return;
    const next = melodyExpected(melody, st);
    setTargets(next === null ? [] : [next]);
  }, [active, melody, st, setTargets]);

  // Keep the next note in view inside the list only (never scroll the page while playing).
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>("[data-next]");
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, el.offsetTop - list.clientHeight / 2);
    }
  }, [st.index]);

  const select = (i: number) => {
    demo.stop();
    setIdx(i);
    apply(melodyStart(), { kind: "none" });
    ctrl?.setOctave(4);
  };
  const playDemo = () => {
    enable();
    demo.play(melodyTimeline(melody));
  };

  const acc = accuracy(st);
  const message = feedbackText(fb, controls.octave, `${melody.title} complete`);

  return (
    <div>
      <label className="label block text-fg-3" htmlFor="melody-select">
        Melody
      </label>
      <select
        id="melody-select"
        value={idx}
        onChange={(e) => select(Number(e.target.value))}
        className="mt-2 h-11 w-full border border-line bg-bg px-3 text-fg"
      >
        {melodies.map((m, i) => (
          <option key={m.id} value={i}>
            {m.title}
          </option>
        ))}
      </select>
      <p className="label mt-2 text-fg-3">{melody.credit}</p>

      <div className="mt-5 grid grid-cols-3 border-y border-line py-3">
        <Stat k="Notes" v={`${st.index} / ${melody.notes.length}`} />
        <Stat k="Accuracy" v={acc === null ? "—" : `${acc}%`} />
        <Stat k="Slips" v={String(st.wrong)} />
      </div>

      <div
        ref={listRef}
        className={`relative mt-4 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto border p-3 transition-colors duration-200 ${miss ? "border-fg-2 motion-safe:animate-[nudge_0.4s_ease-in-out]" : "border-line"}`}
        aria-label={`${melody.title}: ${melody.notes.length} notes`}
      >
        {melody.notes.map((n, i) => (
          <span key={i} data-next={i === st.index && !st.done ? "" : undefined}>
            <NoteChip midi={n.midi} state={i < st.index ? "done" : i === st.index && !st.done ? "next" : "todo"} />
          </span>
        ))}
      </div>

      <p
        className={`mt-3 min-h-[2.6em] text-[0.92rem] leading-snug ${message?.tone === "bad" ? "text-fg-2" : message?.tone === "good" ? "text-accent-light" : "text-fg-3"}`}
        aria-live="polite"
      >
        {st.done
          ? `✓ Complete · ${acc ?? 100}% of notes right${st.wrong ? ` (${st.wrong} slip${st.wrong > 1 ? "s" : ""})` : ""}.`
          : (message?.text ?? (ready ? "Play the highlighted key. Rhythm is up to you; only the notes are checked." : "Enable sound to start."))}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {demo.playing ? (
          <button type="button" onClick={demo.stop} className={btn}>
            ■ Stop demo
          </button>
        ) : (
          <button type="button" onClick={playDemo} disabled={!ready} className={btn}>
            ▶ Listen
          </button>
        )}
        <button type="button" onClick={() => select(idx)} className={btn}>
          Restart
        </button>
        <button type="button" onClick={() => select((idx + 1) % melodies.length)} className={btn}>
          Next melody ▸
        </button>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="label text-fg-3">{k}</p>
      <p className="tabular mt-1 text-[1.15rem] text-fg">{v}</p>
    </div>
  );
}

const btn = "label flex h-9 items-center gap-2 border border-line px-3 text-fg-2 transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-35";
