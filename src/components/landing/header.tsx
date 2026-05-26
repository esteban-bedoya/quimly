"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { navItems } from "@/data/landing";

const darkHeaderSections = new Set(["hero", "productos", "footer"]);

export function Header() {
  const [useSolidHeader, setUseSolidHeader] = useState(true);

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

  return (
    <header className="fixed inset-x-0 top-0 z-30 px-4 pt-4 transition-all duration-300 sm:px-6 lg:px-8">
      <nav
        className={`mx-auto flex h-16 w-full max-w-7xl items-center justify-between rounded-full px-5 shadow-[0_10px_30px_rgba(18,17,15,0.16)] backdrop-blur-xl transition duration-300 hover:scale-[1.02] sm:px-8 lg:px-10 ${
          useSolidHeader
            ? "border border-[#12110f] bg-[#12110f]"
            : "border border-white/18 bg-[rgba(68,66,62,0.72)]"
        }`}
      >
        <Link href="#hero" className="flex items-center transition duration-300 hover:scale-[1.08]">
          <Image
            src="/logos/quimly_logoo.png"
            alt="Quimly"
            width={132}
            height={40}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <div className="hidden items-center gap-10 text-[1.05rem] font-medium text-white md:flex">
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

        <a
          href="#certificados"
          className="rounded-full border border-[#12110f]/18 bg-[#e8e2d8] px-4 py-2 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#d6d2cc]"
        >
          Iniciar sesión
        </a>
      </nav>
    </header>
  );
}
