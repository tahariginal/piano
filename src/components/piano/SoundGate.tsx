"use client";

import { usePiano } from "./context";

/**
 * Browsers only allow audio after a gesture. Until the engine is ready this
 * card asks for one, shows real loading progress, and offers a retry on
 * failure. It never claims the piano is ready before it is.
 */
export default function SoundGate({ started }: { started: boolean }) {
  const { status, enable } = usePiano();
  if (status.phase === "ready") return null;

  let title = "Enable sound";
  let detail = "Real recordings of a Yamaha C5 grand. Or press any number key.";
  let action: string | null = "Enable sound";
  let progress: number | null = null;

  if (status.phase === "error") {
    title = "The piano could not load";
    detail = status.message;
    action = "Retry";
  } else if (status.phase === "suspended") {
    title = "Sound is paused";
    detail = "The browser paused audio. Resume to keep playing.";
    action = "Resume";
  } else if (started) {
    action = null;
    title = "Preparing the piano";
    if (status.phase === "downloading") {
      detail = `Downloading recordings · ${status.done} / ${status.total}`;
      progress = status.total ? (status.done / status.total) * 0.7 : 0;
    } else if (status.phase === "decoding") {
      detail = `Decoding recordings · ${status.done} / ${status.total}`;
      progress = 0.7 + (status.total ? (status.done / status.total) * 0.3 : 0);
    } else {
      detail = "Starting audio…";
      progress = 0;
    }
  } else if (status.phase === "downloading") {
    detail = `Real recordings of a Yamaha C5 grand · ${status.done} / ${status.total} loaded. Or press any number key.`;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-[22rem] border border-line-2 bg-bg/92 p-5 backdrop-blur-sm"
      >
        <p className="label flex items-center gap-2 text-fg">
          <span
            className={`inline-block size-1.5 rounded-full ${status.phase === "error" ? "bg-fg-2" : "bg-accent"} ${
              action === null ? "motion-safe:animate-[blink_1.2s_steps(1)_infinite]" : ""
            }`}
            aria-hidden="true"
          />
          {title}
        </p>
        <p className="mt-2 text-[0.95rem] leading-snug text-fg-2">{detail}</p>
        {progress !== null && (
          <div className="mt-4 h-px w-full bg-line-2" aria-hidden="true">
            <div className="h-px bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {action && (
          <button
            type="button"
            onClick={enable}
            className="label btn-line mt-4 inline-flex h-11 items-center gap-3 border border-line-2 px-5 text-fg transition-colors hover:text-accent-light"
          >
            <span aria-hidden="true">▶</span> {action}
          </button>
        )}
      </div>
    </div>
  );
}
