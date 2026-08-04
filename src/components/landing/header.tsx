"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { navItems } from "@/data/landing";

const darkHeaderSections = new Set(["hero", "productos", "footer"]);

function LoginIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

export function Header() {
  const [useSolidHeader, setUseSolidHeader] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const trackedSections = ["hero", "ecosistema", "productos", "certificados", "footer"];
    const probeY = 56;
    let frameId = 0;

    const syncHeaderTone = () => {
      for (const sectionId of trackedSections) {
        const element = document.getElementById(sectionId);

        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();

        if (rect.top <= probeY && rect.bottom >= probeY) {
          setUseSolidHeader((currentValue) => {
            const nextValue = darkHeaderSections.has(sectionId);
            return currentValue === nextValue ? currentValue : nextValue;
          });
          return;
        }
      }
    };

    const queueSyncHeaderTone = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncHeaderTone);
    };

    queueSyncHeaderTone();

    window.addEventListener("scroll", queueSyncHeaderTone, { passive: true });
    window.addEventListener("resize", queueSyncHeaderTone);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", queueSyncHeaderTone);
      window.removeEventListener("resize", queueSyncHeaderTone);
    };
  }, []);

  useEffect(() => {
    const closeMobileMenu = () => {
      setIsMobileMenuOpen(false);
    };

    window.addEventListener("scroll", closeMobileMenu, { passive: true });
    window.addEventListener("resize", closeMobileMenu);

    return () => {
      window.removeEventListener("scroll", closeMobileMenu);
      window.removeEventListener("resize", closeMobileMenu);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-30 px-4 pt-3 transition-all duration-300 sm:px-6 sm:pt-4 lg:px-[clamp(1.5rem,2vw,2rem)]">
      <nav
        className={`mx-auto w-full max-w-7xl rounded-[1.75rem] px-4 py-4 shadow-[0_10px_30px_rgba(18,17,15,0.16)] backdrop-blur-xl transition duration-300 hover:scale-[1.02] sm:rounded-full sm:px-8 sm:py-0 lg:px-[clamp(2rem,2.5vw,2.5rem)] ${
          useSolidHeader
            ? "border border-[#12110f] bg-[#12110f]"
            : "border border-white/18 bg-[rgba(68,66,62,0.72)]"
        }`}
      >
        <div className="flex items-center justify-between sm:h-16">
          <Link href="#hero" className="flex items-center transition duration-300 hover:scale-[1.08]">
            <Image
              src="/logos/quimly_logoo.png"
              alt="Quimly"
              width={132}
              height={40}
              priority
              className="h-8 w-auto sm:h-10"
            />
          </Link>

          <div className="hidden items-center gap-[clamp(1.75rem,2.5vw,2.5rem)] text-[clamp(1rem,1.3vw,1.05rem)] font-medium text-white md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                className="px-2.5 py-2 text-[#f4efe7] transition duration-300 hover:scale-[1.08] hover:text-white"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-3.5 py-2 text-xs font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#e7e7e7]"
            >
              <LoginIcon />
              Acceso
            </Link>
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-label="Abrir menú"
              onClick={() => setIsMobileMenuOpen((currentValue) => !currentValue)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#12110f]/18 bg-white text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#f7f7f7]"
            >
              <span className="flex flex-col gap-1">
                <span className={`block h-0.5 w-4 rounded-full bg-current transition ${isMobileMenuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
                <span className={`block h-0.5 w-4 rounded-full bg-current transition ${isMobileMenuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 w-4 rounded-full bg-current transition ${isMobileMenuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
              </span>
            </button>
          </div>

          <Link
            href="/login"
            className="hidden items-center gap-1.5 rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-3.5 py-2 text-xs font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#e7e7e7] md:inline-flex md:px-4 md:text-sm"
          >
            <LoginIcon />
            Acceso
          </Link>
        </div>

        {isMobileMenuOpen ? (
          <div className="mt-4 flex flex-col items-start gap-3 border-t border-white/10 pt-4 text-sm font-medium text-white md:hidden">
            {navItems.map((item) => (
              <a
                key={item.href}
                className="text-[#f4efe7] transition duration-300 hover:translate-x-1 hover:text-white"
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
      </nav>
    </header>
  );
}
