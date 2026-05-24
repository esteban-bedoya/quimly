export function Footer() {
  return (
    <footer className="border-t border-[#12110f]/10 bg-[#f4efe7] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#5e5a51] md:flex-row md:items-center">
        <p className="font-semibold text-[#12110f]">Quimly</p>
        <p>Next.js + Tailwind + Supabase + PostgreSQL.</p>
        <p>© 2026 Quimly. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
