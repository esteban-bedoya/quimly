import { CertificateDownloadForm } from "@/components/landing/certificate-download-form";
import { revenueCards } from "@/data/landing";

const certificateOptions = [
  "Ficha técnica",
  "Hoja de seguridad según GHS",
  "Ficha técnica y hoja de seguridad",
];

export function DemoForm() {
  return (
    <section id="demo" className="bg-[#12110f] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="section-kicker rounded-full">
            CERTIFICADOS
          </p>
          <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Toda la documentación técnica de tus productos Quimly.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/62">
            Llena los campos del formulario según el tipo de certificado que requieres y el tipo de producto Quimly, para descagar en PDF.
          </p>
        </div>

        <CertificateDownloadForm
          products={revenueCards.map((product) => product.title)}
          certificateOptions={certificateOptions}
        />
      </div>
    </section>
  );
}
