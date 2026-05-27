"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCompany,
  createCompanyAdmin,
  createSuperAdmin,
  type AdminActionState,
} from "@/app/dashboard/actions";
import type { CompanySummary } from "@/types/auth";

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#12110f] px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:bg-[#1d1b18] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function ActionFeedback({ state }: { state: AdminActionState | undefined }) {
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

function Field({
  id,
  label,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: "text" | "email" | "password";
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
        required
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
      <Field id="slug" label="Slug" placeholder="restaurante-central" />
      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear empresa" pendingLabel="Creando empresa..." />
    </form>
  );
}

export function CreateSuperAdminForm() {
  const [state, formAction] = useActionState(createSuperAdmin, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="fullName" label="Nombre completo" placeholder="Laura Gómez" />
      <Field id="email" label="Correo electrónico" placeholder="laura@quimly.co" type="email" />
      <Field id="password" label="Contraseña temporal" placeholder="Mínimo 8 caracteres" type="password" />

      <label className="flex items-start gap-3 rounded-2xl border border-[#12110f]/10 bg-white px-4 py-3 text-sm text-[#3f3a33]">
        <input
          type="checkbox"
          name="canAccessAllCompanies"
          className="mt-1 h-4 w-4 rounded border-[#12110f]/20"
        />
        <span>Dar acceso a todas las empresas para soporte operativo.</span>
      </label>

      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear super admin" pendingLabel="Creando super admin..." />
    </form>
  );
}

export function CreateCompanyAdminForm({ companies }: { companies: CompanySummary[] }) {
  const [state, formAction] = useActionState(createCompanyAdmin, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="fullName" label="Nombre completo" placeholder="María Pérez" />
      <Field id="email" label="Correo electrónico" placeholder="admin@cliente.com" type="email" />
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

      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear company admin" pendingLabel="Creando company admin..." />
    </form>
  );
}
