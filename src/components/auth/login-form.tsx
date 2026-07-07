"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  completeSignupWithOTP,
  login,
  requestSignupOTP,
  requestPasswordReset,
  resetPasswordWithOTP,
  type LoginFormState,
  type PasswordResetFormState,
  type SignupFormState,
} from "@/app/login/actions";
import { InternationalPhoneField } from "@/components/phone/international-phone-field";
import { formatPhoneNumberForDisplay } from "@/lib/phone";

type AuthPanel = "login" | "signup" | "recovery";

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

function Feedback({ state }: { state: LoginFormState | PasswordResetFormState | SignupFormState | undefined }) {
  if (!state?.error && !state?.success) {
    return null;
  }

  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm ${
        state.error
          ? "border-[#c66b5c]/22 bg-[#fff1ee] text-[#8a2d1f]"
          : "border-[#5da87b]/24 bg-[#eefaf2] text-[#1d6e3f]"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

function LoginContent({ state }: { state: LoginFormState | undefined }) {
  return (
    <>
      <InternationalPhoneField id="loginPhone" />

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[#12110f]">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="Tu contraseña"
          required
        />
      </div>

      <Feedback state={state} />
      <SubmitButton idleLabel="Ingresar" pendingLabel="Validando..." />
    </>
  );
}

function SignupContent({
  requestAction,
  requestState,
  verifyAction,
  verifyState,
}: {
  requestAction: (formData: FormData) => void;
  requestState: SignupFormState | undefined;
  verifyAction: (formData: FormData) => void;
  verifyState: SignupFormState | undefined;
}) {
  const activeState = verifyState?.error || verifyState?.success ? verifyState : requestState;
  const isVerifyStep = activeState?.step === "verify";
  const [draft, setDraft] = useState({
    establishmentName: "",
    adminName: "",
    password: "",
  });

  if (isVerifyStep) {
    return (
      <form action={verifyAction} className="space-y-5">
        <input type="hidden" name="establishmentName" value={activeState?.establishmentName ?? draft.establishmentName} />
        <input type="hidden" name="adminName" value={activeState?.adminName ?? draft.adminName} />
        <input type="hidden" name="phone" value={activeState?.phone ?? ""} />
        <input type="hidden" name="password" value={draft.password} />

        <div className="space-y-2">
          <label htmlFor="signupOtpCode" className="block text-sm font-medium text-[#12110f]">
            Código de verificación
          </label>
          <input
            id="signupOtpCode"
            name="otpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
            placeholder="123456"
            required
          />
          <p className="text-xs leading-5 text-[#6a665f]">
            Revisa WhatsApp. Si no lo ves, revisa tus SMS. Enviado a{" "}
            {activeState?.phone ? formatPhoneNumberForDisplay(activeState.phone) : ""}.
          </p>
        </div>

        <Feedback state={activeState} />
        <SubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta..." />
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="establishmentName" className="block text-sm font-medium text-[#12110f]">
          Nombre del establecimiento
        </label>
        <input
          id="establishmentName"
          name="establishmentName"
          type="text"
          autoComplete="organization"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="Restaurante Quimly"
          value={draft.establishmentName}
          onChange={(event) => setDraft((current) => ({ ...current, establishmentName: event.target.value }))}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="adminName" className="block text-sm font-medium text-[#12110f]">
          Nombre del administrador
        </label>
        <input
          id="adminName"
          name="adminName"
          type="text"
          autoComplete="name"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="Nombre completo"
          value={draft.adminName}
          onChange={(event) => setDraft((current) => ({ ...current, adminName: event.target.value }))}
          required
        />
      </div>

      <InternationalPhoneField id="signupPhone" defaultValue={activeState?.phone ?? ""} />

      <div className="space-y-2">
        <label htmlFor="signupPassword" className="block text-sm font-medium text-[#12110f]">
          Contraseña
        </label>
        <input
          id="signupPassword"
          name="password"
          type="password"
          autoComplete="new-password"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="Mínimo 8 caracteres"
          value={draft.password}
          onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
          required
        />
      </div>

      <Feedback state={activeState} />
      <SubmitButton idleLabel="Enviar código" pendingLabel="Enviando código..." />
    </form>
  );
}

function PasswordResetContent({
  requestAction,
  requestState,
  verifyAction,
  verifyState,
}: {
  requestAction: (formData: FormData) => void;
  requestState: PasswordResetFormState | undefined;
  verifyAction: (formData: FormData) => void;
  verifyState: PasswordResetFormState | undefined;
}) {
  const activeState = verifyState?.error || verifyState?.success ? verifyState : requestState;
  const isVerifyStep = activeState?.step === "verify";

  if (isVerifyStep) {
    return (
      <form action={verifyAction} className="space-y-5">
        <input type="hidden" name="phone" value={activeState?.phone ?? ""} />
        <div className="space-y-2">
          <label htmlFor="resetOtpCode" className="block text-sm font-medium text-[#12110f]">
            Código de verificación
          </label>
          <input
            id="resetOtpCode"
            name="otpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
            placeholder="123456"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="newPassword" className="block text-sm font-medium text-[#12110f]">
            Nueva contraseña
          </label>
          <input
            id="newPassword"
            name="password"
            type="password"
            autoComplete="new-password"
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
            placeholder="Mínimo 8 caracteres"
            required
          />
        </div>

        <Feedback state={activeState} />
        <SubmitButton idleLabel="Actualizar contraseña" pendingLabel="Actualizando..." />
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-5">
      <InternationalPhoneField id="resetPhone" defaultValue={activeState?.phone ?? ""} />
      <Feedback state={activeState} />
      <SubmitButton idleLabel="Enviar código" pendingLabel="Enviando código..." />
    </form>
  );
}

export function LoginForm() {
  const [activePanel, setActivePanel] = useState<AuthPanel>("login");
  const [loginState, loginFormAction] = useActionState(login, undefined);
  const [requestSignupState, requestSignupAction] = useActionState(requestSignupOTP, undefined);
  const [verifySignupState, verifySignupAction] = useActionState(completeSignupWithOTP, undefined);
  const [requestResetState, requestResetAction] = useActionState(requestPasswordReset, undefined);
  const [verifyResetState, verifyResetAction] = useActionState(resetPasswordWithOTP, undefined);

  if (activePanel === "signup") {
    return (
      <div className="space-y-5">
        <SignupContent
          requestAction={requestSignupAction}
          requestState={requestSignupState}
          verifyAction={verifySignupAction}
          verifyState={verifySignupState}
        />
        <button
          type="button"
          onClick={() => setActivePanel("login")}
          className="text-sm font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
        >
          Ya tengo cuenta
        </button>
      </div>
    );
  }

  if (activePanel === "recovery") {
    return (
      <div className="space-y-5">
        <PasswordResetContent
          requestAction={requestResetAction}
          requestState={requestResetState}
          verifyAction={verifyResetAction}
          verifyState={verifyResetState}
        />
        <button
          type="button"
          onClick={() => setActivePanel("login")}
          className="text-sm font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
        >
          Volver al ingreso
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form action={loginFormAction} className="space-y-5">
        <LoginContent state={loginState} />
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <SecondarySubmitButtonWrapper onClick={() => setActivePanel("signup")}>Crear cuenta</SecondarySubmitButtonWrapper>
        <button
          type="button"
          onClick={() => setActivePanel("recovery")}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-4 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
        >
          Recuperar contraseña
        </button>
      </div>
    </div>
  );
}

function SecondarySubmitButtonWrapper({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-4 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
    >
      {children}
    </button>
  );
}
