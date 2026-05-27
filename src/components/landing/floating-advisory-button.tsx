"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { QUIMLY_WHATSAPP_URL } from "@/lib/whatsapp";

const FLOATING_GAP = 24;
const DRAG_THRESHOLD = 8;

type Position = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getBounds(element: HTMLElement) {
  const maxX = Math.max(FLOATING_GAP, window.innerWidth - element.offsetWidth - FLOATING_GAP);
  const maxY = Math.max(FLOATING_GAP, window.innerHeight - element.offsetHeight - FLOATING_GAP);

  return { maxX, maxY };
}

export function FloatingAdvisoryButton() {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const positionRef = useRef<Position>({ x: FLOATING_GAP, y: FLOATING_GAP });
  const dragStateRef = useRef({
    hasMoved: false,
    isDragging: false,
    originPointerX: 0,
    originPointerY: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  });
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ x: FLOATING_GAP, y: FLOATING_GAP });

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const syncFloatingButtonState = () => {
      const hero = document.getElementById("hero");

      if (!hero) {
        return;
      }

      const heroRect = hero.getBoundingClientRect();
      const heroMidpoint = heroRect.top + heroRect.height / 2;
      setIsVisible(heroMidpoint <= 0);
    };

    const syncPosition = () => {
      const button = buttonRef.current;

      if (!button) {
        return;
      }

      const { maxX, maxY } = getBounds(button);
      const defaultY = clamp(window.innerHeight * 0.8 - button.offsetHeight / 2, FLOATING_GAP, maxY);

      setPosition((current) => {
        if (
          current.x === FLOATING_GAP &&
          current.y === FLOATING_GAP
        ) {
          return {
            x: maxX,
            y: defaultY,
          };
        }

        return {
          x: clamp(current.x, FLOATING_GAP, maxX),
          y: clamp(current.y, FLOATING_GAP, maxY),
        };
      });
    };

    let frameId = window.requestAnimationFrame(() => {
      syncPosition();
      syncFloatingButtonState();
    });

    const queueFloatingButtonSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncFloatingButtonState);
    };

    const handleResize = () => {
      syncPosition();
      queueFloatingButtonSync();
    };

    window.addEventListener("scroll", queueFloatingButtonSync, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", queueFloatingButtonSync);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const button = buttonRef.current;

      if (!button || !dragStateRef.current.isDragging || dragStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragStateRef.current.originPointerX;
      const deltaY = event.clientY - dragStateRef.current.originPointerY;
      const nextX = dragStateRef.current.originX + deltaX;
      const nextY = dragStateRef.current.originY + deltaY;
      const { maxX, maxY } = getBounds(button);

      if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
        dragStateRef.current.hasMoved = true;
      }

      setPosition({
        x: clamp(nextX, FLOATING_GAP, maxX),
        y: clamp(nextY, FLOATING_GAP, maxY),
      });
    };

    const finishDrag = (event: PointerEvent) => {
      if (dragStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      if (buttonRef.current?.hasPointerCapture(event.pointerId)) {
        buttonRef.current.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current.isDragging = false;
      dragStateRef.current.pointerId = -1;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  return (
    <a
      ref={buttonRef}
      href={QUIMLY_WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      onClick={(event) => {
        if (dragStateRef.current.hasMoved) {
          event.preventDefault();
          dragStateRef.current.hasMoved = false;
        }
      }}
      onPointerDown={(event) => {
        const button = buttonRef.current;

        if (!button) {
          return;
        }

        dragStateRef.current.isDragging = true;
        dragStateRef.current.hasMoved = false;
        dragStateRef.current.pointerId = event.pointerId;
        dragStateRef.current.originPointerX = event.clientX;
        dragStateRef.current.originPointerY = event.clientY;
        dragStateRef.current.originX = position.x;
        dragStateRef.current.originY = position.y;

        button.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerUp={(event) => {
        if (buttonRef.current?.hasPointerCapture(event.pointerId)) {
          buttonRef.current.releasePointerCapture(event.pointerId);
        }

        dragStateRef.current.isDragging = false;
        dragStateRef.current.pointerId = -1;
      }}
      onPointerCancel={(event) => {
        if (buttonRef.current?.hasPointerCapture(event.pointerId)) {
          buttonRef.current.releasePointerCapture(event.pointerId);
        }

        dragStateRef.current.isDragging = false;
        dragStateRef.current.pointerId = -1;
      }}
      className={`fixed z-40 inline-flex h-18 w-18 cursor-grab items-center justify-center rounded-full border-2 border-[#e8e2d8] bg-[#12110f] text-white shadow-[0_18px_45px_rgba(18,17,15,0.24)] transition-[opacity,transform,background-color] duration-300 hover:scale-110 hover:bg-[#1d1b18] active:cursor-grabbing ${
        isVisible ? "pointer-events-auto opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
      }}
      aria-label="Solicitar asesoría"
    >
      <Image
        src="/logos/whatsapp.svg"
        alt=""
        aria-hidden="true"
        width={30}
        height={30}
        className="h-[1.875rem] w-[1.875rem] shrink-0"
      />
    </a>
  );
}
