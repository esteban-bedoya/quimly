"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  completeSignupWithOTP,
  identifyPhone,
  login,
  requestSignupOTP,
  requestPasswordReset,
  resetPasswordWithOTP,
  type IdentifyPhoneFormState,
  type LoginFormState,
  type PasswordResetFormState,
  type SignupFormState,
} from "@/app/login/actions";
import { InternationalPhoneField } from "@/components/phone/international-phone-field";
import { formatPhoneNumberForDisplay, type E164PhoneNumber } from "@/lib/phone";

type AuthPanel = "identify" | "password" | "signup" | "recovery";

type LoginFormProps = {
  activePanel: AuthPanel;
  identifiedPhone?: E164PhoneNumber;
  onIdentified: (status: "existing" | "new", phone: E164PhoneNumber) => void;
  onRecoverPassword: () => void;
};

function useIsTwoColumnLayout() {
  const [isTwoColumnLayout, setIsTwoColumnLayout] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncLayout = () => setIsTwoColumnLayout(mediaQuery.matches);

    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);

    return () => {
      mediaQuery.removeEventListener("change", syncLayout);
    };
  }, []);

  return isTwoColumnLayout;
}

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

function Feedback({
  state,
}: {
  state: IdentifyPhoneFormState | LoginFormState | PasswordResetFormState | SignupFormState | undefined;
}) {
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

function IdentifyContent({ state, action }: { state: IdentifyPhoneFormState | undefined; action: (formData: FormData) => void }) {
  return (
    <form action={action} className="space-y-5">
      <InternationalPhoneField id="identifyPhone" placeholder="Número" />
      <Feedback state={state} />
      <SubmitButton idleLabel="Continuar" pendingLabel="Verificando..." />
    </form>
  );
}

function PasswordLoginContent({
  phone,
  action,
  state,
  onRecoverPassword,
}: {
  phone: E164PhoneNumber;
  action: (formData: FormData) => void;
  state: LoginFormState | undefined;
  onRecoverPassword: () => void;
}) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="phone" value={phone} />

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[#12110f]">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
          placeholder="Tu contraseña"
          required
        />
      </div>

      <Feedback state={state} />
      <SubmitButton idleLabel="Ingresar" pendingLabel="Validando..." />

      <button
        type="button"
        onClick={onRecoverPassword}
        className="w-full text-center text-sm font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
      >
        Olvidé mi contraseña
      </button>
    </form>
  );
}

