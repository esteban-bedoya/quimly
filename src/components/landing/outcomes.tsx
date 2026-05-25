"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useState } from "react";

import { revenueCards } from "@/data/landing";

const VISIBLE_CARDS = 3;
const ROTATION_MS = 4200;

export function Outcomes() {
  const [startIndex, setStartIndex] = useState(0);

  const rotateCards = useEffectEvent(() => {
    setStartIndex((currentIndex) => (currentIndex + 1) % revenueCards.length);
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      rotateCards();
    }, ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [rotateCards]);

  const visibleCards = Array.from({ length: Math.min(VISIBLE_CARDS, revenueCards.length) }, (_, offset) => {
    return revenueCards[(startIndex + offset) % revenueCards.length];
  });

  return (
    <section id="outcomes" className="bg-[#f4efe7] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <p className="w-fit rounded-full border border-[#12110f]/22 px-3.5 py-2 text-[0.8rem] font-extrabold uppercase tracking-[0.16em] text-[#12110f]">
              PRODUCTOS
            </p>
            <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-[#12110f] sm:text-5xl lg:text-6xl">
              Abastécete con Quimly y digitaliza tu operación sanitaria sin costo adicional.
            </h2>
          </div>
          <p className="max-w-xl text-lg leading-8 text-[#5e5a51]">
            Productos de grado industrial diseñados bajo estandares sanitarios INVIMA. Incluyen: Fichas Técnicas Actualizadas y Hojas de Seguridad (FDS) según GHS.
          </p>
        </div>

        <div className="mt-14 overflow-hidden">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((card) => (
              <article
                key={card.title}
                className="flex h-full flex-col rounded-[2rem] border border-[#12110f]/10 bg-white/70 p-5 transition duration-500"
              >
                <div className="flex min-h-[200px] items-center justify-center rounded-[1.5rem] bg-[#ece4d7] p-6">
                  <Image
                    src={card.image}
                    alt={card.title}
                    width={260}
                    height={260}
                    className="h-auto max-h-[180px] w-auto object-contain"
                  />
                </div>

                <h3 className="mt-6 text-2xl font-semibold leading-tight text-[#12110f]">{card.title}</h3>
                <p className="mt-4 text-sm leading-6 text-[#5e5a51]">{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
