import { CertificatesForm } from "@/components/landing/certificates-form";
import { revenueCards } from "@/data/landing";

const certificateOptions = [
  "Ficha técnica",
  "Hoja de seguridad según GHS",
  "Ficha técnica y hoja de seguridad",
];

export function CertificatesSection() {
  return (
    <section id="certificados" className="relative isolate overflow-hidden bg-[#12110f] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="section-kicker rounded-full">
            CERTIFICADOS
          </p>
          <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Toda la documentación técnica de tus productos Quimly.
          </h2>
        </div>

        <div className="mx-auto w-full max-w-[34rem]">
          <p className="mb-6 text-lg leading-8 text-white/62">
            Llena los campos del formulario según el tipo de certificado que requieres y el tipo de producto Quimly, para descagar en PDF.
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
