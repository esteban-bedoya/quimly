import { legacyProblems, quimlyAdvantages } from "@/data/landing";

export function EcosystemSection() {
  return (
    <section id="ecosistema" className="relative isolate overflow-hidden bg-[#12110f] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-10 lg:py-28">
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-10">
          <div>
            <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-[#48c7d2] sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
              ECOSISTEMA QUIMLY
            </p>
            <h2 className="mt-4 max-w-3xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:text-4xl lg:text-5xl">
              Cero estrés en las
              <br className="hidden lg:block" /> visitas de sanidad.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
            Un ecosistema integral diseñado para optimizar procesos sanitarios y profesionalizar operaciones gastronómicas.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 lg:mx-auto lg:max-w-6xl lg:grid-cols-2 lg:gap-5">
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
    <article className={`rounded-[2rem] border p-5 sm:p-6 lg:p-7 ${muted ? "border-white/10 bg-white/[0.03]" : "border-[#48c7d2]/30 bg-[#48c7d2]/10"}`}>
      <h3 className="text-xl font-semibold sm:text-2xl">{title}</h3>
      <ul className="mt-5 space-y-3.5 sm:mt-6 sm:space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
            <span
              aria-hidden="true"
              className={`mt-0.5 min-w-5 shrink-0 text-base font-semibold leading-6 sm:text-lg sm:leading-7 ${markerColor}`}
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
