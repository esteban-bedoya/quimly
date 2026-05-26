import Link from "next/link";

import { navItems } from "@/data/landing";

export function Footer() {
  return (
    <footer id="footer" className="relative overflow-hidden bg-white px-5 pb-8 pt-12 sm:px-8 sm:pt-14 lg:px-10">
      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-8 border-b border-[#12110f]/12 pb-8 md:grid-cols-3 md:gap-8 md:pb-10 lg:gap-12">
          <div>
            <p className="text-[1rem] font-bold uppercase tracking-[0.08em] text-[#12110f] sm:text-[1.1rem]">Navegación</p>
            <div className="mt-3 space-y-2.5 text-[0.95rem] font-semibold text-[#4f4b45] sm:mt-4 sm:text-[0.98rem]">
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
            <p className="text-[1rem] font-bold uppercase tracking-[0.08em] text-[#12110f] sm:text-[1.1rem]">Contacto</p>
            <div className="mt-3 space-y-2.5 text-[0.95rem] font-medium text-[#4f4b45] sm:mt-4 sm:text-[0.98rem]">
              <Link href="mailto:contacto.quimly@gmail.com" className="block transition duration-300 hover:text-[#12110f]">
                contacto.quimly@gmail.com
              </Link>
              <a href="tel:+573016143804" className="block transition duration-300 hover:text-[#12110f]">
                +57 3016143804
              </a>
            </div>
          </div>

          <div>
            <p className="text-[1rem] font-bold uppercase tracking-[0.08em] text-[#12110f] sm:text-[1.1rem]">Ubicación</p>
            <div className="mt-3 space-y-2.5 text-[0.95rem] font-medium text-[#12110f] sm:mt-4 sm:text-[0.98rem]">
              <p>Medellín, Antioquia, Colombia</p>
            </div>
          </div>
        </div>

        <div className="flex justify-start pt-4 md:justify-end md:pr-28 md:pt-5">
          <p className="text-[0.92rem] font-medium text-[#12110f] sm:text-[0.98rem]">© 2026 Quimly · Colombia</p>
        </div>
      </div>
    </footer>
  );
}
