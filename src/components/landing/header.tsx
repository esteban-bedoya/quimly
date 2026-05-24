import Image from "next/image";

import { navItems } from "@/data/landing";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <a href="#" className="flex items-center">
          <Image
            src="/logos/quimly_logo.png"
            alt="Quimly"
            width={132}
            height={40}
            priority
            className="h-10 w-auto"
          />
        </a>

        <div className="hidden items-center gap-8 text-sm font-medium text-white md:flex">
          {navItems.map((item) => (
            <a key={item.href} className="transition hover:text-white/75" href={item.href}>
              {item.label}
            </a>
          ))}
        </div>

        <a
          href="#demo"
          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85"
        >
          Hablar con un asesor
        </a>
      </nav>
    </header>
  );
}
