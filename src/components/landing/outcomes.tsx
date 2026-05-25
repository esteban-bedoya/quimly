import { revenueCards } from "@/data/landing";

export function Outcomes() {
  return (
    <section id="outcomes" className="bg-[#f4efe7] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <p className="w-fit rounded-full border border-[#12110f]/12 px-3.5 py-2 text-[0.8rem] font-extrabold uppercase tracking-[0.16em] text-[#12110f]">
              RESULTADOS
            </p>
            <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-[#12110f] sm:text-5xl lg:text-6xl">
              Una plataforma que se paga con menos friccion y mejores decisiones.
            </h2>
          </div>
          <p className="max-w-xl text-lg leading-8 text-[#5e5a51]">
            La vista inicial replica la cadencia de Muse: tipografia protagonista,
            bloques editoriales, comparacion directa y un cierre de conversion.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {revenueCards.map((card, index) => (
            <article key={card.title} className="rounded-lg border border-[#12110f]/10 bg-white/60 p-5">
              <p className="text-sm font-semibold text-[#8a6f3d]">0{index + 1}</p>
              <h3 className="mt-10 text-2xl font-semibold leading-tight text-[#12110f]">{card.title}</h3>
              <p className="mt-4 text-sm leading-6 text-[#5e5a51]">{card.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
