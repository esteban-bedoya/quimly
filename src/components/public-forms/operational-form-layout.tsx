"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export const operationalFormStyles = {
  page: "min-h-screen bg-[linear-gradient(180deg,#eafbf7_0%,#f2f7f5_300px,#f2f7f5_100%)] px-4 py-5 text-[#111816]",
  shell: "mx-auto flex w-full max-w-lg flex-col",
  layoutContent: "grid gap-0",
  header: "pb-5 pt-4",
  formBody: "grid gap-4 pb-5 pt-3",
  logo: "h-10 w-auto",
  title: "mt-3 text-3xl font-black tracking-[-0.05em] text-[#111816]",
  description: "mt-3 text-base leading-7 text-[#51645f]",
  location: "mt-4 text-sm font-black tracking-[-0.01em] text-[#111816]",
  locationMuted: "text-[#7b8c87]",
  sectionContainer:
    "grid gap-4 rounded-2xl border border-[#e1e8e5] bg-[#fbfffd] p-4 shadow-[0_12px_28px_rgba(17,24,22,0.08)]",
  sectionHeader: "grid gap-2",
  sectionTitle: "text-xs font-black uppercase tracking-[0.18em] text-[#2f3a37]",
  sectionDivider: "h-px bg-[#e5ece9]",
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
  successDialogBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center bg-[#111816]/35 px-5 backdrop-blur-md",
  successDialogCard: "w-full max-w-sm rounded-3xl bg-white p-6 text-[#111816] shadow-[0_24px_80px_rgba(17,24,22,0.22)]",
  successDialogMessage: "whitespace-pre-line text-xl font-black leading-8 text-[#111816]",
  successDialogButton:
    "mt-6 min-h-14 w-full rounded-2xl bg-[#111816] px-5 text-base font-black text-white transition active:scale-[0.98]",
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
        <div className={operationalFormStyles.layoutContent}>
          <OperationalFormHeader
            title={title}
            description={description}
            companyName={companyName}
            branchName={branchName}
          />
          {children}
        </div>
      </div>
    </main>
  );
}

export function OperationalFormHeader({
  title,
  description,
  companyName,
  branchName,
}: {
  title: string;
  description?: string | null;
  companyName: string;
  branchName: string;
}) {
  return (
    <header className={operationalFormStyles.header}>
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
    </header>
  );
}

export function OperationalFormSectionContainer({ children }: { children: ReactNode }) {
  return <section className={operationalFormStyles.sectionContainer}>{children}</section>;
}

export function OperationalFormSectionTitle({ title }: { title: string }) {
  return (
    <div className={operationalFormStyles.sectionHeader}>
      <h2 className={operationalFormStyles.sectionTitle}>{title}</h2>
      <div className={operationalFormStyles.sectionDivider} />
    </div>
  );
}

export function OperationalFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <OperationalFormSectionContainer>
      <OperationalFormSectionTitle title={title} />
      {children}
    </OperationalFormSectionContainer>
  );
}

export function OperationalFormSubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={disabled} className={operationalFormStyles.primaryButton}>
      {children}
    </button>
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

export function OperationalFormSuccessDialog({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  if (!open) {
    return null;
  }

  return (
    <div className={operationalFormStyles.successDialogBackdrop} role="presentation">
      <section
        aria-modal="true"
        className={operationalFormStyles.successDialogCard}
        role="dialog"
        aria-label="Registro guardado"
      >
        <p className={operationalFormStyles.successDialogMessage}>
          {"Firma registrada.\nPuedes cerrar esta pantalla o registrar otro control."}
        </p>
        <button type="button" className={operationalFormStyles.successDialogButton} onClick={onAccept}>
          Aceptar
        </button>
      </section>
    </div>
  );
}
