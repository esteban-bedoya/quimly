"use client";

import { useEffect, useRef, useState } from "react";

type CustomSelectProps = {
  label: string;
  name: string;
  options: string[];
  placeholder: string;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="9"
      viewBox="0 0 14 9"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`transition duration-300 ${open ? "rotate-180" : ""}`}
    >
      <path d="M1 1.5L7 7.5L13 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CustomSelect({ label, name, options, placeholder }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <label className="grid gap-2 text-sm font-medium text-white/70">
      {label}
      <div className="relative" ref={wrapperRef}>
        <input type="hidden" name={name} value={selectedValue} />
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className={`flex w-full items-center justify-between rounded-full border border-transparent bg-[#F6F4EF] px-5 py-3 text-left text-base text-[#3d392f] outline-none transition ${
            isOpen ? "bg-[#f1ede6]" : "hover:bg-[#f0ece4]"
          }`}
        >
          <span className={selectedValue ? "text-[#3d392f]" : "text-[#8d877b]"}>{selectedValue || placeholder}</span>
          <span className="ml-4 shrink-0 text-[#5e5a51]">
            <Chevron open={isOpen} />
          </span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-20 overflow-hidden rounded-[1.5rem] border border-transparent bg-[#F6F4EF] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
            <ul className="grid gap-1">
              {options.map((option) => {
                const isSelected = option === selectedValue;

                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedValue(option);
                        setIsOpen(false);
                      }}
                      className={`w-full rounded-[1rem] px-4 py-3 text-left text-sm transition ${
                        isSelected ? "bg-[#e9e4dc] text-[#12110f]" : "text-[#3d392f] hover:bg-[#ece7df]"
                      }`}
                    >
                      {option}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </label>
  );
}

type CertificateDownloadFormProps = {
  products: string[];
  certificateOptions: string[];
};

export function CertificateDownloadForm({ products, certificateOptions }: CertificateDownloadFormProps) {
  return (
    <form className="mx-auto w-full max-w-[34rem] rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
      <div className="grid gap-4">
        <CustomSelect
          label="Producto:"
          name="product"
          options={products}
          placeholder="Selecciona el producto"
        />

        <CustomSelect
          label="Certificado:"
          name="certificate"
          options={certificateOptions}
          placeholder="Selecciona el certificado"
        />
      </div>

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          className="inline-flex min-w-[190px] items-center justify-center rounded-full border border-[#12110f]/18 bg-[#e8e2d8] px-6 py-4 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#d6d2cc]"
        >
          Generar PDF
        </button>
      </div>
    </form>
  );
}
