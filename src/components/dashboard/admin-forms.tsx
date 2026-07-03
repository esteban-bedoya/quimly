"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCompany,
  createCompanyAdmin,
  createCompanyBranch,
  createSuperAdmin,
  sendCompanyAdminRegistrationOTP,
  sendSuperAdminRegistrationOTP,
  setMainCompanyBranch,
  updateCompany,
  updateCompanyBranch,
  toggleCompanyStatus,
  toggleCompanyBranchStatus,
  toggleUserStatus,
  type AdminActionState,
} from "@/app/dashboard/actions";
import type { CompanyBranchSummary, CompanySummary, AppRole } from "@/types/auth";

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
  required = true,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: "text" | "email" | "password" | "tel";
  required?: boolean;
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

export function CreateSuperAdminForm() {
  const [state, formAction] = useActionState(createSuperAdmin, undefined);
  const [otpState, otpAction] = useActionState(sendSuperAdminRegistrationOTP, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <Field id="fullName" label="Nombre completo" placeholder="Laura Gómez" />
      <Field id="phone" label="Número de celular" placeholder="3001234567" type="tel" />
      <Field id="email" label="Correo opcional" placeholder="laura@quimly.co" type="email" required={false} />
      <button
        type="submit"
        formAction={otpAction}
        formNoValidate
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Enviar código WhatsApp
      </button>
      <Field id="phoneOtpCode" label="Código WhatsApp" placeholder="123456" />
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
      <Field id="phone" label="Número de celular" placeholder="3001234567" type="tel" />
      <Field id="email" label="Correo opcional" placeholder="admin@cliente.com" type="email" required={false} />
      <button
        type="submit"
        formAction={otpAction}
        formNoValidate
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
      >
        Enviar código WhatsApp
      </button>
      <Field id="phoneOtpCode" label="Código WhatsApp" placeholder="123456" />
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

export function CreateCompanyBranchForm({ companies }: { companies: CompanySummary[] }) {
  const [state, formAction] = useActionState(createCompanyBranch, undefined);

  return (
    <form action={formAction} className="space-y-4">
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

      <Field id="name" label="Nombre de la sede" placeholder="Sede Norte" />
      <p className="text-xs leading-6 text-[#6a665f]">
        El identificador interno de la sede se genera automáticamente a partir del nombre.
      </p>

      <ActionFeedback state={state} />
      <SubmitButton idleLabel="Crear sede" pendingLabel="Creando sede..." />
    </form>
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
  const label = isActive ? "Desactivar" : "Activar";

  return (
    <form action={toggleCompanyBranchStatus}>
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="companySlug" value={companySlug ?? ""} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      <button
        type="submit"
        disabled={disabled}
        className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
          isActive
            ? "bg-[#f7ded7] text-[#8a2d1f] hover:bg-[#f2d0c7]"
            : "bg-[#e8f5f5] text-[#1e6c72] hover:bg-[#d8efef]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {label}
      </button>
    </form>
  );
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

export function SetMainBranchButton({
  branchId,
  companySlug,
}: {
  branchId: string;
  companySlug?: string;
}) {
  return (
    <form action={setMainCompanyBranch}>
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="companySlug" value={companySlug ?? ""} />
      <button
        type="submit"
        className="inline-flex rounded-full bg-[#12110f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#1d1b18]"
      >
        Marcar principal
      </button>
    </form>
  );
}

export function CompanyBranchStatusBadge({ branch }: { branch: CompanyBranchSummary }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
        branch.isActive ? "bg-[#e8f5f5] text-[#1e6c72]" : "bg-[#f7ded7] text-[#8a2d1f]"
      }`}
    >
      {branch.isActive ? "Activa" : "Inactiva"}
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
