import Image from "next/image";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#f4efe7]">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-7xl gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-16">
        <div className="flex flex-col justify-center">
          <p className="mb-8 w-fit rounded-md border border-[#12110f]/12 px-3 py-2 text-sm font-extrabold uppercase tracking-[0.16em] text-[#12110f]">
            TECNOLOGÍA SANITARIA PARA RESTAURANTES.
          </p>

          <h1 className="max-w-5xl text-4xl font-semibold leading-[0.95] tracking-normal text-[#12110f] sm:text-6xl lg:text-7xl">
            Lleva tu operación sanitaria al siguiente nivel.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#5e5a51] sm:text-xl">
            Digitaliza procesos, mejora el cumplimiento INVIMA y optimiza tu
            operación con QUIMLY, todo en un solo lugar.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#demo"
              className="rounded-md bg-[#12110f] px-6 py-4 text-center text-sm font-semibold text-white transition duration-300 hover:scale-[1.08] hover:bg-[#2b2924]"
            >
              Hablar con asesor
            </a>
            <a
              href="#platform"
              className="rounded-md border border-[#12110f]/25 bg-[#f4efe7] px-6 py-4 text-center text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/40 hover:bg-[#fbf8f2]"
            >
              Ver productos
            </a>
          </div>
        </div>

        <div className="flex items-center lg:justify-end">
          <div className="w-full max-w-[630px] lg:max-w-[660px]">
            <div className="overflow-hidden rounded-[2rem] border border-[#12110f]/10 shadow-[16px_22px_42px_rgba(18,17,15,0.24)]">
              <Image
                src="/images/celular.png"
                alt="Vista de Quimly en un celular"
                width={1277}
                height={1232}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
