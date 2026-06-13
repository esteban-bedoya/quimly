"use client";

import { OperationalFormSubmitButton, operationalFormStyles } from "@/components/public-forms/operational-form-layout";

type FinalRegistrationConfirmationProps = {
  errorMessage?: string;
  executionResponsibleMarker?: "Admin" | "Operario";
  executionResponsibleName: string;
  isPending: boolean;
  registrationResponsibleName?: string;
  submitDisabled: boolean;
};

function ResponsibleDisplayValue({
  marker,
  value,
}: {
  marker?: "Admin" | "Operario";
  value: string;
}) {
  return (
    <>
      {value}
      {marker ? <span className="font-normal"> ({marker})</span> : null}
    </>
  );
}

function SummaryBlock({
  label,
  marker,
  value,
  valueTone = "default",
}: {
  label: string;
  marker?: "Admin" | "Operario";
  value: string;
  valueTone?: "default" | "empty" | "modified";
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-[#f4faf7] px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#51645f]">{label}</p>
        <p
          className={[
            "truncate text-xl font-black",
            valueTone === "empty" ? "text-[#7b8c87]" : valueTone === "modified" ? "text-[#48c7d2]" : "text-neutral-950",
          ].join(" ")}
        >
          <ResponsibleDisplayValue value={value} marker={marker} />
        </p>
      </div>
    </div>
  );
}

export function FinalRegistrationConfirmation({
  errorMessage,
  executionResponsibleMarker,
  executionResponsibleName,
  isPending,
  registrationResponsibleName,
  submitDisabled,
}: FinalRegistrationConfirmationProps) {
  const registrationName = registrationResponsibleName?.trim();
  const executionName = executionResponsibleName.trim();
  const executionResponsibleLabel = registrationName ? "Ejecutado por:" : "Ejecutado y registrado por:";

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h2 className="text-3xl font-black leading-tight text-neutral-950">Listo para registrar</h2>
      </div>

      <SummaryBlock
        label={executionResponsibleLabel}
        value={executionName || "Sin definir"}
        valueTone={executionName ? "default" : "empty"}
        marker={executionName ? executionResponsibleMarker : undefined}
      />

      {registrationName ? (
        <SummaryBlock label="Registrado por:" value={registrationName} marker="Admin" />
      ) : null}

      {errorMessage ? <p className={operationalFormStyles.statusError}>{errorMessage}</p> : null}

      <OperationalFormSubmitButton disabled={submitDisabled}>
        {isPending ? "Guardando..." : "Firmar y registrar"}
      </OperationalFormSubmitButton>
    </div>
  );
}
