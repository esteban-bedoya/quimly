"use client";

import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { revenueCards } from "@/data/landing";

const AUTOPLAY_DELAY = 3800;
const EASING = [0.22, 1, 0.36, 1] as const;

function getLoopDistance(index: number, selectedIndex: number, total: number) {
  const rawDistance = index - selectedIndex;

  if (Math.abs(rawDistance) <= total / 2) {
    return rawDistance;
  }

  return rawDistance > 0 ? rawDistance - total : rawDistance + total;
}

export function ProductsSection() {
  const cardCount = revenueCards.length;
  const hasMultipleCards = cardCount > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
      align: "center",
      containScroll: false,
      dragFree: false,
      loop: false,
      slidesToScroll: 1,
      skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAutoplayPaused, setIsAutoplayPaused] = useState(false);

  const syncSelection = useEffectEvent(() => {
    if (!emblaApi || cardCount === 0) {
      return;
    }

    const snapIndex = emblaApi.selectedScrollSnap();
    const normalizedIndex = ((snapIndex % cardCount) + cardCount) % cardCount;

    startTransition(() => {
      setSelectedIndex(normalizedIndex);
    });
  });

  const advanceCarousel = useEffectEvent(() => {
    if (!emblaApi || !hasMultipleCards) {
      return;
    }

    if (!emblaApi.canScrollNext()) {
      emblaApi.scrollTo(0);
      return;
    }

    emblaApi.scrollNext();
  });

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    syncSelection();
    emblaApi.on("reInit", syncSelection);
    emblaApi.on("select", syncSelection);

    return () => {
      emblaApi.off("reInit", syncSelection);
      emblaApi.off("select", syncSelection);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!hasMultipleCards || isAutoplayPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      advanceCarousel();
    }, AUTOPLAY_DELAY);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasMultipleCards, isAutoplayPaused]);

  return (
    <section
      id="productos"
      className="relative isolate overflow-hidden bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-28"
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr] lg:items-end lg:gap-10">
          <div>
            <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-black sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
              PRODUCTOS
            </p>
            <h2 className="mt-4 max-w-4xl text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.03em] text-[#12110f] sm:mt-5 sm:text-4xl lg:text-5xl">
              Abastécete con Quimly
              <br /> 
              y digitaliza
              <br />
              <span className="font-normal tracking-[-0.015em]">sin cobro adicional.</span>

            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-black sm:text-lg sm:leading-8">
            Incluye fichas técnicas actualizadas y hojas de seguridad según GHS.
          </p>
        </div>

        <div className="mt-10 overflow-visible sm:mt-12 lg:mt-14">
          <div className="-mx-5 sm:-mx-8 lg:-mx-10">
            <div
              className="overflow-visible px-5 sm:px-8 lg:px-10"
              ref={emblaRef}
              onMouseEnter={() => setIsAutoplayPaused(true)}
              onMouseLeave={() => setIsAutoplayPaused(false)}
            >
              <div className="flex touch-pan-y items-stretch py-6 sm:py-8">
                {revenueCards.map((card, index) => {
                  const distance = getLoopDistance(index, selectedIndex, cardCount);
                  const isActive = distance === 0;
                  const isAdjacent = Math.abs(distance) === 1;

                  return (
                    <motion.article
                      key={card.title}
                      animate={{
                        filter: isActive ? "blur(0px)" : "blur(0.8px)",
                        opacity: isActive ? 1 : isAdjacent ? 0.7 : 0.46,
                        rotate: isActive ? 0 : distance < 0 ? -3.5 : 3.5,
                        scale: isActive ? 1 : isAdjacent ? 0.9 : 0.82,
                        y: isActive ? -12 : isAdjacent ? 10 : 20,
                      }}
                      transition={{ duration: 0.85, ease: EASING }}
                      className="min-w-0 flex-[0_0_88%] pl-2 pr-2 sm:flex-[0_0_64%] sm:pl-3 sm:pr-3 lg:flex-[0_0_40%] xl:flex-[0_0_35%]"
                    >
                      <button
                        type="button"
                        onClick={() => emblaApi?.scrollTo(index)}
                        className={`relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[2rem] border px-4 py-5 text-left backdrop-blur-xl transition duration-500 sm:px-5 sm:py-6 md:px-6 ${
                          isActive
                            ? "border-white/80 bg-white/74 shadow-[0_28px_70px_rgba(18,17,15,0.14)]"
                            : "border-white/55 bg-white/48 shadow-[0_18px_45px_rgba(18,17,15,0.08)]"
                        }`}
                      >
                        <motion.div
                          animate={{
                            scale: isActive ? 1.06 : 1,
                            y: isActive ? -4 : 0,
                          }}
                          transition={{ duration: 0.8, ease: EASING }}
                          className="relative flex min-h-[220px] items-center justify-center sm:min-h-[252px]"
                        >
                          <Image
                            src={card.image}
                            alt={card.title}
                            width={340}
                            height={340}
                            className="h-auto max-h-[210px] w-auto object-contain drop-shadow-[0_20px_26px_rgba(18,17,15,0.14)] sm:max-h-[244px]"
                          />
                        </motion.div>

                        <div className="relative mt-2 sm:mt-3">
                          <p className="text-[0.72rem] font-bold uppercase tracking-[0.24em] text-[#2f98a2]">Grado industrial</p>
                          <h3 className="mt-3 text-xl font-semibold leading-tight text-[#12110f] sm:text-2xl">{card.title}</h3>
                          <p className="mt-3 max-w-[32ch] text-sm leading-6 text-black">{card.description}</p>
                        </div>
                      </button>
                    </motion.article>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2 sm:mt-8">
              {revenueCards.map((card, index) => {
                const isActive = index === selectedIndex;

                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(index)}
                    aria-label={`Ir a ${card.title}`}
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      isActive ? "w-10 bg-[#12110f]" : "w-2.5 bg-[#12110f]/20 hover:bg-[#12110f]/35"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