function SignupContent({
  phone,
  requestAction,
  requestState,
  verifyAction,
  verifyState,
}: {
  phone: E164PhoneNumber;
  requestAction: (formData: FormData) => void;
  requestState: SignupFormState | undefined;
  verifyAction: (formData: FormData) => void;
  verifyState: SignupFormState | undefined;
}) {
  const activeState = verifyState?.error || verifyState?.success ? verifyState : requestState;
  const isVerifyStep = activeState?.step === "verify";
  const [draft, setDraft] = useState({
    establishmentName: "",
    branchName: "",
    adminName: "",
    password: "",
  });

  if (isVerifyStep) {
    return (
      <form action={verifyAction} className="space-y-5">
        <input type="hidden" name="establishmentName" value={activeState?.establishmentName ?? draft.establishmentName} />
        <input type="hidden" name="branchName" value={activeState?.branchName ?? draft.branchName} />
        <input type="hidden" name="adminName" value={activeState?.adminName ?? draft.adminName} />
        <input type="hidden" name="phone" value={activeState?.phone ?? phone} />
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
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
            placeholder="123456"
            required
          />
          <p className="text-xs leading-5 text-[#6a665f]">
            Revisa los mensajes SMS. Enviado a{" "}
            {formatPhoneNumberForDisplay(activeState?.phone ?? phone)}.
          </p>
        </div>

        <Feedback state={activeState} />
        <SubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta..." />
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-5">
      <input type="hidden" name="phone" value={phone} />

      <div className="space-y-2">
        <label htmlFor="establishmentName" className="block text-sm font-medium text-[#12110f]">
          Nombre del establecimiento
        </label>
        <input
          id="establishmentName"
          name="establishmentName"
          type="text"
          autoComplete="organization"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
          placeholder="Restaurante"
          value={draft.establishmentName}
          onChange={(event) => setDraft((current) => ({ ...current, establishmentName: event.target.value }))}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="branchName" className="block text-sm font-medium text-[#12110f]">
          Nombre de la sede
        </label>
        <input
          id="branchName"
          name="branchName"
          type="text"
          autoComplete="organization"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
          placeholder="Sede principal"
          value={draft.branchName}
          onChange={(event) => setDraft((current) => ({ ...current, branchName: event.target.value }))}
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
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
          placeholder="Nombre completo"
          value={draft.adminName}
          onChange={(event) => setDraft((current) => ({ ...current, adminName: event.target.value }))}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signupPassword" className="block text-sm font-medium text-[#12110f]">
          Crea contraseña
        </label>
        <input
          id="signupPassword"
          name="password"
          type="password"
          autoComplete="new-password"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
          placeholder="Mínimo 8 caracteres"
          value={draft.password}
          onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
          required
        />
      </div>

      <Feedback state={activeState} />
      <SubmitButton idleLabel="Verificar número" pendingLabel="Enviando código..." />
    </form>
  );
}

function PasswordResetContent({
  phone,
  requestAction,
  requestState,
  verifyAction,
  verifyState,
}: {
  phone: E164PhoneNumber;
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
        <input type="hidden" name="phone" value={activeState?.phone ?? phone} />
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
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
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
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#12110f]/35 sm:text-sm"
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
      <input type="hidden" name="phone" value={phone} />
      <Feedback state={activeState} />
      <SubmitButton idleLabel="Enviar código" pendingLabel="Enviando código..." />
    </form>
  );
}

export function LoginPanel({ whatsappUrl }: { whatsappUrl: string }) {
  const [activePanel, setActivePanel] = useState<AuthPanel>("identify");
  const [identifiedPhone, setIdentifiedPhone] = useState<E164PhoneNumber | undefined>();

  const handleIdentified = useCallback((status: "existing" | "new", phone: E164PhoneNumber) => {
    setIdentifiedPhone(phone);
    setActivePanel(status === "existing" ? "password" : "signup");
  }, []);

  const resetIdentification = () => {
    setIdentifiedPhone(undefined);
    setActivePanel("identify");
  };

  const panelTitle =
    activePanel === "signup"
      ? "Comienza tus 14 días gratis en Quimly"
      : activePanel === "password"
        ? "Bienvenido de nuevo"
        : activePanel === "recovery"
          ? "Recupera tu acceso"
          : "Comencemos...";

  const panelDescription =
    activePanel === "identify"
      ? "Ingresa tu número para continuar"
      : activePanel === "signup"
        ? "Completa tus datos para continuar"
        : activePanel === "recovery"
          ? "Te enviaremos un código para crear una nueva contraseña"
          : "Ingresa tu contraseña para acceder";

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">{panelTitle}</h2>
        <p className="text-sm leading-7 text-[#4c4943]">{panelDescription}</p>
      </div>

      <div
        className={`mt-8 rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5 shadow-[0_18px_50px_rgba(18,17,15,0.06)] transition-[min-height] duration-500 ease-out sm:p-6 ${
          activePanel === "signup" ? "lg:min-h-[20rem]" : ""
        }`}
      >
        {activePanel !== "identify" && identifiedPhone ? (
          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#12110f]/8 pb-4 text-sm text-[#6a665f]">
            <span>
              {activePanel === "signup" ? "Creando con" : "Ingresando con"}{" "}
              <span className="font-semibold text-[#12110f]">{formatPhoneNumberForDisplay(identifiedPhone)}</span>
            </span>
            <span aria-hidden="true" className="text-[#c0b8aa]">
              ·
            </span>
            <button
              type="button"
              onClick={resetIdentification}
              className="font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
            >
              Usar otro número
            </button>
          </div>
        ) : null}

        <LoginForm
          key={identifiedPhone ?? "identify"}
          activePanel={activePanel}
          identifiedPhone={identifiedPhone}
          onIdentified={handleIdentified}
          onRecoverPassword={() => setActivePanel("recovery")}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs leading-6 text-[#6a665f]">
          ¿Necesitas ayuda para ingresar? Escríbenos por{" "}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
          >
            WhatsApp
          </a>
          .
        </p>
      </div>
    </>
  );
}

export function LoginForm({ activePanel, identifiedPhone, onIdentified, onRecoverPassword }: LoginFormProps) {
  const shouldAnimatePanel = useIsTwoColumnLayout();
  const [identifyState, identifyAction] = useActionState(identifyPhone, undefined);
  const [loginState, loginFormAction] = useActionState(login, undefined);
  const [requestSignupState, requestSignupAction] = useActionState(requestSignupOTP, undefined);
  const [verifySignupState, verifySignupAction] = useActionState(completeSignupWithOTP, undefined);
  const [requestResetState, requestResetAction] = useActionState(requestPasswordReset, undefined);
  const [verifyResetState, verifyResetAction] = useActionState(resetPasswordWithOTP, undefined);

  useEffect(() => {
    if (identifyState?.status && identifyState.phone) {
      onIdentified(identifyState.status, identifyState.phone);
    }
  }, [identifyState, onIdentified]);

  let panelContent: ReactNode;

  if (activePanel === "identify" || !identifiedPhone) {
    panelContent = <IdentifyContent state={identifyState} action={identifyAction} />;
  } else if (activePanel === "signup") {
    panelContent = (
      <SignupContent
        phone={identifiedPhone}
        requestAction={requestSignupAction}
        requestState={requestSignupState}
        verifyAction={verifySignupAction}
        verifyState={verifySignupState}
      />
    );
  } else if (activePanel === "recovery") {
    panelContent = (
      <PasswordResetContent
        phone={identifiedPhone}
        requestAction={requestResetAction}
        requestState={requestResetState}
        verifyAction={verifyResetAction}
        verifyState={verifyResetState}
      />
    );
  } else {
    panelContent = (
      <PasswordLoginContent
        phone={identifiedPhone}
        action={loginFormAction}
        state={loginState}
        onRecoverPassword={onRecoverPassword}
      />
    );
  }

  return (
    <motion.div
      data-auth-panel={activePanel}
      layout={shouldAnimatePanel}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className={`space-y-5 ${activePanel === "signup" ? "lg:min-h-[15rem]" : ""}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activePanel}
          layout={shouldAnimatePanel}
          initial={shouldAnimatePanel ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldAnimatePanel ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
          transition={shouldAnimatePanel ? { duration: 0.24, ease: "easeOut" } : { duration: 0 }}
          className="space-y-5"
        >
          {panelContent}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
