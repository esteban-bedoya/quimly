import { CertificatesForm } from "@/components/landing/certificates-form";
import { revenueCards } from "@/data/landing";

const certificateOptions = [
  "Ficha técnica",
  "Hoja de seguridad según GHS",
  "Ficha técnica y hoja de seguridad",
];

export function CertificatesSection() {
  return (
    <section id="certificados" className="relative isolate overflow-hidden bg-[#12110f] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-10 lg:py-28">
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.02fr] lg:items-center lg:gap-12">
        <div>
          <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-[#48c7d2] sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
            CERTIFICADOS
          </p>
          <h2 className="mt-4 max-w-3xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:text-4xl lg:text-5xl">
            Toda la documentación técnica de tus productos Quimly.
          </h2>
        </div>

        <div className="mx-auto w-full max-w-[34rem]">
          <p className="mb-5 text-base leading-7 text-white/62 sm:mb-6 sm:text-lg sm:leading-8">
            Llena los campos del formulario según el tipo de producto Quimly y el certificado que requieras, para descagar en PDF.
          </p>
          <CertificatesForm
            products={revenueCards.map((product) => product.title)}
            certificateOptions={certificateOptions}
          />
        </div>
      </div>
    </section>
  );
}
