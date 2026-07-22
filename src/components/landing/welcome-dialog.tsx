"use client";

import { useState } from "react";

export function WelcomeDialog() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12110f]/45 px-5 backdrop-blur-sm" role="presentation">
      <section
        aria-labelledby="welcome-dialog-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-[0_24px_80px_rgba(18,17,15,0.3)]"
        role="dialog"
      >
        <h2 id="welcome-dialog-title" className="text-3xl font-bold text-[#12110f]">
          Hola Jesús!
        </h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-6 text-sm font-semibold text-white transition hover:bg-[#2a7f86] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f86]"
        >
          Cerrar
        </button>
      </section>
    </div>
  );
}
