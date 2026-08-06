"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { getQuimlyWhatsAppUrl } from "@/lib/whatsapp";

const founderWhatsAppUrl = getQuimlyWhatsAppUrl(
  "¡Hola, Quimly! Quiero verificar si aún hay un cupo Founder disponible para mi restaurante.",
);
const founderModalDelayMs = 10_000;
const pricingSectionCompletionPoint = 0.25;

export function FounderModal() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let hasTriggered = false;
    let frameId = 0;
    const pricingSection = document.getElementById("certificados");

    const clearTriggers = () => {
      window.clearTimeout(timerId);

      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", queuePricingCheck);
      window.removeEventListener("resize", queuePricingCheck);
    };

    const showModal = () => {
      if (hasTriggered) {
        return;
      }

      hasTriggered = true;
      clearTriggers();
      setIsOpen(true);
    };

    const checkPricingProgress = () => {
      frameId = 0;

      if (!pricingSection) {
        return;
      }

      const sectionBounds = pricingSection.getBoundingClientRect();

      if (sectionBounds.bottom <= window.innerHeight * pricingSectionCompletionPoint) {
        showModal();
      }
    };

    const queuePricingCheck = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(checkPricingProgress);
    };

    const timerId = window.setTimeout(showModal, founderModalDelayMs);
    window.addEventListener("scroll", queuePricingCheck, { passive: true });
    window.addEventListener("resize", queuePricingCheck);
    queuePricingCheck();

    return () => {
      clearTriggers();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements?.length) {
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    closeButtonRef.current?.focus();
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="ui-focus-backdrop fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="founder-modal-title"
        className="relative w-full max-w-[29rem] overflow-hidden rounded-[1.5rem] border border-[#12110f]/12 bg-white text-[#12110f] shadow-[0_24px_70px_rgba(18,17,15,0.12)] [animation:founder-modal-enter_350ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:[animation:none] sm:rounded-[1.75rem]"
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Cerrar mensaje Founder"
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#12110f]/12 bg-white text-2xl font-light leading-none text-[#12110f] transition duration-200 hover:scale-105 hover:bg-[#f4efe7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48c7d2] sm:right-5 sm:top-5"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="p-5 pb-6 sm:p-7 sm:pb-7">
          <h2 id="founder-modal-title" className="whitespace-nowrap pr-11 text-[clamp(0.95rem,5.3vw,1.65rem)] font-semibold leading-[1.1] tracking-[-0.05em] text-[#12110f] sm:text-[1.65rem]">
            Aún puedes ser Founder.
          </h2>

          <p className="mt-4 max-w-[24rem] text-[0.9rem] leading-6 text-[#5f5e5a] sm:text-[0.95rem]">
            Sé de los primeros restaurantes en unirse a Quimly y obtén una{" "}
            <strong className="font-semibold text-[#12110f] underline decoration-[#48c7d2] decoration-2 underline-offset-4">
              tarifa preferencial de por vida
            </strong>, siempre que mantengas tu suscripción activa.
          </p>

          <a
            href={founderWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#12110f] px-4 py-3 text-center text-[0.875rem] font-bold text-white shadow-[0_10px_24px_rgba(18,17,15,0.15)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#2a2926] hover:shadow-[0_14px_30px_rgba(18,17,15,0.20)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#48c7d2]"
          >
            <Image src="/logos/whatsapp.svg" alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5" />
            Escríbenos para solicitar tu cupo Founder.
          </a>
        </div>
      </section>
    </div>
  );
}
