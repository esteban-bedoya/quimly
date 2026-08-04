import { legacyProblems, quimlyAdvantages } from "@/data/landing";

export function EcosystemSection() {
  return (
    <section id="ecosistema" className="relative isolate overflow-hidden bg-[#12110f] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-[clamp(2rem,2.5vw,2.5rem)] lg:py-[clamp(6rem,7vw,7rem)]">
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-6 min-[900px]:grid-cols-[0.9fr_1.1fr] min-[900px]:items-end min-[900px]:gap-[clamp(2rem,2.5vw,2.5rem)]">
          <div>
            <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-[#48c7d2] sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
              ECOSISTEMA
            </p>
            <h2 className="mt-4 max-w-3xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:text-4xl lg:text-[clamp(2.25rem,3.25vw,3rem)]">
              Cero estrés en las
              <br className="hidden lg:block" /> visitas de sanidad.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
            Un ecosistema integral diseñado para optimizar procesos sanitarios y profesionalizar operaciones gastronómicas.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 min-[900px]:mx-auto min-[900px]:max-w-6xl min-[900px]:grid-cols-2 min-[900px]:gap-[clamp(1rem,1.25vw,1.25rem)]">
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
    <article className={`rounded-[2rem] border p-5 sm:p-6 lg:p-[clamp(1.5rem,1.75vw,1.75rem)] ${muted ? "border-white/10 bg-white/[0.03]" : "border-[#48c7d2]/30 bg-[#48c7d2]/10"}`}>
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
