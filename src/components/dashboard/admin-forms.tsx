"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  assignCompanyFounder,
  cancelScheduledPlanDowngrade,
  createCompany,
  createCompanyAdmin,
  createCompanyBranch,
  deleteCompanyBranch,
  createSuperAdmin,
  resolveCompanyCapacityExceeded,
  sendCompanyAdminRegistrationOTP,
  sendSuperAdminRegistrationOTP,
  updateCompany,
  updateCompanyBranch,
  toggleCompanyStatus,
  toggleCompanyBranchStatus,
  toggleUserStatus,
  updateScheduledDowngradeBranches,
  type AdminActionState,
} from "@/app/dashboard/actions";
import { InternationalPhoneField } from "@/components/phone/international-phone-field";
import { TransientFeedbackToast } from "@/components/ui/transient-feedback-toast";
import { BRANCH_NAME_MAX_LENGTH } from "@/lib/branch-name";
import type { CompanyBranchSummary, CompanySummary, AppRole } from "@/types/auth";

const activeLocationLimitReachedMessage =
  "Has alcanzado el límite de sedes activas de tu plan. Amplía tu plan para activar otra sede.";
const openPlanPaymentsEventName = "quimly:open-plan-payments";

type BranchCapacityModalControls = {
  close: () => void;
  showSuccessToast: (message: string) => void;
};

export function OpenPlanPaymentsButton({
  label,
  className,
  target = "overview",
}: {
  label: string;
  className: string;
  target?: "overview" | "payment_method";
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(openPlanPaymentsEventName, { detail: { target } }))}
      className={className}
    >
      {label}
    </button>
  );
}

