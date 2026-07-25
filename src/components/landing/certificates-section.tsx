import Link from "next/link";

const planFeatures = [
  "Acceso total durante los 14 días gratis: bitácoras, documentos y alertas.",
  "Bitácoras digitales ilimitadas para registros de temperaturas, limpiezas, materias primas y agua potable.",
  "Gestión documental centralizada con alertas de vencimiento.",
  "Notificaciones automáticas vía WhatsApp.",
  "Historiales y reportes listos para auditorías del INVIMA.",
];

export function CertificatesSection() {
  return (
    <section id="certificados" className="relative isolate overflow-hidden bg-[#12110f] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-10 lg:py-28">
      <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.02fr)] lg:items-center lg:gap-12">
        <div className="max-w-4xl">
          <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-[#48c7d2] sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
            PLANES Y PRECIOS
          </p>
          <h2 className="mt-4 max-w-4xl text-[2.1rem] font-bold leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:text-4xl lg:text-5xl">
            Empieza gratis,
            <br />
            prueba 14 días.
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/68 sm:mt-6 sm:text-lg sm:leading-8">
            Acceso total e inmediato a todas las herramientas. Sin tarjeta de crédito, sin contratos de permanencia.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#48c7d2] px-6 py-3.5 text-center text-sm font-bold text-[#12110f] transition duration-300 hover:scale-[1.02] hover:bg-[#78dce3] sm:w-auto sm:min-w-[260px] sm:py-4"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
              Iniciar mis 14 días gratis
            </Link>
          </div>
        </div>

        <div className="max-w-3xl lg:w-full lg:max-w-[34rem] lg:justify-self-end">
          <article className="overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.06] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-7 lg:p-8">
            <div className="border-b border-white/12 pb-6 sm:pb-7">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[2rem] font-semibold tracking-[-0.04em] text-white sm:text-[2.75rem]">$0 COP</span>
                <span className="text-base text-white/66 sm:text-lg">durante los primeros 14 días.</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/68 sm:text-base">Luego,</p>
              <p className="mt-2 text-sm leading-6 text-white/68 sm:text-base">
                <span className="font-semibold text-white">$24.900 COP / mes</span> por la primera sede.
              </p>
              <p className="mt-2 text-sm leading-6 text-white/68 sm:text-base">
                <span className="font-semibold text-white">+$9.900 COP / mes</span> por cada sede adicional.
              </p>
            </div>

            <div className="pt-6 sm:pt-7">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white/82">Todo esto está incluido</h3>
              <ul className="mt-5 grid gap-3.5 text-sm leading-6 text-white/78 sm:text-base sm:leading-7">
                {planFeatures.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 text-lg font-bold leading-6 text-[#48c7d2]">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </div>

    </section>
  );
}
