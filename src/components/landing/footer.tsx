import Link from "next/link";

import { navItems } from "@/data/landing";

export function Footer() {
  return (
    <footer id="footer" className="relative overflow-hidden bg-[#f4efe7] px-5 pb-8 pt-14 sm:px-8 lg:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(18,17,15,0.34)_0%,rgba(18,17,15,0.18)_38%,rgba(244,239,231,0)_100%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-10 border-b border-[#12110f]/12 pb-10 md:grid-cols-3 md:gap-8 lg:gap-12">
          <div>
            <p className="text-[1.15rem] font-bold uppercase tracking-[0.08em] text-[#12110f]">Navegación</p>
            <div className="mt-4 space-y-2.5 text-[0.98rem] font-semibold text-[#4f4b45]">
              <div className="space-y-2 pt-2">
                <a href="#hero" className="block transition duration-300 hover:translate-x-1 hover:scale-[1.04] hover:text-[#12110f]">
                  Inicio
                </a>
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block transition duration-300 hover:translate-x-1 hover:scale-[1.04] hover:text-[#12110f]"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[1.15rem] font-bold uppercase tracking-[0.08em] text-[#12110f]">Contacto</p>
            <div className="mt-4 space-y-2.5 text-[0.98rem] font-medium text-[#4f4b45]">
              <Link href="mailto:contacto.quimly@gmail.com" className="block transition duration-300 hover:text-[#12110f]">
                contacto.quimly@gmail.com
              </Link>
              <a href="tel:+573016143804" className="block transition duration-300 hover:text-[#12110f]">
                +57 3016143804
              </a>
            </div>
          </div>

          <div>
            <p className="text-[1.15rem] font-bold uppercase tracking-[0.08em] text-[#12110f]">Ubicación</p>
            <div className="mt-4 space-y-2.5 text-[0.98rem] font-medium text-[#12110f]">
              <p>Medellín, Antioquia, Colombia</p>
            </div>
          </div>
        </div>

        <div className="flex justify-start pt-5 md:justify-end md:pr-28">
          <p className="text-[0.98rem] font-medium text-[#12110f]">© 2026 Quimly · Colombia</p>
        </div>
      </div>
    </footer>
  );
}
