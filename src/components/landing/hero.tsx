import Image from "next/image";
import { QUIMLY_WHATSAPP_URL } from "@/lib/whatsapp";

export function Hero() {
  return (
    <section id="hero" className="relative isolate overflow-hidden bg-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-10 px-5 pb-14 pt-44 sm:gap-12 sm:px-8 sm:pb-16 sm:pt-32 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[900px]:items-center min-[900px]:gap-[clamp(2.5rem,3.5vw,3.5rem)] min-[900px]:px-[clamp(2rem,2.5vw,2.5rem)] min-[900px]:pb-[clamp(4rem,5vw,5rem)] min-[900px]:pt-[clamp(6rem,8vw,7rem)]">
        <div className="min-w-0 flex flex-col justify-center">
          <p className="mb-6 w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-black sm:mb-8 sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
            TECNOLOGÍA SANITARIA PARA <span className="font-black">RESTAURANTES.</span>
          </p>

          <h1 className="max-w-4xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] text-black sm:text-4xl min-[900px]:text-[clamp(2.25rem,3.25vw,2.6rem)] lg:text-[clamp(2.6rem,3.25vw,3rem)]">
            Lleva tu operación sanitaria al siguiente nivel.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-black sm:mt-7 sm:text-lg sm:leading-8 lg:text-[clamp(1.125rem,1.3vw,1.2rem)]">
            Simplifica el control sanitario de tu restaurante: digitaliza bitácoras, organiza documentos y mantén tu operación lista para cada inspección.
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
              Empezar gratis
            </a>
          </div>
        </div>

        <div className="min-w-0 flex items-center justify-center min-[900px]:justify-end">
          <div className="w-full max-w-[420px] sm:max-w-[560px] min-[900px]:max-w-[clamp(22rem,42vw,29.375rem)] lg:max-w-[clamp(29.375rem,36vw,47.5rem)]">
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
