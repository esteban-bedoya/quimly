"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export const operationalFormStyles = {
  page: "min-h-screen bg-[#f2f7f5] px-4 py-5 text-[#111816]",
  shell: "mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col justify-center",
  panel:
    "overflow-hidden rounded-[2rem] border border-[#cfe0dc] bg-[radial-gradient(circle_at_top_left,#d6fff4_0%,#f5fffb_34%,rgba(255,255,255,0.96)_64%,#ffffff_100%)] shadow-[0_24px_80px_rgba(17,24,22,0.12)]",
  header: "px-5 pb-5 pt-6",
  formBody: "grid gap-4 px-5 pb-5 pt-3",
  logo: "h-10 w-auto",
  title: "mt-3 text-3xl font-black tracking-[-0.05em] text-[#111816]",
  description: "mt-3 text-base leading-7 text-[#51645f]",
  location: "mt-4 text-sm font-black tracking-[-0.01em] text-[#111816]",
  locationMuted: "text-[#7b8c87]",
  section:
    "grid gap-4 rounded-2xl border border-[#dbe7e3] bg-[#fbfffd] p-4 shadow-[0_0_24px_rgba(17,24,22,0.10)]",
  sectionHeader: "grid gap-2",
  sectionTitle: "text-xs font-black uppercase tracking-[0.18em] text-[#147060]",
  sectionDivider: "h-px bg-[#dbe7e3]",
  field: "grid gap-2",
  fieldLabel: "text-sm font-black text-[#111816]",
  input:
    "min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white",
  inputOnWhite:
    "min-h-14 rounded-2xl border border-[#c7d8d4] bg-white px-4 text-lg font-bold text-[#111816] outline-none transition placeholder:text-sm focus:border-[#147060]",
  textareaOnWhite:
    "min-h-24 resize-none rounded-2xl border border-[#c7d8d4] bg-white px-4 py-3 text-base font-bold text-[#111816] outline-none transition placeholder:text-sm focus:border-[#147060]",
  select:
    "min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white",
  temperatureInput:
    "min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-2xl font-black text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white",
  yesNoGrid: "grid grid-cols-2 gap-3",
  radioLabel: "relative",
  radioInput: "peer sr-only",
  yesButton:
    "flex min-h-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-lg font-black text-emerald-800 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white",
  yesButtonLarge:
    "flex min-h-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-lg font-black text-emerald-800 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white",
  noButton:
    "flex min-h-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-lg font-black text-rose-800 transition peer-checked:border-rose-700 peer-checked:bg-rose-700 peer-checked:text-white",
  noButtonLarge:
    "flex min-h-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-lg font-black text-rose-800 transition peer-checked:border-rose-700 peer-checked:bg-rose-700 peer-checked:text-white",
  primaryButton:
    "mt-1 min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white shadow-[0_14px_32px_rgba(17,24,22,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6] disabled:shadow-none",
  statusWarning: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800",
  statusError: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-800",
  statusSuccess:
    "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-800",
  responsibleSummary: "grid gap-1 px-1 pt-1",
  responsibleLabel: "text-sm font-bold text-[#51645f]",
  responsibleValue: "text-xl font-black text-[#111816]",
  responsibleValueEmpty: "text-xl font-black text-[#7b8c87]",
} as const;

export function OperationalFormLayout({
  title,
  description,
  companyName,
  branchName,
  children,
}: {
  title: string;
  description?: string | null;
  companyName: string;
  branchName: string;
  children: ReactNode;
}) {
  return (
    <main className={operationalFormStyles.page}>
      <div className={operationalFormStyles.shell}>
        <section className={operationalFormStyles.panel}>
          <div className={operationalFormStyles.header}>
            <Image
              src="/logos/quimly_logoo.png"
              alt="Quimly"
              width={146}
              height={48}
              priority
              className={operationalFormStyles.logo}
            />
            <h1 className={operationalFormStyles.title}>{title}</h1>
            {description ? <p className={operationalFormStyles.description}>{description}</p> : null}
            <p className={operationalFormStyles.location}>
              {companyName}
              <span className={`px-2 ${operationalFormStyles.locationMuted}`}>|</span>
              <span className={operationalFormStyles.locationMuted}>{branchName}</span>
            </p>
          </div>

          {children}
        </section>
      </div>
    </main>
  );
}

export function OperationalFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={operationalFormStyles.section}>
      <div className={operationalFormStyles.sectionHeader}>
        <h2 className={operationalFormStyles.sectionTitle}>{title}</h2>
        <div className={operationalFormStyles.sectionDivider} />
      </div>
      {children}
    </section>
  );
}

export function OperationalFormResponsibleSummary({ responsibleName }: { responsibleName: string }) {
  const displayName = responsibleName.trim();

  return (
    <div className={operationalFormStyles.responsibleSummary} aria-live="polite">
      <p className={operationalFormStyles.responsibleLabel}>Responsable del registro</p>
      <p className={displayName ? operationalFormStyles.responsibleValue : operationalFormStyles.responsibleValueEmpty}>
        {displayName || "Sin definir"}
      </p>
    </div>
  );
}
