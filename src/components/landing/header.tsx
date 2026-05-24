import { navItems } from "@/data/landing";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f4efe7]/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <a href="#" className="flex items-center gap-3 font-semibold tracking-tight text-[#12110f]">
          <span className="grid size-8 place-items-center rounded-md bg-[#12110f] text-sm text-[#f4efe7]">
            Q
          </span>
          Quimly
        </a>

        <div className="hidden items-center gap-8 text-sm font-medium text-[#5e5a51] md:flex">
          {navItems.map((item) => (
            <a key={item.href} className="transition hover:text-[#12110f]" href={item.href}>
              {item.label}
            </a>
          ))}
        </div>

        <a
          href="#demo"
          className="rounded-md bg-[#12110f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b2924]"
        >
          Agendar demo
        </a>
      </nav>
    </header>
  );
}