export function BranchCapacityModal({
  title,
  triggerLabel = "Agregar sede",
  triggerClassName = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-4 py-2 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.02] hover:border-[#12110f]/32 hover:bg-[#e7e7e7]",
  children,
}: {
  title: string;
  triggerLabel?: string;
  triggerClassName?: string;
  children: (controls: BranchCapacityModalControls) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openTitle, setOpenTitle] = useState(title);
  const [openContent, setOpenContent] = useState<ReactNode>(null);
  const [successToastMessage, setSuccessToastMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        triggerRef.current?.focus();
        wasOpenRef.current = false;
      }

      return;
    }

    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstFocusableElement = focusableElements?.[0];
      const lastFocusableElement = focusableElements?.[focusableElements.length - 1];

      if (!firstFocusableElement || !lastFocusableElement) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };
    const closeForPlanPayments = () => setIsOpen(false);

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", keepFocusInDialog);
    window.addEventListener(openPlanPaymentsEventName, closeForPlanPayments);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", keepFocusInDialog);
      window.removeEventListener(openPlanPaymentsEventName, closeForPlanPayments);
    };
  }, [isOpen]);

  const closeModal = useCallback(() => setIsOpen(false), []);
  const dismissSuccessToast = useCallback(() => setSuccessToastMessage(null), []);
  const showSuccessToast = useCallback((message: string) => setSuccessToastMessage(message), []);

  const openModal = useCallback(() => {
    setOpenTitle(title);
    setOpenContent(children({ close: closeModal, showSuccessToast }));
    setIsOpen(true);
  }, [children, closeModal, showSuccessToast, title]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={openModal}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex min-h-dvh w-screen items-center justify-center px-4 py-4 sm:py-6">
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Cerrar ${openTitle}`}
                onClick={() => setIsOpen(false)}
                className="ui-focus-backdrop absolute inset-0"
              />
              <section
                ref={dialogRef}
                tabIndex={-1}
                aria-labelledby={titleId}
                aria-modal="true"
                role="dialog"
                className="relative grid max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-[35rem] gap-5 overflow-y-auto rounded-[1.7rem] bg-white p-5 text-[#12110f] shadow-[0_24px_80px_rgba(18,17,15,0.22)] outline-none sm:max-h-[calc(100dvh-3rem)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 id={titleId} className="text-xl font-semibold tracking-[-0.04em] text-[#12110f] sm:text-2xl">
                    {openTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5e6770] transition hover:bg-[#f1f1f1] hover:text-[#12110f]"
                    aria-label={`Cerrar ${openTitle}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div
                  onClick={(event) => {
                    if ((event.target as Element).closest('a[href^="#"]')) {
                      setIsOpen(false);
                    }
                  }}
                >
                  {openContent}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
      {successToastMessage ? (
        <TransientFeedbackToast
          title="Sede creada y activada"
          message={successToastMessage}
          tone="success"
          onDismiss={dismissSuccessToast}
        />
      ) : null}
    </>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  className = "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#12110f] px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:bg-[#1d1b18] disabled:cursor-not-allowed disabled:opacity-70",
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function InlineSubmitButton({
  children,
  className,
  disabled = false,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {children}
    </button>
  );
}

function ActionFeedback({ state }: { state: AdminActionState | undefined }) {
  if (!state?.error && !state?.success) {
    return null;
  }

  return (
    <p
      role={state.error ? "alert" : "status"}
      aria-live={state.error ? "assertive" : "polite"}
      className={`rounded-2xl px-4 py-3 text-sm ${
        state.error
          ? "border border-[#c66b5c]/22 bg-[#fff1ee] text-[#8a2d1f]"
          : "border border-[#5da87b]/24 bg-[#eefaf2] text-[#1d6e3f]"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

function AssignFounderSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#12110f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Asignando..." : "Asignar Founder"}
    </button>
  );
}

function Field({
  id,
  label,
  placeholder,
  type = "text",
  required = true,
  maxLength,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: "text" | "email" | "password" | "tel";
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[#12110f]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
      />
    </div>
  );
}

export function CreateCompanyForm() {
  const [state, formAction] = useActionState(createCompany, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="name" label="Nombre de la empresa" placeholder="Restaurante Central SAS" />
      <p className="text-xs leading-6 text-[#6a665f]">
        La URL interna se genera automáticamente a partir del nombre de la empresa.
      </p>
      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear empresa" pendingLabel="Creando empresa..." />
    </form>
  );
}

export function AssignFounderForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useActionState(assignCompanyFounder, undefined);

  return (
    <div className="grid gap-2">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <AssignFounderSubmitButton />
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}

export function CreateSuperAdminForm() {
  const [state, formAction] = useActionState(createSuperAdmin, undefined);
  const [otpState, otpAction] = useActionState(sendSuperAdminRegistrationOTP, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="fullName" label="Nombre completo" placeholder="Laura Gómez" />
      <InternationalPhoneField id="superAdminPhone" />
      <Field id="email" label="Correo opcional" placeholder="laura@quimly.co" type="email" required={false} />
      <button
        type="submit"
        formAction={otpAction}
        formNoValidate
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Enviar código
      </button>
      <Field id="phoneOtpCode" label="Código de verificación" placeholder="123456" />
      <Field id="password" label="Contraseña temporal" placeholder="Mínimo 8 caracteres" type="password" />

      <ActionFeedback state={otpState} />
      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear super admin" pendingLabel="Creando super admin..." />
    </form>
  );
}

export function CreateCompanyAdminForm({ companies }: { companies: CompanySummary[] }) {
  const [state, formAction] = useActionState(createCompanyAdmin, undefined);
  const [otpState, otpAction] = useActionState(sendCompanyAdminRegistrationOTP, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="fullName" label="Nombre completo" placeholder="María Pérez" />
      <InternationalPhoneField id="companyAdminPhone" />
      <Field id="email" label="Correo opcional" placeholder="admin@cliente.com" type="email" required={false} />
      <button
        type="submit"
        formAction={otpAction}
        formNoValidate
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Enviar código
      </button>
      <Field id="phoneOtpCode" label="Código de verificación" placeholder="123456" />
      <Field id="password" label="Contraseña temporal" placeholder="Mínimo 8 caracteres" type="password" />

      <div className="space-y-2">
        <label htmlFor="companyId" className="block text-sm font-medium text-[#12110f]">
          Empresa asignada
        </label>
        <select
          id="companyId"
          name="companyId"
          required
          defaultValue=""
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
        >
          <option value="" disabled>
            Selecciona una empresa
          </option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      <ActionFeedback state={otpState} />
      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear company admin" pendingLabel="Creando company admin..." />
    </form>
  );
}

export function CreateCompanyBranchForm({
  companies,
  lockedCompanyId,
  idleLabel = "Crear sede pendiente",
  pendingLabel = "Creando sede...",
  submitClassName,
  onSuccess,
}: {
  companies: CompanySummary[];
  lockedCompanyId?: string;
  idleLabel?: string;
  pendingLabel?: string;
  submitClassName?: string;
  onSuccess?: (message: string) => void;
}) {
  const [state, formAction] = useActionState(createCompanyBranch, undefined);

  useEffect(() => {
    if (state?.success) {
      onSuccess?.(state.success);
    }
  }, [onSuccess, state?.success]);

  return (
    <form action={formAction} className="space-y-4">
      {lockedCompanyId ? (
        <input type="hidden" name="companyId" value={lockedCompanyId} />
      ) : (
        <div className="space-y-2">
          <label htmlFor="companyId" className="block text-sm font-medium text-[#12110f]">
            Empresa
          </label>
          <select
            id="companyId"
            name="companyId"
            required
            defaultValue=""
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          >
            <option value="" disabled>
              Selecciona una empresa
            </option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Field
        id="name"
        label="Nombre de la sede"
        placeholder="Ej.: Café del Parque"
        maxLength={BRANCH_NAME_MAX_LENGTH}
      />

      <ActionFeedback state={state} />
      <SubmitButton idleLabel={idleLabel} pendingLabel={pendingLabel} className={submitClassName} />
    </form>
  );
}

function CapacityResolutionSubmitButton({ disabled, requiredCount }: { disabled: boolean; requiredCount: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#21734f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(33,115,79,0.14)] transition hover:bg-[#1d6646] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
    >
      {pending ? "Resolviendo..." : `Confirmar sede${requiredCount === 1 ? " activa" : "s activas"}`}
    </button>
  );
}

export function CapacityResolutionForm({
  activeBranches,
  companyId,
  companySlug,
  maxBranches,
}: {
  activeBranches: CompanyBranchSummary[];
  companyId: string;
  companySlug?: string;
  maxBranches: number;
}) {
  const [state, formAction] = useActionState(resolveCompanyCapacityExceeded, undefined);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const selectedCount = selectedBranchIds.length;
  const requiredCount = Math.max(maxBranches, 0);
  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((currentBranchIds) => {
      if (currentBranchIds.includes(branchId)) {
        return currentBranchIds.filter((currentBranchId) => currentBranchId !== branchId);
      }

      if (currentBranchIds.length >= requiredCount) {
        return currentBranchIds;
      }

      return [...currentBranchIds, branchId];
    });
  };

  return (
    <form action={formAction} className="grid gap-5 rounded-[1.45rem] border border-[#e2b35d] bg-[#fff8e9] p-5 shadow-[0_20px_50px_rgba(143,91,21,0.12)]">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="companySlug" value={companySlug ?? ""} />
      <div className="grid gap-2">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#8f5b15]">Acción requerida</p>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f]">
          Tu plan permite administrar {requiredCount} sede{requiredCount === 1 ? "" : "s"} activa{requiredCount === 1 ? "" : "s"}, pero actualmente tienes {activeBranches.length} sede{activeBranches.length === 1 ? "" : "s"} activa{activeBranches.length === 1 ? "" : "s"}.
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-[#5f5750]">
          Selecciona qué sede{requiredCount === 1 ? "" : "s"} deseas mantener activa{requiredCount === 1 ? "" : "s"} para continuar operando. Las demás pasarán a inactivas y conservarán su historial, documentos y reportes.
        </p>
      </div>

      <div className="grid gap-2">
        {activeBranches.map((branch) => {
          const isSelected = selectedBranchIds.includes(branch.id);
          const isDisabled = !isSelected && selectedCount >= requiredCount;

          return (
            <label
              key={branch.id}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-[#12110f] transition ${
                isSelected ? "border-[#21734f] shadow-[0_10px_28px_rgba(33,115,79,0.12)]" : "border-[#ead8b6]"
              } ${isDisabled ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                name="activeBranchId"
                value={branch.id}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => toggleBranch(branch.id)}
                className="h-4 w-4 accent-[#21734f]"
              />
              <span>{branch.name}</span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-[#6f5a2f]">
          Seleccionadas: {selectedCount} / {requiredCount}
        </p>
        <CapacityResolutionSubmitButton disabled={selectedCount !== requiredCount} requiredCount={requiredCount} />
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}

function formatScheduledDowngradeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "la fecha programada";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

export function ScheduledDowngradeSelectionForm({
  activeBranches,
  companySlug,
  effectiveAt,
  maxBranches,
  selectedBranchIds,
}: {
  activeBranches: CompanyBranchSummary[];
  companySlug: string;
  effectiveAt: string;
  maxBranches: number;
  selectedBranchIds: string[];
}) {
  const router = useRouter();
  const activeBranchIdSet = new Set(activeBranches.map((branch) => branch.id));
  const [selectedIds, setSelectedIds] = useState(() => selectedBranchIds.filter((branchId) => activeBranchIdSet.has(branchId)));
  const [state, setState] = useState<AdminActionState | undefined>(undefined);
  const [cancellationState, setCancellationState] = useState<AdminActionState | undefined>(undefined);
  const [isCancellationConfirmationOpen, setIsCancellationConfirmationOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isCancellationPending, startCancellationTransition] = useTransition();
  const targetCount = Math.max(maxBranches, 0);
  const requiredCount = Math.min(activeBranches.length, targetCount);
  const selectedCount = selectedIds.length;
  const hasActiveBranches = activeBranches.length > 0;

  const toggleBranch = (branchId: string) => {
    setSelectedIds((currentBranchIds) => {
      if (currentBranchIds.includes(branchId)) {
        return currentBranchIds.filter((currentBranchId) => currentBranchId !== branchId);
      }

      if (currentBranchIds.length >= targetCount) {
        return currentBranchIds;
      }

      return [...currentBranchIds, branchId];
    });
  };
  const saveSelection = () => {
    startTransition(async () => {
      const result = await updateScheduledDowngradeBranches({
        companySlug,
        selectedBranchIds: selectedIds,
      });
      setState(result);
    });
  };
  const cancelDowngrade = () => {
    startCancellationTransition(async () => {
      const result = await cancelScheduledPlanDowngrade({ companySlug });
      setCancellationState(result);

      if (result.success) {
        router.refresh();
      }
    });
  };

  return (
    <section className="grid gap-5 rounded-[1.45rem] border border-[#e2b35d] bg-[#fff8e9] p-5 shadow-[0_20px_50px_rgba(143,91,21,0.12)]">
      <div className="grid gap-2">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#8f5b15]">Reducción programada</p>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f]">
          Programaste una reducción de capacidad.
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-[#5f5750]">
          Se hará efectivo el día <strong>{formatScheduledDowngradeDate(effectiveAt)}</strong>, cuando Mercado Pago confirme el pago de la próxima renovación.
        </p>
        <p className="max-w-3xl text-sm leading-6 text-[#5f5750]">
          Elige qué sedes mantener activas. Puedes seleccionar hasta {targetCount} sede{targetCount === 1 ? "" : "s"}; las demás se inactivarán al hacerse efectiva la reducción y conservarán toda su información.
        </p>
      </div>

      {isCancellationConfirmationOpen ? (
        <div className="grid gap-3 rounded-2xl border border-[#d7a39a] bg-white px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#6e261b]">¿Cancelar la reducción programada?</p>
            <p className="mt-1 text-sm leading-6 text-[#5f5750]">
              Conservarás la capacidad actual y Mercado Pago volverá a cobrar el valor mensual anterior en la próxima renovación.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsCancellationConfirmationOpen(false)}
              disabled={isCancellationPending}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#d9dfe0] bg-white px-4 py-2 text-sm font-semibold text-[#12110f] transition hover:bg-[#f6f8f9] disabled:cursor-not-allowed disabled:opacity-55"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={cancelDowngrade}
              disabled={isCancellationPending}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#8a2d1f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6e261b] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isCancellationPending
                ? "Verificando..."
                : cancellationState?.retryable
                  ? "Reintentar cancelación"
                  : "Conservar capacidad actual"}
            </button>
          </div>
          <ActionFeedback state={cancellationState} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCancellationState(undefined);
            setIsCancellationConfirmationOpen(true);
          }}
          className="w-fit text-sm font-semibold text-[#8a2d1f] underline underline-offset-4 transition hover:text-[#6e261b]"
        >
          Cancelar reducción programada
        </button>
      )}

      {hasActiveBranches ? (
        <div className="grid gap-2">
          {activeBranches.map((branch) => {
            const isSelected = selectedIds.includes(branch.id);
            const isDisabled = !isSelected && selectedCount >= targetCount;

            return (
              <label
                key={branch.id}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-[#12110f] transition ${
                  isSelected ? "border-[#21734f] shadow-[0_10px_28px_rgba(33,115,79,0.12)]" : "border-[#ead8b6]"
                } ${isDisabled ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled || isPending || isCancellationPending}
                  onChange={() => toggleBranch(branch.id)}
                  className="h-4 w-4 accent-[#21734f]"
                />
                <span>{branch.name}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[#d9dfe0] bg-white px-4 py-3 text-sm leading-6 text-[#5f5750]">
          No tienes sedes activas en este momento. Cuando actives alguna antes de la fecha efectiva, podrás seleccionarla aquí.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-[#6f5a2f]">
          Seleccionadas: {selectedCount} de {targetCount} máximo
        </p>
        {hasActiveBranches ? (
          <button
            type="button"
            onClick={saveSelection}
            disabled={isPending || isCancellationPending || selectedCount !== requiredCount}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#21734f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(33,115,79,0.14)] transition hover:bg-[#1d6646] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {isPending ? "Guardando..." : "Guardar sedes seleccionadas"}
          </button>
        ) : null}
      </div>
      <ActionFeedback state={state} />
    </section>
  );
}

export function CompanyStatusToggle({
  companyId,
  isActive,
}: {
  companyId: string;
  isActive: boolean;
}) {
  const label = isActive ? "Desactivar" : "Activar";

  return (
    <form action={toggleCompanyStatus}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      <button
        type="submit"
        className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
          isActive
            ? "bg-[#f7ded7] text-[#8a2d1f] hover:bg-[#f2d0c7]"
            : "bg-[#e8f5f5] text-[#1e6c72] hover:bg-[#d8efef]"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

export function EditCompanyForm({ company }: { company: CompanySummary }) {
  const [state, formAction] = useActionState(updateCompany, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="companyId" value={company.id} />
      <input type="hidden" name="currentSlug" value={company.slug} />
      <div className="space-y-2">
        <label htmlFor={`company-name-${company.id}`} className="block text-sm font-medium text-[#12110f]">
          Editar nombre
        </label>
        <input
          id={`company-name-${company.id}`}
          name="name"
          type="text"
          defaultValue={company.name}
          required
          className="min-h-11 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
        />
      </div>
      <ActionFeedback state={state} />
      <button
        type="submit"
        className="inline-flex rounded-full border border-[#12110f]/14 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Guardar nombre
      </button>
    </form>
  );
}

export function UserStatusToggle({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const label = isActive ? "Desactivar" : "Activar";

  return (
    <form action={toggleUserStatus}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      <button
        type="submit"
        className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
          isActive
            ? "bg-[#f7ded7] text-[#8a2d1f] hover:bg-[#f2d0c7]"
            : "bg-[#e8f5f5] text-[#1e6c72] hover:bg-[#d8efef]"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

export function CompanyBranchStatusToggle({
  branchId,
  companySlug,
  isActive,
  disabled,
}: {
  branchId: string;
  companySlug?: string;
  isActive: boolean;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(toggleCompanyBranchStatus, undefined);
  const label = isActive ? "Desactivar" : "Activar";
  const shouldShowPlanUpgradeAction = state?.error === activeLocationLimitReachedMessage;

  return (
    <div className="grid gap-2">
      <form action={formAction}>
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="companySlug" value={companySlug ?? ""} />
        <input type="hidden" name="nextIsActive" value={String(!isActive)} />
        <InlineSubmitButton
          disabled={disabled}
          className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
            isActive
              ? "bg-[#f7ded7] text-[#8a2d1f] hover:bg-[#f2d0c7]"
              : "bg-[#e8f5f5] text-[#1e6c72] hover:bg-[#d8efef]"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {label}
        </InlineSubmitButton>
      </form>
      <ActionFeedback state={state} />
      {shouldShowPlanUpgradeAction ? (
        <OpenPlanPaymentsButton
          label="Ampliar plan"
          className="inline-flex w-fit rounded-full bg-[#dff3e6] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#265b38] transition hover:bg-[#d2ecd9]"
        />
      ) : null}
    </div>
  );
}

function EllipsisIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-6 w-6 shrink-0">
      <path
        d="M5 10h.01M10 10h.01M15 10h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

export function CompanyBranchActionsMenu({
  branch,
  companySlug,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeMenu = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {isOpen ? (
        <div className="absolute right-0 top-full z-20 mt-2 grid w-max max-w-[min(20rem,calc(100vw-2rem))] gap-1 rounded-[1.1rem] border border-[#d9dfe0] bg-white p-1.5 shadow-[0_10px_24px_rgba(18,17,15,0.12)]">
          {branch.status === "active" ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsEditing(true);
              }}
              className="inline-flex w-full items-center rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-semibold text-[#12110f] transition hover:bg-[#f1f1f1]"
            >
              Editar
            </button>
          ) : null}
          {branch.status === "active" ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsDeactivating(true);
              }}
              className="inline-flex w-full items-center rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-semibold text-[#8a2d1f] transition hover:bg-[#fff1ee]"
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsActivating(true);
              }}
              className="inline-flex w-full items-center rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-semibold text-[#12110f] transition hover:bg-[#e8f5f5]"
            >
              Activar
            </button>
          )}
          {branch.status !== "active" ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsDeleteConfirming(true);
              }}
              className="inline-flex w-full items-center rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-semibold text-[#8a2d1f] transition hover:bg-[#fff1ee]"
            >
              Eliminar
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={isOpen ? "Cerrar acciones de sede" : "Abrir acciones de sede"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition duration-200 ease-out hover:scale-110 hover:bg-gray-100 hover:text-gray-700"
      >
        <EllipsisIcon />
      </button>
      {isEditing ? (
        <CompanyBranchEditDialog
          branch={branch}
          companySlug={companySlug}
          onClose={() => setIsEditing(false)}
        />
      ) : null}
      {isActivating ? (
        <BranchStatusChangeDialog
          branch={branch}
          companySlug={companySlug}
          nextIsActive
          onClose={() => setIsActivating(false)}
        />
      ) : null}
      {isDeactivating ? (
        <BranchStatusChangeDialog
          branch={branch}
          companySlug={companySlug}
          nextIsActive={false}
          onClose={() => setIsDeactivating(false)}
        />
      ) : null}
      {branch.status !== "active" && isDeleteConfirming ? (
        <CompanyBranchDeleteDialog
          branch={branch}
          companySlug={companySlug}
          onClose={() => setIsDeleteConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function BranchStatusChangeDialog({
  branch,
  companySlug,
  nextIsActive,
  onClose,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
  nextIsActive: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(toggleCompanyBranchStatus, undefined);
  const formRef = useRef<HTMLFormElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const hasSubmittedRef = useRef(false);
  const isProcessing = !state;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    if (!hasSubmittedRef.current) {
      hasSubmittedRef.current = true;
      formRef.current?.requestSubmit();
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProcessing) {
        onClose();
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProcessing, onClose]);

  const title = isProcessing
    ? nextIsActive
      ? "Activando sede"
      : "Desactivando sede"
    : state.error
      ? nextIsActive
        ? "No fue posible activar la sede"
        : "No fue posible desactivar la sede"
      : nextIsActive
        ? "Sede activada correctamente"
        : "Sede desactivada correctamente";
  const description = isProcessing
    ? nextIsActive
      ? "Estamos verificando la capacidad disponible y el estado de tu plan."
      : "Estamos actualizando el estado de la sede."
    : state.error ?? state.success;

  return typeof document !== "undefined"
    ? createPortal(
        <div className="ui-focus-backdrop fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center px-4">
          {!isProcessing ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Cerrar estado de la sede"
              onClick={onClose}
              className="absolute inset-0"
            />
          ) : null}
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`branch-status-change-title-${branch.id}`}
            aria-describedby={`branch-status-change-description-${branch.id}`}
            aria-busy={isProcessing}
            className="relative w-full max-w-md rounded-[1.7rem] bg-white p-6 text-[#12110f] shadow-[0_24px_80px_rgba(18,17,15,0.22)] outline-none"
          >
            <form ref={formRef} action={formAction} className="hidden">
              <input type="hidden" name="branchId" value={branch.id} />
              <input type="hidden" name="companySlug" value={companySlug ?? ""} />
              <input type="hidden" name="nextIsActive" value={String(nextIsActive)} />
            </form>
            <div className="flex items-start gap-4">
              <div
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  isProcessing
                    ? nextIsActive
                      ? "bg-[#e8f5f5] text-[#1e6c72]"
                      : "bg-[#fff1ee] text-[#8a2d1f]"
                    : state.error
                      ? "bg-[#fff1ee] text-[#8a2d1f]"
                      : "bg-[#e8f5f5] text-[#1e6c72]"
                }`}
              >
                {isProcessing ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
                    <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
                  </svg>
                ) : state.error ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m8 8 8 8m0-8-8 8" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="8.5" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m7.5 12.25 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="8.5" />
                  </svg>
                )}
              </div>
              <div className="space-y-2 pt-0.5">
                <h3 id={`branch-status-change-title-${branch.id}`} className="ui-modal-title">
                  {title}
                </h3>
                <p id={`branch-status-change-description-${branch.id}`} className="ui-modal-copy" aria-live="polite">
                  {description}
                </p>
              </div>
            </div>
            {!isProcessing ? (
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={onClose} className="ui-pill-button-secondary ui-modal-action-secondary">
                  Cerrar
                </button>
              </div>
            ) : null}
          </section>
        </div>,
        document.body,
      )
    : null;
}

