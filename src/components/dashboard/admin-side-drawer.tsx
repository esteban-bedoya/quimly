"use client";

import { useEffect, useId, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

import type { AdminActionState } from "@/app/dashboard/actions";

export const adminDrawerInputClassName = "ui-form-control";
const subscribeToHydration = () => () => {};

type AdminSideDrawerProps = {
  isOpen: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function AdminSideDrawer({
  isOpen,
  title,
  eyebrow,
  description,
  onClose,
  children,
}: AdminSideDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isHydrated) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar panel lateral"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#12110f]/35 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-[30rem] flex-col border-l border-white/75 bg-white shadow-[0_28px_90px_rgba(18,17,15,0.24)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#e6eaed] px-5 py-5 sm:px-6">
          <div className="min-w-0 space-y-2">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2a7f86]">{eyebrow}</p> : null}
            <div>
              <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#5e6770]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#12110f]/12 bg-white text-[#12110f] transition hover:scale-105 hover:bg-[#f3eee6]"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              x
            </span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5">{children}</div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function AdminDrawerSection({
  title,
  description,
  children,
}: {
  title?: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-[1.45rem] p-5 dashboard-card-surface dashboard-card-surface-operational">
      {title || description ? (
        <div className="space-y-2">
          {title ? <h3 className="text-base font-semibold tracking-[-0.02em] text-[#12110f]">{title}</h3> : null}
          {description ? <p className="text-sm leading-6 text-[#5e6770]">{description}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function AdminDrawerField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="ui-form-field">
      <span className="ui-form-label">{label}</span>
      {children}
    </label>
  );
}

export function AdminDrawerSummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#e6eaed] pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm leading-6 text-[#5e6770]">{label}</p>
      <div className="max-w-[12rem] text-right text-sm font-semibold leading-6 text-[#12110f]">{value}</div>
    </div>
  );
}

export function AdminDrawerFeedback({ state }: { state: AdminActionState | undefined }) {
  if (!state?.error && !state?.success) {
    return null;
  }

  return (
    <p
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

export function AdminDrawerSubmitButton({
  idleLabel,
  pendingLabel,
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="ui-pill-button-primary w-full disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function AdminDrawerButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const variantClassName = {
    primary: "ui-pill-button-primary",
    secondary: "ui-pill-button-secondary",
    danger: "ui-pill-button-danger",
  }[variant];

  return (
    <button
      type="button"
      {...props}
      className={`${variantClassName} w-full disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    />
  );
}
