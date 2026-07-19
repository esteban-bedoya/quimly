import Image from "next/image";
import type { ReactNode } from "react";

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path strokeLinecap="round" d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path strokeLinecap="round" d="M12 14v2" />
    </svg>
  );
}

export function MercadoPagoInfoCard({
  title,
  description = "Procesado de forma segura con Mercado Pago",
  note = "Tu información se cifra directamente en Mercado Pago. Quimly nunca recibe los datos de tu tarjeta.",
  action,
}: {
  title: string;
  description?: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-[#d9e7e9] bg-[linear-gradient(135deg,#f8ffff_0%,#f1fafb_58%,#fbfcf7_100%)] p-4 shadow-[0_12px_30px_rgba(18,17,15,0.045)]">
      {action ? (
        <>
          <div className="absolute right-3 top-2.5">{action}</div>
          <div className="absolute right-11 top-2.5 flex items-center gap-1.5 rounded-full border border-[#cbe4e7] bg-white/80 px-2.5 py-1.5 text-[0.67rem] font-semibold text-[#277581]">
            <LockIcon />
            <span>Seguro</span>
          </div>
        </>
      ) : null}
      <div className={`flex items-start justify-between gap-3 ${action ? "-mt-1.5" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#ffe600] shadow-[0_5px_12px_rgba(116,101,0,0.14)]">
            <Image
              src="/logos/mercado-pago-emblem.png"
              alt="Mercado Pago"
              width={126}
              height={90}
              className="h-auto w-11"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[-0.015em] text-[#12110f]">{title}</p>
            <p className={`mt-0.5 text-xs leading-5 text-[#5e6770] ${action ? "max-w-[10rem]" : ""}`}>{description}</p>
          </div>
        </div>
        {!action ? (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#cbe4e7] bg-white/80 px-2.5 py-1.5 text-[0.67rem] font-semibold text-[#277581]">
            <LockIcon />
            <span>Seguro</span>
          </div>
        ) : null}
      </div>
      <p className="mt-3 border-t border-[#dce9ea] pt-3 text-xs leading-5 text-[#657078]">{note}</p>
    </div>
  );
}
