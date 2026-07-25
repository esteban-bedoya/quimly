import Image from "next/image";
import { QUIMLY_WHATSAPP_URL } from "@/lib/whatsapp";

export function Hero() {
  return (
    <section id="hero" className="relative isolate overflow-hidden bg-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-10 px-5 pb-14 pt-44 sm:gap-12 sm:px-8 sm:pb-16 sm:pt-32 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-14 lg:px-10 lg:pb-20 lg:pt-28">
        <div className="flex flex-col justify-center">
          <p className="mb-6 w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-black sm:mb-8 sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
            TECNOLOGÍA SANITARIA PARA <span className="font-black">RESTAURANTES.</span>
          </p>

          <h1 className="max-w-4xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] text-black sm:text-4xl lg:text-5xl">
            Lleva tu operación sanitaria al siguiente nivel.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-black sm:mt-7 sm:text-lg sm:leading-8 lg:text-[1.2rem]">
            Digitaliza las bitácoras obligatorias de tu restaurante, centraliza tu gestión documental y olvídate de las multas con automatizaciones inteligentes.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:flex sm:flex-row">
            <a
              href={QUIMLY_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#12110f] px-4 py-3.5 text-center text-sm font-semibold text-white transition duration-300 hover:scale-[1.08] hover:bg-[#1d1b18] sm:min-w-[190px] sm:w-auto sm:px-6 sm:py-4"
            >
              <Image
                src="/logos/whatsapp.svg"
                alt=""
                aria-hidden="true"
                width={18}
                height={18}
                className="h-[1.125rem] w-[1.125rem] shrink-0"
              />
              Asesoría
            </a>
            <a
              href="#certificados"
              className="min-h-12 w-full rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-4 py-3.5 text-center text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#e7e7e7] sm:min-w-[190px] sm:w-auto sm:px-6 sm:py-4"
            >
              Certificados
            </a>
          </div>
        </div>

        <div className="flex items-center justify-center lg:justify-end">
          <div className="w-full max-w-[420px] sm:max-w-[560px] lg:max-w-[760px]">
            <div>
              <Image
                src="/images/celular5.png"
                alt="Vista de Quimly en un celular"
                width={1277}
                height={1232}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
