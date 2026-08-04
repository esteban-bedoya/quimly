"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type TransientFeedbackToastTone = "success" | "neutral";

const toneClassNames: Record<TransientFeedbackToastTone, { accent: string; border: string }> = {
  success: {
    accent: "text-[#8fe3d5]",
    border: "border-[#5da87b]/42",
  },
  neutral: {
    accent: "text-[#7ad9dd]",
    border: "border-[#2a7f86]/25",
  },
};

export function TransientFeedbackToast({
  title,
  message,
  onDismiss,
  tone = "neutral",
  durationMs = 7_000,
}: {
  title: string;
  message: string;
  onDismiss: () => void;
  tone?: TransientFeedbackToastTone;
  durationMs?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  const toneClassName = toneClassNames[tone];

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDismissRef.current(), durationMs);

    return () => window.clearTimeout(timeoutId);
  }, [durationMs, message]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <aside
      aria-atomic="true"
      aria-live="polite"
      className={`fixed right-4 bottom-4 z-[150] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-[#12110f] p-4 text-white shadow-[0_18px_48px_rgba(18,17,15,0.28)] ${toneClassName.border}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        {tone === "success" ? (
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#8fe3d5]/14 text-[#8fe3d5]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="m5 12 4.2 4.2L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${toneClassName.accent}`}>{title}</p>
          <p className="mt-1 line-clamp-3 text-sm leading-5 text-white/78">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-2 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar notificación"
        >
          Cerrar
        </button>
      </div>
    </aside>,
    document.body,
  );
}
