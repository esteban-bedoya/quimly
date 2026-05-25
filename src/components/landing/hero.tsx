import Image from "next/image";

export function Hero() {
  return (
    <section id="hero" className="relative isolate overflow-hidden bg-[#f4efe7]">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-7xl gap-10 px-5 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8 lg:grid-cols-[1fr_1fr] lg:px-10 lg:py-10">
        <div className="flex flex-col justify-center">
          <p className="mb-8 w-fit rounded-full border border-[#12110f]/22 px-3.5 py-2 text-[0.8rem] font-extrabold uppercase tracking-[0.16em] text-[#12110f]">
            TECNOLOGÍA SANITARIA PARA <span className="font-black">RESTAURANTES.</span>
          </p>

          <h1 className="max-w-5xl text-4xl font-semibold leading-[0.95] tracking-normal text-[#12110f] sm:text-6xl lg:text-7xl">
            Lleva tu operación sanitaria al siguiente nivel.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#5e5a51] sm:text-xl">
            Digitaliza procesos, mejora el cumplimiento INVIMA y optimiza tu operación con Quimly.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#demo"
              className="min-w-[190px] rounded-full bg-[#12110f] px-6 py-4 text-center text-sm font-semibold text-white transition duration-300 hover:scale-[1.08] hover:bg-[#1d1b18]"
            >
              Asesoría
            </a>
            <a
              href="#platform"
              className="min-w-[190px] rounded-full border border-[#12110f]/18 bg-[#e8e2d8] px-6 py-4 text-center text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#d6d2cc]"
            >
              Ver productos
            </a>
          </div>
        </div>

        <div className="flex items-center justify-center lg:justify-end">
          <div className="w-full max-w-[680px] sm:max-w-[760px] lg:max-w-[860px]">
            <div>
              <Image
                src="/images/celular3.PNG"
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
