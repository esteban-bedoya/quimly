"use client";

import useEmblaCarousel from "embla-carousel-react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { softwareModuleCards } from "@/data/landing";

const EASING = [0.22, 1, 0.36, 1] as const;

function getLoopDistance(index: number, selectedIndex: number, total: number) {
  const rawDistance = index - selectedIndex;

  if (Math.abs(rawDistance) <= total / 2) {
    return rawDistance;
  }

  return rawDistance > 0 ? rawDistance - total : rawDistance + total;
}

export function ProductsSection() {
  const cardCount = softwareModuleCards.length;
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
  const leftArrowMotion = useAnimationControls();
  const rightArrowMotion = useAnimationControls();
  const shouldReduceMotion = useReducedMotion();

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
    if (shouldReduceMotion) {
      leftArrowMotion.set({ x: 0 });
      rightArrowMotion.set({ x: 0 });
      return;
    }

    const transition = { duration: 1.1, ease: EASING, repeat: Infinity, repeatDelay: 1 };

    void leftArrowMotion.start({ x: [0, -18, 0], transition });
    void rightArrowMotion.start({ x: [0, 18, 0], transition });
  }, [leftArrowMotion, rightArrowMotion, selectedIndex, shouldReduceMotion]);

  return (
    <section
      id="productos"
      className="relative isolate overflow-hidden bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-8 lg:py-24 xl:px-10 xl:py-28"
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr] lg:items-end lg:gap-8 xl:gap-10">
          <div>
            <p className="w-fit px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.2em] text-black sm:px-3.5 sm:py-2 sm:text-[0.9rem]">
              SOLUCIONES
            </p>
            <h2 className="mt-4 max-w-4xl text-[2.1rem] font-bold leading-[1.02] tracking-[-0.03em] text-[#12110f] sm:mt-5 sm:text-4xl lg:text-4xl xl:text-5xl">
              Todo bajo control,
              <br />
              <span className="tracking-[-0.015em]">desde la cocina hasta la auditoría.</span>
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-black sm:text-lg sm:leading-8">
            Todo lo que necesitas para mantener tu restaurante organizado y preparado para cumplir con el INVIMA.
          </p>
        </div>

        <div className="mt-10 overflow-visible sm:mt-12 lg:mt-12 xl:mt-14">
          <div className="-mx-5 sm:-mx-8 lg:-mx-8 xl:-mx-10">
            <div
              className="overflow-visible px-5 sm:px-8 lg:px-8 xl:px-10"
              ref={emblaRef}
            >
              <div className="flex touch-pan-y items-stretch py-6 sm:py-8">
                {softwareModuleCards.map((card, index) => {
                  const distance = getLoopDistance(index, selectedIndex, cardCount);
                  const isActive = distance === 0;
                  const isAdjacent = Math.abs(distance) === 1;

                  return (
                    <motion.article
                      key={card.title}
                      animate={{
                        filter: isActive ? "blur(0px)" : "blur(0.6px)",
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
                        className={`relative flex h-full w-full cursor-pointer flex-col overflow-visible rounded-[2rem] border px-4 pb-5 pt-7 text-left backdrop-blur-xl transition duration-500 sm:px-5 sm:pb-6 sm:pt-8 md:px-6 ${
                          isActive
                            ? "border-white/80 bg-white/74 shadow-[0_28px_70px_rgba(18,17,15,0.14)]"
                            : "border-white/55 bg-white/48 shadow-[0_18px_45px_rgba(18,17,15,0.08)]"
                        }`}
                      >
                        <Image
                          src={card.icon}
                          alt=""
                          width={96}
                          height={96}
                          sizes="192px"
                          quality={90}
                          className={`pointer-events-none absolute -right-4 -top-4 z-20 size-24 rounded-full border-2 border-white bg-[#d8eff1] object-contain shadow-[0_18px_32px_rgba(18,17,15,0.2)] ${
                            "p-0.5"
                          }`}
                        />

                        <div className="relative pr-24">
                          <p className="text-[1.1875rem] font-semibold leading-tight text-[#12110f] sm:text-[1.375rem]">{card.question}</p>
                        </div>
                        <div aria-hidden="true" className="mt-3 h-px w-full bg-[#12110f]/15" />
                        <p className="mt-3 text-[0.96875rem] leading-6 text-black">{card.description}</p>
                      </button>
                    </motion.article>
                  );
                })}
              </div>
            </div>

            {hasMultipleCards ? (
              <div className="mt-6 flex items-center justify-center gap-3 sm:mt-8">
                {selectedIndex > 0 ? (
                  <motion.button
                    type="button"
                    onClick={() => emblaApi?.scrollPrev()}
                    aria-label="Ver solución anterior"
                    className="inline-flex size-11 items-center justify-center rounded-full border border-[#12110f]/55 text-[#12110f] transition-colors hover:bg-[#12110f]/5"
                    animate={leftArrowMotion}
                  >
                    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </motion.button>
                ) : (
                  <span aria-hidden="true" className="size-11 shrink-0" />
                )}

                <div className="flex gap-2" aria-label="Navegación de soluciones">
                  {softwareModuleCards.map((card, index) => {
                    const isActive = index === selectedIndex;

                    return (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => emblaApi?.scrollTo(index)}
                        aria-label={`Ir a ${card.title}`}
                        aria-current={isActive ? "true" : undefined}
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          isActive ? "w-10 bg-[#12110f]" : "w-2.5 bg-[#12110f]/20 hover:bg-[#12110f]/35"
                        }`}
                      />
                    );
                  })}
                </div>

                {selectedIndex < cardCount - 1 ? (
                  <motion.button
                    type="button"
                    onClick={() => emblaApi?.scrollNext()}
                    aria-label="Ver siguiente solución"
                    className="inline-flex size-11 items-center justify-center rounded-full border border-[#12110f]/55 text-[#12110f] transition-colors hover:bg-[#12110f]/5"
                    animate={rightArrowMotion}
                  >
                    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </motion.button>
                ) : (
                  <span aria-hidden="true" className="size-11 shrink-0" />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