function CompanyBranchEditDialog({
  branch,
  companySlug,
  onClose,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
  onClose: () => void;
}) {
  const [state, formAction, isSubmitting] = useActionState(updateCompanyBranch, undefined);
  const [name, setName] = useState(branch.name);
  const dialogRef = useRef<HTMLElement | null>(null);
  const hasChanges = name.trim() !== branch.name;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSubmitting, onClose]);

  const isSuccess = Boolean(state?.success);

  return typeof document !== "undefined"
    ? createPortal(
        <div className="ui-focus-backdrop fixed inset-0 z-[100] flex min-h-screen w-screen items-end justify-center p-0 sm:items-center sm:px-4 sm:py-6">
          {!isSubmitting ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Cerrar edición de sede"
              onClick={onClose}
              className="absolute inset-0"
            />
          ) : null}
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={isSuccess ? "Sede actualizada" : "Editar sede"}
            aria-busy={isSubmitting}
            className="relative w-full max-w-md rounded-t-[1.7rem] bg-white p-5 text-[#12110f] shadow-[0_24px_80px_rgba(18,17,15,0.22)] outline-none sm:rounded-[1.7rem] sm:p-6"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-4 py-3" role="status" aria-live="polite">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1f1f1] text-[#12110f]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
                    <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
                  </svg>
                </span>
                <p className="ui-modal-copy">Guardando cambios...</p>
              </div>
            ) : isSuccess ? (
              <div className="grid gap-6 py-2">
                <p className="ui-modal-copy" role="status" aria-live="polite">
                  {state?.success}
                </p>
                <div className="flex justify-end">
                  <button type="button" onClick={onClose} className="ui-pill-button-secondary ui-modal-action-secondary">
                    Aceptar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="ui-modal-title">Editar sede</h3>
                    <p className="ui-modal-copy">
                      Este cambio se reflejará en todos los registros realizados para esta sede.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar edición de sede"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5e6770] transition hover:bg-[#f1f1f1] hover:text-[#12110f]"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <form action={formAction} className="mt-5 grid gap-4">
                  <input type="hidden" name="branchId" value={branch.id} />
                  <input type="hidden" name="companySlug" value={companySlug ?? ""} />
                  <div className="space-y-2">
                    <label htmlFor={`edit-branch-name-${branch.id}`} className="block text-sm font-semibold text-[#12110f]">
                      Nombre de la sede
                    </label>
                    <input
                      id={`edit-branch-name-${branch.id}`}
                      name="name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={BRANCH_NAME_MAX_LENGTH}
                      className="min-h-11 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
                    />
                  </div>
                  <ActionFeedback state={state?.error ? state : undefined} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="ui-pill-button-secondary ui-modal-action-secondary">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!hasChanges || !name.trim()}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-4 py-2 text-sm font-semibold text-[#12110f] transition hover:border-[#12110f]/32 hover:bg-[#e7e7e7] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>,
        document.body,
      )
    : null;
}

function BranchDeleteConfirmButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="ui-pill-button-danger w-full sm:w-auto"
    >
      {pending ? "Eliminando..." : "Eliminar sede definitivamente"}
    </button>
  );
}

export function CompanyBranchDeleteButton({
  branch,
  companySlug,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        disabled={branch.status === "active"}
        className="inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a2d1f] transition hover:bg-[#fff1ee] disabled:cursor-not-allowed disabled:opacity-45"
      >
        Eliminar
      </button>
      {isConfirming ? (
        <CompanyBranchDeleteDialog branch={branch} companySlug={companySlug} onClose={() => setIsConfirming(false)} />
      ) : null}
    </>
  );
}

function CompanyBranchDeleteDialog({
  branch,
  companySlug,
  onClose,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
  onClose: () => void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [state, formAction] = useActionState(deleteCompanyBranch, undefined);
  const hasConfirmedBranchName = confirmationName.trim() === branch.name;

  return typeof document !== "undefined"
    ? createPortal(
            <div className="ui-focus-backdrop fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center px-4">
              <div className="ui-modal-surface w-full max-w-md rounded-[1.7rem] p-6">
                <div className="space-y-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f2e4e0] text-[#7b5750]">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path
                        d="M9 3.75h6m-8.25 3h10.5m-9.75 0 .75 11.25a1.5 1.5 0 0 0 1.5 1.4h4.5a1.5 1.5 0 0 0 1.5-1.4l.75-11.25m-6 2.25v6.75m3-6.75v6.75"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h3 className="ui-modal-title">¿Eliminar sede definitivamente?</h3>
                    <div className="ui-modal-copy space-y-3">
                      <p>
                        Esta acción eliminará permanentemente la sede, sus registros sanitarios, documentos,
                        formularios, configuraciones y archivos asociados.
                      </p>
                      <p>
                        No se eliminará información compartida de la empresa, pero el historial de esta sede no se podrá
                        recuperar. Esta acción no podrá deshacerse.
                      </p>
                      <p className="font-semibold text-[#12110f]">{branch.name}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <label
                    htmlFor={`delete-branch-confirmation-${branch.id}`}
                    className="block text-sm font-semibold text-[#12110f]"
                  >
                    Escribe el nombre de la sede para confirmar
                  </label>
                  <input
                    id={`delete-branch-confirmation-${branch.id}`}
                    type="text"
                    value={confirmationName}
                    onChange={(event) => setConfirmationName(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-[#8a2d1f]/20 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#8a2d1f]/45"
                    autoComplete="off"
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationName("");
                      onClose();
                    }}
                    className="ui-pill-button-secondary ui-modal-action-secondary"
                  >
                    Cancelar
                  </button>
                  <form action={formAction}>
                    <input type="hidden" name="branchId" value={branch.id} />
                    <input type="hidden" name="companySlug" value={companySlug ?? ""} />
                    <input type="hidden" name="confirmationName" value={confirmationName} />
                    <BranchDeleteConfirmButton disabled={!hasConfirmedBranchName} />
                  </form>
                </div>
                <ActionFeedback state={state} />
              </div>
            </div>,
            document.body,
          )
    : null;
}

export function EditCompanyBranchForm({
  branch,
  companySlug,
}: {
  branch: CompanyBranchSummary;
  companySlug?: string;
}) {
  const [state, formAction] = useActionState(updateCompanyBranch, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="branchId" value={branch.id} />
      <input type="hidden" name="companySlug" value={companySlug ?? ""} />
      <div className="space-y-2">
        <label htmlFor={`branch-name-${branch.id}`} className="block text-sm font-medium text-[#12110f]">
          Editar nombre
        </label>
        <input
          id={`branch-name-${branch.id}`}
          name="name"
          type="text"
          defaultValue={branch.name}
          required
          maxLength={BRANCH_NAME_MAX_LENGTH}
          className="min-h-11 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
        />
      </div>
      <ActionFeedback state={state} />
      <button
        type="submit"
        className="inline-flex rounded-full border border-[#12110f]/14 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Guardar nombre
      </button>
    </form>
  );
}

export function CompanyBranchStatusBadge({ branch }: { branch: CompanyBranchSummary }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
        branch.status === "active"
          ? "bg-[#e8f5f5] text-[#1e6c72]"
          : branch.status === "deleted"
            ? "bg-[#f2e4e0] text-[#7b5750]"
            : "bg-[#f7ded7] text-[#8a2d1f]"
      }`}
    >
      {branch.status === "active" ? "Activa" : branch.status === "deleted" ? "Eliminada" : "Inactiva"}
    </span>
  );
}

export function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span className="rounded-full bg-[#e8f5f5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1e6c72]">
      {role === "super_admin" ? "Super admin" : role === "company_admin" ? "Company admin" : "Owner"}
    </span>
  );
}
