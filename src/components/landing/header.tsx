"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { navItems } from "@/data/landing";

export function Header() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const hero = document.getElementById("hero");

      if (!hero) {
        setIsVisible(true);
        return;
      }

      const { top, height } = hero.getBoundingClientRect();
      setIsVisible(top + height / 2 > 0);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header
      className={`sticky top-4 z-30 px-4 transition-all duration-300 sm:px-6 lg:px-8 ${
        isVisible ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-6 opacity-0"
      }`}
    >
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between rounded-full border border-white/10 bg-[#12110f] px-5 shadow-[0_10px_30px_rgba(18,17,15,0.18)] transition duration-300 hover:scale-[1.02] sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center transition duration-300 hover:scale-[1.08]">
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
          href="#demo"
          className="rounded-full border border-[#12110f]/18 bg-[#e8e2d8] px-4 py-2 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#d6d2cc]"
        >
          Iniciar sesión
        </a>
      </nav>
    </header>
  );
}
