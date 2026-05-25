import { legacyProblems, quimlyAdvantages } from "@/data/landing";

export function ProblemComparison() {
  return (
    <section id="operations" className="bg-[#12110f] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="section-kicker rounded-full">
              ECOSISTEMA QUIMLY
            </p>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Más que productos químicos.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white sm:text-xl">
            Un ecosistema integral diseñado para optimizar procesos sanitarios y profesionalizar operaciones gastronómicas.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:mx-auto lg:max-w-6xl lg:grid-cols-2">
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
  const marker = muted ? "×" : "✓";
  const markerColor = muted ? "text-[#d86c61]" : "text-[#48c7d2]";

  return (
    <article className={`rounded-[2rem] border p-5 sm:p-6 ${muted ? "border-white/10 bg-white/[0.03]" : "border-[#48c7d2]/30 bg-[#48c7d2]/10"}`}>
      <h3 className="text-2xl font-semibold">{title}</h3>
      <ul className="mt-7 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-base leading-7 text-white/72">
            <span
              aria-hidden="true"
              className={`mt-0.5 min-w-5 shrink-0 text-lg font-semibold leading-7 ${markerColor}`}
            >
              {marker}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
