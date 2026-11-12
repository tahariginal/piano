"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isLive } from "@/lib/piano/controller";
import { lessons } from "@/lib/piano/lessons";
import { stepTimeline } from "@/lib/piano/timeline";
import { atStep, lessonExpected, lessonInput, lessonRelease, lessonStart, type Feedback, type LessonState } from "@/lib/piano/tutorial";
import { usePiano } from "./context";
import { feedbackText, NoteChip, useDemo, useMiss } from "./tutorial-ui";

const STORE = "piano:lessons-done";

const readDone = (): string[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Guided lessons: each step waits for the right notes, in order. */
export default function Lessons({ active }: { active: boolean }) {
  const { ctrl, ready, controls, setTargets, enable } = usePiano();
  const [idx, setIdx] = useState(0);
  const [st, setSt] = useState<LessonState>(lessonStart);
  const stRef = useRef(st);
  const [fb, setFb] = useState<Feedback>({ kind: "none" });
  const [done, setDone] = useState<string[]>([]);
  const [miss, flagMiss] = useMiss();
  const demo = useDemo(ctrl, active);
  const lesson = lessons[idx];

  useEffect(() => setDone(readDone()), []);

  const apply = useCallback((next: LessonState, f?: Feedback) => {
    stRef.current = next;
    setSt(next);
    if (f) setFb(f);
  }, []);

  const markDone = useCallback((id: string) => {
    setDone((d) => {
      if (d.includes(id)) return d;
      const next = [...d, id];
      try {
        window.localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* private mode: progress lives for this visit only */
      }
      return next;
    });
  }, []);

  // Live notes drive the lesson. Demos and replays are ignored.
  useEffect(() => {
    if (!ctrl || !active) return;
    return ctrl.onNote((e) => {
      if (!isLive(e.source)) return;
      const s = stRef.current;
      if (e.type === "on") {
        const r = lessonInput(lesson, s, e.midi, ctrl.active);
        if (r.feedback.kind === "wrong" || r.feedback.kind === "wrong-octave") flagMiss();
        if (r.feedback.kind === "complete") markDone(lesson.id);
        apply(r.state, r.feedback);
      } else {
        const next = lessonRelease(lesson, s, ctrl.active);
        if (next !== s) apply(next);
      }
    });
  }, [ctrl, active, lesson, apply, markDone, flagMiss]);

  useEffect(() => {
    if (active) setTargets(lessonExpected(lesson, st));
  }, [active, lesson, st, setTargets]);

  const select = (i: number) => {
    demo.stop();
    setIdx(i);
    apply(lessonStart(), { kind: "none" });
    ctrl?.setOctave(4);
  };
  const restart = () => select(idx);
  const previous = () => {
    demo.stop();
    apply(atStep(st.done ? lesson.steps.length - 1 : st.step - 1), { kind: "none" });
  };
  const playDemo = () => {
    enable();
    const step = lesson.steps[st.done ? lesson.steps.length - 1 : st.step];
    if (step) demo.play(stepTimeline(step.notes, step.kind === "chord"));
  };

  const stepIdx = st.done ? lesson.steps.length : st.step;
  const step = lesson.steps[Math.min(stepIdx, lesson.steps.length - 1)];
  const message = feedbackText(fb, controls.octave, `Lesson ${lesson.n} complete${st.mistakes ? ` · ${st.mistakes} slip${st.mistakes > 1 ? "s" : ""}` : " · no slips"}`);

  return (
    <div>
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Choose a lesson">
        {lessons.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => select(i)}
            aria-pressed={i === idx}
            aria-label={`Lesson ${l.n}: ${l.title}${done.includes(l.id) ? " (completed)" : ""}`}
            title={l.title}
            className={`label tabular relative flex h-10 items-center justify-center border transition-colors ${
              i === idx ? "border-accent-deep text-fg" : "border-line text-fg-3 hover:text-fg"
            }`}
          >
            {l.n}
            {done.includes(l.id) && <span className="absolute right-1 top-0.5 text-[0.6rem] text-accent-light" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <p className="label text-fg-3">
          <span className="text-accent">{lesson.n}</span> / Lesson
        </p>
        <h2 className="mt-2 text-[1.35rem] font-medium leading-tight tracking-[-0.02em]">{lesson.title}</h2>
        <p className="mt-1 text-[0.95rem] leading-snug text-fg-2">{lesson.summary}</p>

        <div className="mt-4 flex items-center justify-between">
          <p className="label tabular text-fg-3">
            Step {Math.min(stepIdx + 1, lesson.steps.length)} / {lesson.steps.length}
          </p>
          <p className="label tabular text-fg-3">
            {st.mistakes} slip{st.mistakes === 1 ? "" : "s"}
          </p>
        </div>
        <div className="mt-2 h-px w-full bg-line-2" aria-hidden="true">
          <div className="h-px bg-accent transition-[width] duration-500" style={{ width: `${(stepIdx / lesson.steps.length) * 100}%` }} />
        </div>

        <ol className="mt-4 grid gap-1.5">
          {lesson.steps.map((s, i) => {
            const state = i < stepIdx ? "done" : i === stepIdx ? "now" : "todo";
            return (
              <li key={i} className={`flex items-start gap-3 text-[0.95rem] leading-snug ${state === "now" ? "text-fg" : state === "done" ? "text-fg-3" : "text-fg-2"}`}>
                <span className={`label tabular mt-[0.2rem] w-4 ${state === "now" ? "text-accent" : ""}`}>{state === "done" ? "✓" : i + 1}</span>
                {s.prompt}
              </li>
            );
          })}
        </ol>

        {!st.done && step && (
          <div
            className={`mt-5 border p-4 transition-colors duration-200 ${miss ? "border-fg-2 motion-safe:animate-[nudge_0.4s_ease-in-out]" : "border-line"}`}
          >
            <p className="label text-fg-3">{step.kind === "chord" ? "Hold together" : "Play"}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {step.notes.map((m, i) => (
                <NoteChip
                  key={`${m}-${i}`}
                  midi={m}
                  state={step.kind === "chord" ? (st.chordHits.includes(m) ? "done" : "next") : i < st.index ? "done" : i === st.index ? "next" : "todo"}
                />
              ))}
            </div>
          </div>
        )}

        <p
          className={`mt-3 min-h-[2.6em] text-[0.92rem] leading-snug ${message?.tone === "bad" ? "text-fg-2" : message?.tone === "good" ? "text-accent-light" : "text-fg-3"}`}
          aria-live="polite"
        >
          {message?.text ?? (ready ? "" : "Enable sound to start.")}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={previous} disabled={stepIdx === 0} className={btn}>
            ◂ Previous step
          </button>
          {demo.playing ? (
            <button type="button" onClick={demo.stop} className={btn}>
              ■ Stop
            </button>
          ) : (
            <button type="button" onClick={playDemo} disabled={!ready} className={btn}>
              ▶ Demo
            </button>
          )}
          <button type="button" onClick={restart} className={btn}>
            Restart
          </button>
          <button type="button" onClick={() => select(idx + 1)} disabled={idx >= lessons.length - 1} className={`${btn} ${st.done ? "border-accent-deep text-fg" : ""}`}>
            Next lesson ▸
          </button>
        </div>
      </div>
    </div>
  );
}

const btn = "label flex h-9 items-center gap-2 border border-line px-3 text-fg-2 transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-35";
