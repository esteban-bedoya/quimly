"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export function TemporaryGreetingModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/42 px-5 py-8 backdrop-blur-md">
      <button
        type="button"
        aria-label="Cerrar mensaje"
        onClick={() => setIsOpen(false)}
        className="absolute inset-0 cursor-default"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-modal-surface relative w-full max-w-sm overflow-hidden rounded-[1.8rem] px-6 py-12 text-center shadow-[0_28px_90px_rgba(18,17,15,0.24)] sm:px-7"
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#12110f]/12 bg-white text-lg font-semibold leading-none text-[#12110f] transition hover:scale-105 hover:bg-[#f3eee6]"
        >
          x
        </button>

        <h2 id={titleId} className="text-3xl font-semibold tracking-[-0.04em] text-[#12110f]">
          Hola, Sebas
        </h2>
      </section>
    </div>,
    document.body,
  );
}
