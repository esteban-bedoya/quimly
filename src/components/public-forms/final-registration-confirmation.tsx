"use client";

import { type ReactNode, useRef, useState } from "react";

import { OperationalFormSubmitButton, operationalFormStyles } from "@/components/public-forms/operational-form-layout";

type FinalRegistrationConfirmationProps = {
  dateLabel: string;
  errorMessage?: string;
  executionResponsibleEditable: boolean;
  executionResponsibleName: string;
  isDateModified: boolean;
  isExecutionResponsibleEditing: boolean;
  isPending: boolean;
  onDateEdit: () => void;
  onExecutionResponsibleEditingChange: (isEditing: boolean) => void;
  onExecutionResponsibleNameChange: (responsibleName: string) => void;
  registrationResponsibleName?: string;
  submitDisabled: boolean;
};

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.6"
      viewBox="0 0 24 24"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

function SummaryBlock({
  action,
  label,
  value,
  valueTone = "default",
}: {
  action?: ReactNode;
  label: string;
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
          {value}
        </p>
      </div>
      {action}
    </div>
  );
}

function EditIconButton({
  ariaLabel,
  disabled,
  isSaving,
  onClick,
}: {
  ariaLabel: string;
  disabled?: boolean;
  isSaving?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-45",
        isSaving ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#d7e4e1] bg-white text-neutral-800",
      ].join(" ")}
      aria-label={ariaLabel}
    >
      {isSaving ? <CheckIcon /> : <PencilIcon />}
    </button>
  );
}

function EditableExecutionResponsibleSummary({
  isEditing,
  label,
  onEditingChange,
  onNameChange,
  responsibleName,
}: {
  isEditing: boolean;
  label: string;
  onEditingChange: (isEditing: boolean) => void;
  onNameChange: (responsibleName: string) => void;
  responsibleName: string;
}) {
  const [draftName, setDraftName] = useState(responsibleName);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSave = Boolean(draftName.trim());

  function startEditing() {
    setDraftName(responsibleName);
    onEditingChange(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function saveName() {
    const nextName = draftName.trim();

    if (!nextName) {
      return;
    }

    onNameChange(nextName);
    onEditingChange(false);
  }

  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-[#f4faf7] px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#51645f]">{label}</p>
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveName();
              }

              if (event.key === "Escape") {
                onEditingChange(false);
              }
            }}
            className="mt-1 min-h-10 w-full rounded-xl border border-[#147060]/30 bg-white px-3 text-xl font-black text-neutral-950 outline-none transition focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
          />
        ) : (
          <p className={responsibleName.trim() ? "truncate text-xl font-black text-neutral-950" : "text-xl font-black text-[#7b8c87]"}>
            {responsibleName.trim() || "Sin definir"}
          </p>
        )}
      </div>

      <EditIconButton
        ariaLabel={isEditing ? `Guardar ${label.toLocaleLowerCase("es-CO")}` : `Editar ${label.toLocaleLowerCase("es-CO")}`}
        disabled={isEditing && !canSave}
        isSaving={isEditing}
        onClick={isEditing ? saveName : startEditing}
      />
    </div>
  );
}

export function FinalRegistrationConfirmation({
  dateLabel,
  errorMessage,
  executionResponsibleEditable,
  executionResponsibleName,
  isDateModified,
  isExecutionResponsibleEditing,
  isPending,
  onDateEdit,
  onExecutionResponsibleEditingChange,
  onExecutionResponsibleNameChange,
  registrationResponsibleName,
  submitDisabled,
}: FinalRegistrationConfirmationProps) {
  const registrationName = registrationResponsibleName?.trim();
  const executionName = executionResponsibleName.trim();
  const executionResponsibleLabel = registrationName ? "Responsable de ejecución" : "Responsable del registro";

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h2 className="text-3xl font-black leading-tight text-neutral-950">Listo para registrar</h2>
      </div>

      {registrationName ? (
        <SummaryBlock label="Responsable del registro" value={registrationName} />
      ) : null}

      {executionResponsibleEditable ? (
        <EditableExecutionResponsibleSummary
          isEditing={isExecutionResponsibleEditing}
          label={executionResponsibleLabel}
          onEditingChange={onExecutionResponsibleEditingChange}
          responsibleName={executionResponsibleName}
          onNameChange={onExecutionResponsibleNameChange}
        />
      ) : (
        <SummaryBlock
          label={executionResponsibleLabel}
          value={executionName || "Sin definir"}
          valueTone={executionName ? "default" : "empty"}
        />
      )}

      <SummaryBlock
        label="Fecha y hora de ejecución"
        value={dateLabel}
        valueTone={isDateModified ? "modified" : "default"}
        action={<EditIconButton ariaLabel="Cambiar fecha y hora de ejecución" onClick={onDateEdit} />}
      />

      {errorMessage ? <p className={operationalFormStyles.statusError}>{errorMessage}</p> : null}

      <OperationalFormSubmitButton disabled={submitDisabled}>
        {isPending ? "Guardando..." : "Firmar y registrar"}
      </OperationalFormSubmitButton>
    </div>
  );
}
