import { legacyProblems, quimlyAdvantages } from "@/data/landing";

export function ProblemComparison() {
  return (
    <section id="operations" className="bg-[#12110f] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#c9e265]">
              Operar con claridad
            </p>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Las herramientas viejas frenan a los equipos modernos.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white/62">
            Quimly reemplaza archivos dispersos y software generico por una
            capa operacional pensada para materiales, lotes, calidad y decisiones
            diarias.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <ComparisonList title="Antes" items={legacyProblems} muted />
          <ComparisonList title="Con Quimly" items={quimlyAdvantages} />
        </div>
      </div>
    </section>
  );
}

function ComparisonList({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <article className={`rounded-lg border p-6 sm:p-8 ${muted ? "border-white/10 bg-white/[0.03]" : "border-[#c9e265]/30 bg-[#c9e265]/10"}`}>
      <h3 className="text-2xl font-semibold">{title}</h3>
      <ul className="mt-7 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-base leading-7 text-white/72">
            <span className={`mt-2 size-2 shrink-0 rounded-full ${muted ? "bg-[#d8764a]" : "bg-[#c9e265]"}`} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
