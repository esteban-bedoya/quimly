import { heroMetrics, platformHighlights } from "@/data/landing";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#f4efe7]">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-20">
        <div className="flex flex-col justify-center">
          <p className="mb-8 w-fit rounded-md border border-[#12110f]/10 px-3 py-2 text-sm font-semibold text-[#5e5a51]">
            Operaciones químicas, por fin en un solo sistema
          </p>

          <h1 className="max-w-5xl text-[4rem] font-semibold leading-[0.88] tracking-normal text-[#12110f] sm:text-[6rem] lg:text-[7.8rem]">
            The Future
            <span className="block pl-[0.18em]">of Chemical</span>
            <span className="block">Management</span>
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#5e5a51] sm:text-xl">
            Quimly centraliza inventario, lotes, compras, producción, calidad,
            documentación y reportes para empresas químicas que necesitan operar
            con control, velocidad y trazabilidad.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#demo"
              className="rounded-md bg-[#12110f] px-6 py-4 text-center text-sm font-semibold text-white transition hover:bg-[#2b2924]"
            >
              Probar la plataforma
            </a>
            <a
              href="#platform"
              className="rounded-md border border-[#12110f]/20 px-6 py-4 text-center text-sm font-semibold text-[#12110f] transition hover:border-[#12110f]/40 hover:bg-white/45"
            >
              Ver modulos
            </a>
          </div>
        </div>

        <div className="flex items-center lg:justify-end">
          <div className="w-full max-w-[560px]">
            <div className="rounded-lg border border-[#12110f]/10 bg-[#12110f] p-3 shadow-2xl shadow-[#12110f]/20">
              <div className="rounded-md bg-[#efeadf] p-4">
                <div className="flex items-center justify-between border-b border-[#12110f]/10 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6f3d]">
                      Command center
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-[#12110f]">Lote QL-2048</p>
                  </div>
                  <span className="rounded-md bg-[#c9e265] px-3 py-2 text-xs font-bold text-[#12110f]">
                    Liberado
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {platformHighlights.map((item) => (
                    <article key={item.title} className="rounded-md border border-[#12110f]/10 bg-white/65 p-4">
                      <div className="mb-5 h-2 rounded-full bg-[#12110f]/10">
                        <div className="h-2 w-2/3 rounded-full bg-[#d8764a]" />
                      </div>
                      <h2 className="text-base font-semibold text-[#12110f]">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-[#5e5a51]">{item.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 border-y border-[#12110f]/10 py-5">
              {heroMetrics.map((metric) => (
                <div key={metric.label} className="px-3 first:pl-0 last:pr-0">
                  <p className="text-3xl font-semibold text-[#12110f]">{metric.value}</p>
                  <p className="mt-1 text-sm leading-5 text-[#5e5a51]">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
