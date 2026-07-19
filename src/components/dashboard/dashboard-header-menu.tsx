"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  getCurrentUserProfileDetails,
  getPlanCapacityChangeQuote,
  cancelCompanyPlan,
  schedulePlanDowngrade,
  sendCurrentUserPhoneChangeOTP,
  startPlanActivation,
  startPlanUpgrade,
  updateCurrentUserPassword,
  updateCurrentUserProfile,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import {
  AdminDrawerButton,
  AdminDrawerFeedback,
  AdminDrawerSection,
  AdminDrawerSummaryRow,
  AdminSideDrawer,
  adminDrawerInputClassName,
} from "@/components/dashboard/admin-side-drawer";
import { InternationalPhoneField } from "@/components/phone/international-phone-field";
import { MercadoPagoPaymentMethodForm } from "@/components/billing/mercado-pago-payment-method-form";
import { MercadoPagoInfoCard } from "@/components/billing/mercado-pago-info-card";
import {
  calculatePlanMonthlyTotalCop,
  formatCopAmount,
  getPlanPaymentsVisualState,
  paymentProviderLabel,
  type PlanPaymentsData,
} from "@/lib/billing";
import type {
  AdminActionState,
  CurrentUserProfileDetailsState,
  PlanCapacityChangeQuoteResult,
} from "@/app/dashboard/actions";
import type { UserProfile } from "@/types/auth";

const menuItemClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16";
const logoutItemClass =
  "inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-white/5 hover:text-[0.95rem] hover:text-white";

type DashboardMenuPanel = "profile" | "planPayments";

const openPlanPaymentsEventName = "quimly:open-plan-payments";
const subscribeToHydration = () => () => {};

const panelLabels: Record<DashboardMenuPanel, string> = {
  profile: "Mi perfil",
  planPayments: "Plan y pagos",
};

const passwordMinLength = 8;
const passwordMaxLength = 72;

type ProfileFormData = {
  fullName: string;
  phone: string;
  email: string;
};

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type ProfileFieldKey = keyof ProfileFormData;
type ProfileEditableFieldKey = ProfileFieldKey | "password";
type PlanActivationStep = "sites" | "confirm" | "payment";
type PlanChangeMode = "activation" | "capacity";

const emptyPasswordFormData = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
} satisfies PasswordFormData;

function getProfileFormData(
  profileDetails: CurrentUserProfileDetailsState["profile"] | null,
  fallbackProfile: UserProfile,
) {
  return {
    fullName: profileDetails?.fullName ?? fallbackProfile.fullName ?? "",
    phone: profileDetails?.phone ?? fallbackProfile.phone,
    email: profileDetails?.email ?? "",
  } satisfies ProfileFormData;
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125 16.875 4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" d="M12 10.75v5" />
      <path strokeLinecap="round" d="M12 7.8h.01" />
    </svg>
  );
}

function PlanPaymentsWelcomeModal({ onClose }: { onClose: () => void }) {
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!isHydrated) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-[#12110f]/35 backdrop-blur-[2px]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Plan y pagos"
        className="relative z-10 w-full max-w-md"
      >
        <MercadoPagoInfoCard
          title="Plan y pagos"
          action={
            <button
              type="button"
              aria-label="Cerrar aviso de Plan y pagos"
              onClick={onClose}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#4f5a60] transition hover:scale-105 hover:text-[#12110f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/45"
            >
              <XIcon />
            </button>
          }
        />
      </section>
    </div>,
    document.body,
  );
}

function InfoTooltip({
  message,
  label,
  align = "right",
}: {
  message: string;
  label: string;
  align?: "left" | "right";
}) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isTooltipOpen) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !tooltipRef.current?.contains(event.target)) {
        setIsTooltipOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [isTooltipOpen]);

  return (
    <span ref={tooltipRef} className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={isTooltipOpen}
        onClick={() => setIsTooltipOpen((isOpen) => !isOpen)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#9ca3af] transition hover:text-[#6b7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/45"
      >
        <InfoIcon />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-2 w-64 rounded-xl border border-[#dce4e7] bg-white px-3 py-2.5 text-left text-xs font-normal leading-5 text-[#4e585e] shadow-[0_14px_32px_rgba(18,17,15,0.14)] transition-opacity ${align === "left" ? "left-0" : "right-0"} ${isTooltipOpen ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100"}`}
      >
        {message}
      </span>
    </span>
  );
}

function getMonthlyPriceTooltipMessage({
  planType,
  baseMonthlyPriceCop,
  additionalSiteMonthlyPriceCop,
}: Pick<
  PlanPaymentsData,
  "planType" | "baseMonthlyPriceCop" | "additionalSiteMonthlyPriceCop"
>) {
  return planType === "founder"
    ? `Tu sede inicial tiene un costo preferencial de ${formatCopAmount(baseMonthlyPriceCop)}/mes, y cada sede adicional se cobra a ${formatCopAmount(additionalSiteMonthlyPriceCop)}/mes.`
    : `Tu sede inicial tiene un costo de ${formatCopAmount(baseMonthlyPriceCop)}/mes, y cada sede adicional se cobra a ${formatCopAmount(additionalSiteMonthlyPriceCop)}/mes.`;
}

function MonthlyPriceValue({
  planType,
  baseMonthlyPriceCop,
  additionalSiteMonthlyPriceCop,
  monthlyTotalCop,
}: {
  planType: PlanPaymentsData["planType"];
  baseMonthlyPriceCop: number;
  additionalSiteMonthlyPriceCop: number;
  monthlyTotalCop: number;
}) {
  const message = getMonthlyPriceTooltipMessage({
    planType,
    baseMonthlyPriceCop,
    additionalSiteMonthlyPriceCop,
  });

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <InfoTooltip label={`Ver detalle del valor mensual. ${message}`} message={message} />
      <span>{formatCopAmount(monthlyTotalCop)}/mes</span>
    </span>
  );
}

function InlineActionButton({
  label,
  disabled = false,
  type = "button",
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || (type === "submit" && pending);
  const enabledSubmitClassName =
    type === "submit" && !isDisabled
      ? "border-[#9edfc1] bg-[#e8f7ef] text-[#21734f] hover:bg-[#d9f1e6]"
      : "border-[#12110f]/12 bg-white text-[#12110f] hover:bg-[#f7f8f9]";

  return (
    <button
      type={type}
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition hover:scale-105 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 ${enabledSubmitClassName}`}
    >
      {children}
    </button>
  );
}

function ProfileDrawerContent({ profile }: { profile: UserProfile }) {
  const [state, formAction] = useActionState<AdminActionState | undefined, FormData>(
    updateCurrentUserProfile,
    undefined,
  );
  const [phoneOtpState, phoneOtpAction] = useActionState<AdminActionState | undefined, FormData>(
    sendCurrentUserPhoneChangeOTP,
    undefined,
  );
  const [passwordState, passwordAction] = useActionState<AdminActionState | undefined, FormData>(
    updateCurrentUserPassword,
    undefined,
  );
  const [detailsState, setDetailsState] = useState<CurrentUserProfileDetailsState | null>(null);
  const [initialData, setInitialData] = useState<ProfileFormData | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(() => getProfileFormData(null, profile));
  const [passwordData, setPasswordData] = useState<PasswordFormData>(emptyPasswordFormData);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [activeProfileField, setActiveProfileField] = useState<ProfileEditableFieldKey | null>(null);
  const handledProfileSaveState = useRef<AdminActionState | undefined>(undefined);
  const handledPasswordSaveState = useRef<AdminActionState | undefined>(undefined);

  useEffect(() => {
    let isActive = true;

    getCurrentUserProfileDetails().then((nextState) => {
      if (isActive) {
        setDetailsState(nextState);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!detailsState?.profile) {
      return;
    }

    const nextData = getProfileFormData(detailsState.profile, profile);
    startTransition(() => {
      setInitialData(nextData);
      setFormData(nextData);
      setPasswordData(emptyPasswordFormData);
      setPhoneOtpCode("");
      setActiveProfileField(null);
    });
  }, [detailsState?.profile, profile]);

  useEffect(() => {
    if (!state?.success || handledProfileSaveState.current === state) {
      return;
    }

    handledProfileSaveState.current = state;
    startTransition(() => {
      setInitialData(formData);
      setPhoneOtpCode("");
      setActiveProfileField(null);
    });
  }, [formData, state]);

  useEffect(() => {
    if (!passwordState?.success || handledPasswordSaveState.current === passwordState) {
      return;
    }

    handledPasswordSaveState.current = passwordState;
    startTransition(() => {
      setPasswordData(emptyPasswordFormData);
      setActiveProfileField(null);
    });
  }, [passwordState]);

  const isFullNameDirty = Boolean(initialData && formData.fullName !== initialData.fullName);
  const isPhoneDirty = Boolean(initialData && formData.phone !== initialData.phone);
  const isEmailDirty = Boolean(initialData && formData.email !== initialData.email);
  const isPasswordConfirmationDifferent =
    Boolean(passwordData.confirmNewPassword) && passwordData.newPassword !== passwordData.confirmNewPassword;
  const isPasswordLengthInvalid =
    Boolean(passwordData.newPassword) &&
    (passwordData.newPassword.length < passwordMinLength || passwordData.newPassword.length > passwordMaxLength);
  const isPasswordPadded =
    Boolean(passwordData.newPassword) && passwordData.newPassword !== passwordData.newPassword.trim();
  const isNewPasswordSameAsCurrent =
    Boolean(passwordData.currentPassword && passwordData.newPassword) &&
    passwordData.currentPassword === passwordData.newPassword;
  const canSubmitPasswordChange =
    Boolean(passwordData.currentPassword && passwordData.newPassword && passwordData.confirmNewPassword) &&
    !isPasswordConfirmationDifferent &&
    !isPasswordLengthInvalid &&
    !isPasswordPadded &&
    !isNewPasswordSameAsCurrent;
  const dirtyInputClassName = "border-yellow-400 focus:border-yellow-400";
  const invalidInputClassName = "border-red-300 focus:border-red-400";
  const getInputClassName = (isFieldDirty: boolean) =>
    `${adminDrawerInputClassName} ${isFieldDirty ? dirtyInputClassName : ""}`;
  const getPasswordInputClassName = (value: string, isInvalid = false) =>
    `${adminDrawerInputClassName} ${isInvalid ? invalidInputClassName : value ? dirtyInputClassName : ""}`;

  const handlePhoneChange = useCallback((phone: string) => {
    setFormData((currentData) => (currentData.phone === phone ? currentData : { ...currentData, phone }));
  }, []);

  const startEditingField = useCallback(
    (field: ProfileEditableFieldKey) => {
      if (initialData) {
        setFormData(initialData);
      }

      setPasswordData(emptyPasswordFormData);
      setPhoneOtpCode("");
      setActiveProfileField(field);
    },
    [initialData],
  );

  const cancelEditingField = useCallback(
    (field: ProfileEditableFieldKey) => {
      if (field === "password") {
        setPasswordData(emptyPasswordFormData);
        setActiveProfileField(null);
        return;
      }

      if (initialData) {
        setFormData((currentData) => ({ ...currentData, [field]: initialData[field] }));
      }

      setPasswordData(emptyPasswordFormData);

      if (field === "phone") {
        setPhoneOtpCode("");
      }

      setActiveProfileField(null);
    },
    [initialData],
  );

  if (!detailsState) {
    return (
      <AdminDrawerSection>
        <p className="text-sm leading-6 text-[#5e6770]">Cargando perfil...</p>
      </AdminDrawerSection>
    );
  }

  if (detailsState.error || !detailsState.profile) {
    return <AdminDrawerFeedback state={{ error: detailsState.error ?? "No fue posible cargar tu perfil." }} />;
  }

  return (
    <>
      <AdminDrawerSection>
        <div className="grid gap-5">
          <form action={formAction} className="border-b border-[#e6eaed] pb-4">
            <input type="hidden" name="phone" value={formData.phone} />
            <input type="hidden" name="email" value={formData.email} />
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">
                    Nombre
                  </label>
                  {activeProfileField === "fullName" ? (
                    <label htmlFor="fullName" className="ui-form-field mt-2">
                      <span className="ui-form-label">Nuevo nombre</span>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        value={formData.fullName}
                        onChange={(event) => setFormData((currentData) => ({ ...currentData, fullName: event.target.value }))}
                        placeholder="Nombre completo"
                        required
                        className={getInputClassName(isFullNameDirty)}
                      />
                    </label>
                  ) : (
                    <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#12110f]">
                      {formData.fullName || "No registrado"}
                    </p>
                  )}
                </div>

                {activeProfileField === "fullName" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <InlineActionButton type="submit" label="Guardar nombre" disabled={!isFullNameDirty || !formData.fullName}>
                      <CheckIcon />
                    </InlineActionButton>
                    <InlineActionButton label="Cancelar edición de nombre" onClick={() => cancelEditingField("fullName")}>
                      <XIcon />
                    </InlineActionButton>
                  </div>
                ) : (
                  <InlineActionButton label="Editar nombre" onClick={() => startEditingField("fullName")}>
                    <EditIcon />
                  </InlineActionButton>
                )}
              </div>
            </div>
          </form>

          <form action={formAction} className="border-b border-[#e6eaed] pb-4">
            <input type="hidden" name="fullName" value={formData.fullName} />
            <input type="hidden" name="phone" value={formData.phone} />
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">
                    Correo
                  </label>
                  {activeProfileField === "email" ? (
                    <label htmlFor="email" className="ui-form-field mt-2">
                      <span className="ui-form-label">Nuevo correo</span>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={(event) => setFormData((currentData) => ({ ...currentData, email: event.target.value }))}
                        placeholder="nombre@empresa.com"
                        className={getInputClassName(isEmailDirty)}
                      />
                    </label>
                  ) : (
                    <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#12110f]">
                      {formData.email || "No registrado"}
                    </p>
                  )}
                </div>

                {activeProfileField === "email" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <InlineActionButton type="submit" label="Guardar correo" disabled={!isEmailDirty}>
                      <CheckIcon />
                    </InlineActionButton>
                    <InlineActionButton label="Cancelar edición de correo" onClick={() => cancelEditingField("email")}>
                      <XIcon />
                    </InlineActionButton>
                  </div>
                ) : (
                  <InlineActionButton label="Editar correo" onClick={() => startEditingField("email")}>
                    <EditIcon />
                  </InlineActionButton>
                )}
              </div>
            </div>
          </form>

          <form action={formAction} className="border-b border-[#e6eaed] pb-4">
            <input type="hidden" name="fullName" value={formData.fullName} />
            <input type="hidden" name="email" value={formData.email} />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">Celular</p>
                {activeProfileField === "phone" ? (
                  <div className="mt-2 grid gap-3">
                    <InternationalPhoneField
                      id="profilePhone"
                      label="Nuevo celular"
                      value={formData.phone}
                      onValueChange={handlePhoneChange}
                      labelClassName="ui-form-label"
                      controlClassName={getInputClassName(isPhoneDirty)}
                    />

                    <button
                      type="submit"
                      formAction={phoneOtpAction}
                      disabled={!isPhoneDirty || !formData.phone}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f7f8f9] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      Verificar número nuevo
                    </button>

                    <label htmlFor="phoneOtpCode" className="ui-form-field">
                      <span className="ui-form-label">Código de verificación</span>
                      <input
                        id="phoneOtpCode"
                        name="phoneOtpCode"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={phoneOtpCode}
                        onChange={(event) => setPhoneOtpCode(event.target.value)}
                        placeholder="Código recibido"
                        className={adminDrawerInputClassName}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#12110f]">
                    {formData.phone || "No registrado"}
                  </p>
                )}
              </div>

              {activeProfileField === "phone" ? (
                <div className="flex shrink-0 items-center gap-2">
                  <InlineActionButton
                    type="submit"
                    label="Verificar y guardar celular"
                    disabled={!isPhoneDirty || !phoneOtpCode}
                  >
                    <CheckIcon />
                  </InlineActionButton>
                  <InlineActionButton label="Cancelar edición de celular" onClick={() => cancelEditingField("phone")}>
                    <XIcon />
                  </InlineActionButton>
                </div>
              ) : (
                <InlineActionButton label="Editar celular" onClick={() => startEditingField("phone")}>
                  <EditIcon />
                </InlineActionButton>
              )}
            </div>
          </form>

          <form action={passwordAction}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">Contraseña</p>
                {activeProfileField === "password" ? (
                  <div className="mt-2 grid gap-3">
                    <label htmlFor="currentPassword" className="ui-form-field">
                      <span className="ui-form-label">Contraseña actual</span>
                      <input
                        id="currentPassword"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        value={passwordData.currentPassword}
                        onChange={(event) =>
                          setPasswordData((currentData) => ({
                            ...currentData,
                            currentPassword: event.target.value,
                          }))
                        }
                        required
                        className={getPasswordInputClassName(passwordData.currentPassword)}
                      />
                    </label>

                    <label htmlFor="newPassword" className="ui-form-field">
                      <span className="ui-form-label">Nueva contraseña</span>
                      <input
                        id="newPassword"
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        value={passwordData.newPassword}
                        onChange={(event) =>
                          setPasswordData((currentData) => ({
                            ...currentData,
                            newPassword: event.target.value,
                          }))
                        }
                        minLength={passwordMinLength}
                        maxLength={passwordMaxLength}
                        required
                        className={getPasswordInputClassName(
                          passwordData.newPassword,
                          isPasswordLengthInvalid || isPasswordPadded || isNewPasswordSameAsCurrent,
                        )}
                      />
                    </label>

                    <label htmlFor="confirmNewPassword" className="ui-form-field">
                      <span className="ui-form-label">Confirmar nueva contraseña</span>
                      <input
                        id="confirmNewPassword"
                        name="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        value={passwordData.confirmNewPassword}
                        onChange={(event) =>
                          setPasswordData((currentData) => ({
                            ...currentData,
                            confirmNewPassword: event.target.value,
                          }))
                        }
                        minLength={passwordMinLength}
                        maxLength={passwordMaxLength}
                        required
                        className={getPasswordInputClassName(
                          passwordData.confirmNewPassword,
                          isPasswordConfirmationDifferent,
                        )}
                      />
                    </label>

                    {isPasswordConfirmationDifferent ? (
                      <p className="text-xs font-medium text-red-500">La confirmación no coincide.</p>
                    ) : null}
                    {isPasswordLengthInvalid || isPasswordPadded ? (
                      <p className="text-xs font-medium text-[#8a6a00]">
                        Usa mínimo {passwordMinLength} caracteres y sin espacios al inicio o al final.
                      </p>
                    ) : null}
                    {isNewPasswordSameAsCurrent ? (
                      <p className="text-xs font-medium text-red-500">
                        La nueva contraseña debe ser diferente a la actual.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#12110f]">••••••••</p>
                )}
              </div>

              {activeProfileField === "password" ? (
                <div className="flex shrink-0 items-center gap-2">
                  <InlineActionButton
                    type="submit"
                    label="Guardar contraseña"
                    disabled={!canSubmitPasswordChange}
                  >
                    <CheckIcon />
                  </InlineActionButton>
                  <InlineActionButton label="Cancelar edición de contraseña" onClick={() => cancelEditingField("password")}>
                    <XIcon />
                  </InlineActionButton>
                </div>
              ) : (
                <InlineActionButton label="Editar contraseña" onClick={() => startEditingField("password")}>
                  <EditIcon />
                </InlineActionButton>
              )}
            </div>
          </form>
        </div>
      </AdminDrawerSection>

      <AdminDrawerFeedback state={phoneOtpState} />
      <AdminDrawerFeedback state={passwordState} />
      <AdminDrawerFeedback state={state} />
    </>
  );
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "No configurado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No configurado";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

type CapacityChangeQuote = NonNullable<PlanCapacityChangeQuoteResult["quote"]>;
type PendingPlanOperation = NonNullable<PlanCapacityChangeQuoteResult["pendingOperation"]>;

function formatRemainingTime(remainingSeconds: number | null) {
  if (remainingSeconds === null) {
    return "unos minutos";
  }

  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

function getPendingOperationMessage(operation: PendingPlanOperation) {
  const remainingTime = formatRemainingTime(operation.remainingSeconds);

  if (operation.status === "awaiting_payment") {
    return `Tu pago está pendiente de confirmación. Podrás iniciar un proceso nuevo en ${remainingTime}.`;
  }

  if (operation.status === "processing") {
    return `Estamos confirmando tu pago. Podrás iniciar un proceso nuevo en ${remainingTime}.`;
  }

  if (operation.status === "awaiting_customer") {
    return `Ya tienes un proceso de pago abierto. Podrás iniciar uno nuevo en ${remainingTime}.`;
  }

  return `Estamos preparando tu proceso de pago. Podrás iniciar uno nuevo en ${remainingTime}.`;
}

function PlanPaymentsDrawerContent({
  planPayments,
}: {
  planPayments: PlanPaymentsData;
}) {
  const router = useRouter();
  const visualState = getPlanPaymentsVisualState({
    subscriptionViewState: planPayments.subscriptionViewState,
    planType: planPayments.planType,
    baseMonthlyPriceCop: planPayments.baseMonthlyPriceCop,
  });
  const minimumActivationSiteCount = Math.max(planPayments.includedActiveSites, 1);
  const minimumRecoverySiteCount = Math.max(
    planPayments.activeSites,
    planPayments.includedActiveSites,
    planPayments.maxActiveLocations,
  );
  const minimumSiteCount = visualState.isTrial ? minimumActivationSiteCount : minimumRecoverySiteCount;
  const [activationStep, setActivationStep] = useState<PlanActivationStep | null>(null);
  const [planChangeMode, setPlanChangeMode] = useState<PlanChangeMode>("activation");
  const [selectedSiteCount, setSelectedSiteCount] = useState(minimumSiteCount);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [planChangeSuccess, setPlanChangeSuccess] = useState<string | null>(null);
  const [capacityQuote, setCapacityQuote] = useState<CapacityChangeQuote | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingPlanOperation | null>(null);
  const [isPaymentMethodFormOpen, setIsPaymentMethodFormOpen] = useState(false);
  const [isCancellationConfirmationOpen, setIsCancellationConfirmationOpen] = useState(false);
  const [billingLifecycleState, setBillingLifecycleState] = useState<AdminActionState | undefined>(undefined);
  const [cancellationEffectiveOverride, setCancellationEffectiveOverride] = useState<string | null>(null);
  const [isActivationPending, startActivationTransition] = useTransition();
  const [isQuotePending, startQuoteTransition] = useTransition();
  const [isLifecyclePending, startLifecycleTransition] = useTransition();
  const capacityQuoteRequestRef = useRef(0);
  const activationPlanName = planPayments.planType === "founder" ? "Plan fundador" : "Plan operativo";
  const selectedAdditionalSites = Math.max(selectedSiteCount - planPayments.includedActiveSites, 0);
  const scheduledCapacityChange = planPayments.scheduledCapacityChange;
  const activationMonthlyTotal = planChangeMode === "capacity"
    ? capacityQuote?.requestedMonthlyTotalCop ?? planPayments.monthlyTotalCop
    : calculatePlanMonthlyTotalCop({
        planType: planPayments.planType,
        siteCount: selectedSiteCount,
        baseMonthlyPriceCop: planPayments.baseMonthlyPriceCop,
        additionalSiteMonthlyPriceCop: planPayments.additionalSiteMonthlyPriceCop,
        includedActiveSites: planPayments.includedActiveSites,
      });
  const cancellationEffectiveAt = cancellationEffectiveOverride ?? planPayments.cancellationEffectiveAt;
  const isCancellationScheduled = Boolean(planPayments.cancellationRequestedAt || cancellationEffectiveAt);
  const isCancellationPending = isCancellationScheduled && visualState.statusLabel !== "Cancelado";
  const paymentStatusLabel = isCancellationPending ? "Cancelación programada" : visualState.statusLabel;
  const paymentStatusMessage = isCancellationPending
    ? `Tu plan conserva acceso hasta el ${formatDateLabel(cancellationEffectiveAt)}. No se realizarán nuevos cobros.`
    : visualState.message;
  const isActivationMode = activationStep !== null;
  const isReactivationFlow = isActivationMode && planPayments.subscriptionViewState === "cancelled";
  const isCapacityChangeMode = planChangeMode === "capacity";
  const paymentStatusClassName = paymentStatusLabel === "Cancelación programada" || paymentStatusLabel === "Cancelado"
    ? "border-[#ecd0c8] bg-[#fff6f3] text-[#8a2d1f]"
    : visualState.isActivePlan
    ? "border-[#9edfc1]/70 bg-[#e8f7ef] text-[#21734f]"
    : paymentStatusLabel === "Pago pendiente"
      ? "border-[#edcf92] bg-[#fff8e9] text-[#8f5b15]"
      : "border-[#c8e2e5] bg-[#effafb] text-[#277581]";
  const capacityChangeDirection =
    selectedSiteCount > planPayments.maxActiveLocations
      ? "upgrade"
      : selectedSiteCount < planPayments.maxActiveLocations
        ? "downgrade"
        : "unchanged";
  const hasCurrentCapacityQuote =
    capacityQuote?.requestedMaxActiveLocations === selectedSiteCount &&
    capacityQuote.changeType === capacityChangeDirection;
  const minimumSelectableSiteCount = isCapacityChangeMode
    ? Math.max(planPayments.includedActiveSites, 1)
    : minimumSiteCount;

  const handlePaymentMethodCompleted = useCallback((state: AdminActionState) => {
    setBillingLifecycleState(state);
    setIsPaymentMethodFormOpen(false);
    router.refresh();
  }, [router]);
  const requestCancellation = () => {
    const companySlug = planPayments.companySlug;

    if (!companySlug) {
      setBillingLifecycleState({ error: "No fue posible identificar la empresa." });
      return;
    }

    startLifecycleTransition(async () => {
      const result = await cancelCompanyPlan({ companySlug });
      setBillingLifecycleState(result);

      if (result.success) {
        setCancellationEffectiveOverride(result.effectiveAt ?? planPayments.cancellationEffectiveAt);
        setIsCancellationConfirmationOpen(false);
        router.refresh();
      }
    });
  };
  const requestCapacityQuote = (requestedMaxActiveLocations: number) => {
    const requestId = capacityQuoteRequestRef.current + 1;
    capacityQuoteRequestRef.current = requestId;
    setCapacityQuote(null);
    setPendingOperation(null);
    setActivationError(null);

    const companySlug = planPayments.companySlug;

    if (!companySlug) {
      setActivationError("No fue posible identificar la empresa para consultar el cambio de capacidad.");
      return;
    }

    startQuoteTransition(async () => {
      const result = await getPlanCapacityChangeQuote({
        companySlug,
        requestedMaxActiveLocations,
      });

      if (capacityQuoteRequestRef.current !== requestId) {
        return;
      }

      if (result.pendingOperation) {
        setPendingOperation(result.pendingOperation);
        return;
      }

      if (result.quote) {
        setCapacityQuote(result.quote);
        return;
      }

      if (requestedMaxActiveLocations !== planPayments.maxActiveLocations) {
        setActivationError(result.error ?? "No fue posible calcular el cambio de capacidad.");
      }
    });
  };
  const openActivationFlow = () => {
    capacityQuoteRequestRef.current += 1;
    setPlanChangeMode("activation");
    setSelectedSiteCount(minimumSiteCount);
    setActivationError(null);
    setPlanChangeSuccess(null);
    setCapacityQuote(null);
    setPendingOperation(null);
    setActivationStep("sites");
  };
  const openCapacityChangeFlow = () => {
    setPlanChangeMode("capacity");
    setSelectedSiteCount(planPayments.maxActiveLocations);
    setActivationError(null);
    setPlanChangeSuccess(null);
    setCapacityQuote(null);
    setPendingOperation(null);
    setActivationStep("sites");
    requestCapacityQuote(planPayments.maxActiveLocations);
  };
  const closePlanConfigurationFlow = () => {
    capacityQuoteRequestRef.current += 1;
    setActivationStep(null);
    setCapacityQuote(null);
    setPendingOperation(null);
    setActivationError(null);
  };
  const updateSelectedSiteCount = (nextValue: number) => {
    setSelectedSiteCount(nextValue);

    if (isCapacityChangeMode) {
      requestCapacityQuote(nextValue);
    }
  };
  const increaseSites = () => updateSelectedSiteCount(selectedSiteCount + 1);
  const decreaseSites = () =>
    updateSelectedSiteCount(Math.max(minimumSelectableSiteCount, selectedSiteCount - 1));
  const startMercadoPagoCheckout = () => {
    if (!visualState.isTrial && !isReactivationFlow && !isCapacityChangeMode) {
      setActivationError("Este flujo de pago no está disponible para el estado actual del plan.");
      return;
    }

    const companySlug = planPayments.companySlug;

    if (!companySlug) {
      setActivationError("No fue posible identificar la empresa para configurar el pago.");
      return;
    }

    if (isCapacityChangeMode && (!hasCurrentCapacityQuote || pendingOperation)) {
      setActivationError("Espera a que confirmemos el cambio de capacidad antes de continuar.");
      return;
    }

    startActivationTransition(async () => {
      const result: {
        checkoutUrl?: string;
        success?: string;
        pendingOperation?: PendingPlanOperation;
        error?: string;
      } = visualState.isTrial || isReactivationFlow
        ? await startPlanActivation({
            companySlug,
            requestedMaxActiveLocations: selectedSiteCount,
          })
        : capacityChangeDirection === "upgrade"
          ? await startPlanUpgrade({
              companySlug,
              requestedMaxActiveLocations: selectedSiteCount,
            })
          : capacityChangeDirection === "downgrade"
            ? await schedulePlanDowngrade({
                companySlug,
                requestedMaxActiveLocations: selectedSiteCount,
              })
            : { error: "Selecciona una capacidad diferente a la actual." };

      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      if (result.success) {
        setActivationError(null);
        setPlanChangeSuccess(result.success);
        return;
      }

      if (result.pendingOperation) {
        setPendingOperation(result.pendingOperation);
        setActivationError(null);
        return;
      }

      setActivationError(result.error ?? "No fue posible preparar el pago con Mercado Pago.");
    });
  };

  return (
    <>
      {!isPaymentMethodFormOpen ? (
        <AdminDrawerSection
          title={
            isActivationMode && isCapacityChangeMode ? (
              "Cambiar número de sedes"
            ) : isReactivationFlow ? (
              "Reactivar plan"
            ) : isActivationMode ? (
              "Plan actual"
            ) : (
              <span className="inline-flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6f7880]">Plan actual:</span>
                <span>{visualState.title}</span>
              </span>
            )
          }
        >
        {!isActivationMode ? (
          <>
            <div>
              {visualState.eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9298]">
                  {visualState.eyebrow}
                </p>
              ) : null}
              <p className={`${visualState.eyebrow ? "mt-3" : ""} text-sm leading-6 text-[#5e6770]`}>
                {paymentStatusMessage}
              </p>
              <div className={`mt-2 inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${paymentStatusClassName}`}>
                <span>Estado: {paymentStatusLabel}</span>
              </div>
            </div>

            {visualState.isActivePlan ? (
              <div className="grid gap-3 border-t border-[#e6eaed] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">Detalles</p>
                <AdminDrawerSummaryRow
                  label="Capacidad contratada"
                  value={`${planPayments.accountCapabilities.maxBranches} sedes`}
                />
                <AdminDrawerSummaryRow
                  label="Valor mensual"
                  value={
                    <MonthlyPriceValue
                      planType={planPayments.planType}
                      baseMonthlyPriceCop={planPayments.baseMonthlyPriceCop}
                      additionalSiteMonthlyPriceCop={planPayments.additionalSiteMonthlyPriceCop}
                      monthlyTotalCop={planPayments.monthlyTotalCop}
                    />
                  }
                />
                {isCancellationScheduled ? (
                  <AdminDrawerSummaryRow label="Finaliza" value={formatDateLabel(cancellationEffectiveAt)} />
                ) : (
                  <AdminDrawerSummaryRow label="Próximo cobro" value={formatDateLabel(planPayments.nextChargeAt)} />
                )}
              </div>
            ) : null}

            {scheduledCapacityChange ? (
              <div className="grid gap-2 rounded-2xl border border-[#ead8b6] bg-[#fff8e9] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f5b15]">
                  Cambio programado
                </p>
                <AdminDrawerSummaryRow
                  label={scheduledCapacityChange.changeType === "upgrade" ? "Aumento de capacidad" : "Reducción de capacidad"}
                  value={`${scheduledCapacityChange.requestedMaxActiveLocations} sede${scheduledCapacityChange.requestedMaxActiveLocations === 1 ? "" : "s"}`}
                />
                <AdminDrawerSummaryRow label="Fecha efectiva" value={formatDateLabel(scheduledCapacityChange.effectiveAt)} />
              </div>
            ) : null}

            {visualState.isTrial ? (
              <AdminDrawerSummaryRow label="Finaliza" value={formatDateLabel(planPayments.trialEndsAt)} />
            ) : null}
            {visualState.isTrial ? (
              <div className="grid gap-3 pt-1">
                <button
                  type="button"
                  onClick={openActivationFlow}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#9edfc1]/60 bg-[#e8f7ef] px-5 py-2.5 text-sm font-semibold text-[#21734f] shadow-[0_14px_34px_rgba(33,115,79,0.14)] transition hover:-translate-y-0.5 hover:bg-[#dff4e8]"
                >
                  Activar plan
                </button>
              </div>
            ) : null}
            {visualState.isActivePlan && !scheduledCapacityChange && !isCancellationScheduled ? (
              <AdminDrawerButton variant="secondary" onClick={openCapacityChangeFlow}>
                Cambiar número de sedes
              </AdminDrawerButton>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="text-lg font-semibold tracking-[-0.04em] text-[#12110f]">
                {activationStep === "payment"
                  ? capacityChangeDirection === "downgrade"
                    ? "Programa tu reducción"
                    : "Mercado Pago"
                  : isCapacityChangeMode
                    ? "¿Necesitas aumentar o disminuir tus sedes?"
                    : isReactivationFlow
                      ? "Reactiva tu plan"
                      : "Configura tu plan"}
              </p>
              {activationStep === "sites" ? (
                <div className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-[#5e6770]">
                  <span className="mt-0.5 shrink-0">
                    <InfoTooltip
                      align="left"
                      label={`Ver valor de cada sede adicional. Cada sede adicional se cobra a ${formatCopAmount(planPayments.additionalSiteMonthlyPriceCop)}/mes.`}
                      message={`Cada sede adicional se cobra a ${formatCopAmount(planPayments.additionalSiteMonthlyPriceCop)}/mes.`}
                    />
                  </span>
                  <p>Elige la cantidad de sedes que requiere tu negocio.</p>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[#5e6770]">Revisa el resumen antes de continuar con Mercado Pago.</p>
              )}
            </div>

            {pendingOperation ? (
              <div className="grid gap-1 border-l-2 border-[#e3b341] bg-[#fff8e9] px-4 py-3 text-sm leading-6 text-[#6d5218]">
                <p className="font-semibold text-[#49360b]">Proceso de pago en curso</p>
                <p>{getPendingOperationMessage(pendingOperation)}</p>
              </div>
            ) : null}

          {activationStep === "sites" ? (
            <>
              <div>
                <p className="text-sm leading-6 text-[#5e6770]">
                  Actualmente tienes {planPayments.maxActiveLocations} {planPayments.maxActiveLocations === 1 ? "sede contratada" : "sedes contratadas"}.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9dfe0] bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={decreaseSites}
                  disabled={selectedSiteCount <= minimumSelectableSiteCount}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#12110f]/12 text-lg font-semibold text-[#12110f] transition hover:bg-[#f7f8f9] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  -
                </button>
                <div className="text-center">
                  <p className="text-3xl font-semibold tracking-[-0.05em] text-[#12110f]">{selectedSiteCount}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">sedes</p>
                </div>
                <button
                  type="button"
                  onClick={increaseSites}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#12110f]/12 text-lg font-semibold text-[#12110f] transition hover:bg-[#f7f8f9]"
                >
                  +
                </button>
              </div>

              {isCapacityChangeMode ? (
                hasCurrentCapacityQuote ? (
                  <div className="grid gap-3 rounded-2xl border border-[#9edfc1]/40 bg-[#f3fbf6] px-4 py-3">
                    <div className="grid gap-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5e8f70]">Actualmente</p>
                      <AdminDrawerSummaryRow
                        label="Sedes"
                        value={`${capacityQuote.currentMaxActiveLocations} ${capacityQuote.currentMaxActiveLocations === 1 ? "sede" : "sedes"}`}
                      />
                      <AdminDrawerSummaryRow
                        label="Valor mensual"
                        value={`${formatCopAmount(capacityQuote.currentMonthlyTotalCop)} COP/mes`}
                      />
                    </div>
                    <div className="grid gap-1 border-t border-[#cfe8d8] pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#21734f]">Nuevo plan</p>
                      <AdminDrawerSummaryRow
                        label="Sedes"
                        value={`${capacityQuote.requestedMaxActiveLocations} ${capacityQuote.requestedMaxActiveLocations === 1 ? "sede" : "sedes"}`}
                      />
                      <AdminDrawerSummaryRow
                        label="Valor mensual"
                        value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                      />
                    </div>
                    {capacityQuote.changeType === "upgrade" ? (
                      <div className="grid gap-1 border-t border-[#cfe8d8] pt-3">
                        <AdminDrawerSummaryRow
                          label="Cobro inmediato"
                          value={`${formatCopAmount(capacityQuote.immediateChargeCop ?? 0)} COP`}
                        />
                        <AdminDrawerSummaryRow
                          label="Próximo cobro mensual"
                          value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                        />
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-[#315e43]">
                        El nuevo valor se aplicará el {formatDateLabel(capacityQuote.effectiveAt)}.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#d9dfe0] bg-[#f7f8f9] px-4 py-3 text-sm leading-6 text-[#5e6770]">
                    {isQuotePending ? "Cotizando el cambio de sedes..." : "Elige una cantidad diferente a la contratada para cotizar."}
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-[#9edfc1]/40 bg-[#f3fbf6] px-4 py-3">
                  <p className="text-sm leading-6 text-[#5e6770]">{activationPlanName}</p>
                  <p className="text-2xl font-semibold tracking-[-0.05em] text-[#21734f]">
                    {formatCopAmount(activationMonthlyTotal)} COP/mes
                  </p>
                  <div className="mt-3 grid gap-1 text-sm leading-6 text-[#315e43]">
                    <p>{planPayments.includedActiveSites} sede incluida en tu plan</p>
                    <p>+ {selectedAdditionalSites} sedes adicionales</p>
                  </div>
                </div>
              )}

              <AdminDrawerButton
                variant="primary"
                onClick={() => setActivationStep("confirm")}
                disabled={
                  isCapacityChangeMode &&
                  (capacityChangeDirection === "unchanged" || !hasCurrentCapacityQuote || Boolean(pendingOperation) || isQuotePending)
                }
              >
                Continuar
              </AdminDrawerButton>
              <AdminDrawerButton onClick={closePlanConfigurationFlow}>Cancelar</AdminDrawerButton>
            </>
          ) : null}

          {activationStep === "confirm" ? (
            isCapacityChangeMode && hasCurrentCapacityQuote ? (
              <>
                <AdminDrawerSummaryRow
                  label="Sedes actuales"
                  value={`${capacityQuote.currentMaxActiveLocations} ${capacityQuote.currentMaxActiveLocations === 1 ? "sede" : "sedes"}`}
                />
                <AdminDrawerSummaryRow
                  label="Valor mensual actual"
                  value={`${formatCopAmount(capacityQuote.currentMonthlyTotalCop)} COP/mes`}
                />
                <AdminDrawerSummaryRow
                  label="Nuevas sedes"
                  value={`${capacityQuote.requestedMaxActiveLocations} ${capacityQuote.requestedMaxActiveLocations === 1 ? "sede" : "sedes"}`}
                />
                {capacityQuote.changeType === "upgrade" ? (
                  <AdminDrawerSummaryRow
                    label="Cobro inmediato"
                    value={`${formatCopAmount(capacityQuote.immediateChargeCop ?? 0)} COP`}
                  />
                ) : (
                  <AdminDrawerSummaryRow
                    label="Fecha efectiva"
                    value={formatDateLabel(capacityQuote.effectiveAt)}
                  />
                )}
                <AdminDrawerSummaryRow
                  label="Próximo cobro mensual"
                  value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                />
                <AdminDrawerSummaryRow
                  label="Capacidad"
                  value={
                    capacityQuote.changeType === "upgrade"
                      ? "Se habilita cuando Mercado Pago confirme el pago."
                      : "Se actualiza en la próxima renovación."
                  }
                />
                <AdminDrawerButton variant="primary" onClick={() => setActivationStep("payment")}>
                  {capacityQuote.changeType === "downgrade" ? "Programar reducción" : "Continuar con pago"}
                </AdminDrawerButton>
                <AdminDrawerButton onClick={() => setActivationStep("sites")}>Volver</AdminDrawerButton>
              </>
            ) : (
            <>
              <AdminDrawerSummaryRow label="Plan" value={activationPlanName} />
              <AdminDrawerSummaryRow
                label="Sedes"
                value={`${selectedSiteCount} ${selectedSiteCount === 1 ? "sede" : "sedes"}`}
              />
              <AdminDrawerSummaryRow
                label="Capacidad"
                value="La selección habilita cupos; las sedes se crean después desde Administrar sedes."
              />
              <AdminDrawerSummaryRow
                label="Valor mensual"
                value={`${formatCopAmount(activationMonthlyTotal)} COP/mes`}
              />
              {isCapacityChangeMode ? (
                <AdminDrawerSummaryRow
                  label="Aplicación"
                  value={
                    capacityChangeDirection === "upgrade"
                      ? "La capacidad aumenta cuando Mercado Pago apruebe el cobro proporcional."
                      : `La capacidad se reduce el ${formatDateLabel(planPayments.nextChargeAt)}.`
                  }
                />
              ) : null}
              <AdminDrawerButton variant="primary" onClick={() => setActivationStep("payment")}>
                {capacityChangeDirection === "downgrade" ? "Programar reducción" : "Continuar con pago"}
              </AdminDrawerButton>
              <AdminDrawerButton onClick={() => setActivationStep("sites")}>Volver</AdminDrawerButton>
            </>
            )
          ) : null}

          {activationStep === "payment" ? (
            <>
              <div>
                <p className="text-sm font-semibold leading-6 text-[#12110f]">
                  {capacityChangeDirection === "downgrade" ? "Confirma el cambio" : "Continúa con Mercado Pago"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#5e6770]">
                  {capacityChangeDirection === "downgrade"
                    ? "No habrá cobro ni reducción inmediata. El nuevo valor aplicará en tu próxima renovación."
                    : isCapacityChangeMode
                      ? "La nueva capacidad se habilitará únicamente cuando Mercado Pago confirme el pago proporcional."
                      : isReactivationFlow
                        ? "Crearás una nueva suscripción. Reactivaremos tu plan únicamente cuando Mercado Pago confirme el pago."
                        : "Crearás el pago de tu suscripción. Activaremos el plan únicamente cuando Mercado Pago confirme el pago."}
                </p>
              </div>
              {isCapacityChangeMode && hasCurrentCapacityQuote ? (
                <>
                  {capacityQuote.changeType === "upgrade" ? (
                    <AdminDrawerSummaryRow
                      label="Cobro inmediato"
                      value={`${formatCopAmount(capacityQuote.immediateChargeCop ?? 0)} COP`}
                    />
                  ) : null}
                  <AdminDrawerSummaryRow
                    label="Próximo cobro mensual"
                    value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                  />
                </>
              ) : (
                <>
                  <AdminDrawerSummaryRow label="Plan" value={activationPlanName} />
                  <AdminDrawerSummaryRow
                    label="Valor mensual"
                    value={`${formatCopAmount(activationMonthlyTotal)} COP/mes`}
                  />
                </>
              )}
              {activationError ? <AdminDrawerFeedback state={{ error: activationError }} /> : null}
              {planChangeSuccess ? <AdminDrawerFeedback state={{ success: planChangeSuccess }} /> : null}
              <AdminDrawerButton
                variant="primary"
                onClick={startMercadoPagoCheckout}
                disabled={isActivationPending || Boolean(planChangeSuccess)}
              >
                {isActivationPending
                  ? capacityChangeDirection === "downgrade"
                    ? "Programando..."
                    : "Preparando pago..."
                  : capacityChangeDirection === "downgrade"
                    ? "Confirmar reducción"
                    : "Abrir Mercado Pago"}
              </AdminDrawerButton>
              <AdminDrawerButton disabled={isActivationPending} onClick={() => setActivationStep("confirm")}>
                Volver
              </AdminDrawerButton>
            </>
          ) : null}
          </>
        )}
        </AdminDrawerSection>
      ) : null}

      {!isActivationMode ? (
        <AdminDrawerSection
          title={
            isPaymentMethodFormOpen ? (
              "Actualizar método de pago"
            ) : (
              <span className="inline-flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6f7880]">Método de pago:</span>
                <span>{paymentProviderLabel}</span>
              </span>
            )
          }
        >
        {isPaymentMethodFormOpen && planPayments.companySlug ? (
          <MercadoPagoPaymentMethodForm
            companySlug={planPayments.companySlug}
            monthlyAmountCop={planPayments.monthlyTotalCop}
            onCompleted={handlePaymentMethodCompleted}
            onCancel={() => setIsPaymentMethodFormOpen(false)}
          />
        ) : visualState.isTrial ? (
          <>
            <div>
              <p className="text-sm font-semibold leading-6 text-[#12110f]">Aún no tienes un método de pago configurado.</p>
              <p className="mt-1 text-sm leading-6 text-[#5e6770]">
                Configura {paymentProviderLabel} para activar tu plan.
              </p>
            </div>
            <AdminDrawerButton variant="primary" onClick={openActivationFlow}>
              Configurar pago
            </AdminDrawerButton>
          </>
        ) : (
          <>
            <div aria-hidden="true" className="border-t border-[#e6eaed]" />
            {planPayments.subscriptionViewState === "cancelled" ? (
              <AdminDrawerButton
                variant="primary"
                onClick={openActivationFlow}
                disabled={!planPayments.companySlug}
              >
                Reactivar plan
              </AdminDrawerButton>
            ) : (
              <AdminDrawerButton
                variant={visualState.hasPaymentIssue ? "primary" : "secondary"}
                onClick={() => {
                  setBillingLifecycleState(undefined);
                  setIsPaymentMethodFormOpen(true);
                }}
                disabled={isCancellationScheduled || !planPayments.companySlug}
              >
                Actualizar método de pago
              </AdminDrawerButton>
            )}
          </>
        )}
        {visualState.isActivePlan && !isCancellationScheduled && !isPaymentMethodFormOpen ? (
          isCancellationConfirmationOpen ? (
            <div role="group" aria-labelledby="cancel-plan-title" className="grid gap-3 rounded-2xl border border-[#ecd0c8] bg-[#fff6f3] px-4 py-4">
              <div>
                <p id="cancel-plan-title" className="text-sm font-semibold text-[#6f271d]">Confirmar cancelación</p>
                <p className="mt-1 text-sm leading-6 text-[#6d4b45]">
                  Tu plan seguirá activo hasta la fecha de finalización del periodo pagado. Después no se realizarán nuevos cobros.
                </p>
              </div>
              <AdminDrawerSummaryRow label="Acceso hasta" value={formatDateLabel(planPayments.nextChargeAt)} />
              <AdminDrawerButton variant="primary" onClick={requestCancellation} disabled={isLifecyclePending}>
                {isLifecyclePending ? "Cancelando..." : "Confirmar cancelación"}
              </AdminDrawerButton>
              <AdminDrawerButton onClick={() => setIsCancellationConfirmationOpen(false)} disabled={isLifecyclePending}>
                Volver
              </AdminDrawerButton>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBillingLifecycleState(undefined);
                setIsCancellationConfirmationOpen(true);
              }}
              className="w-fit justify-self-center text-xs font-semibold text-[#8a2d1f] underline underline-offset-4 transition hover:text-[#5f1e15]"
            >
              Cancelar plan
            </button>
          )
        ) : null}
        <AdminDrawerFeedback state={billingLifecycleState} />
        </AdminDrawerSection>
      ) : null}
    </>
  );
}

export function DashboardHeaderMenu({
  profile,
  planPayments,
  initialPlanPaymentsOpen = false,
}: {
  profile: UserProfile;
  planPayments: PlanPaymentsData;
  initialPlanPaymentsOpen?: boolean;
}) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DashboardMenuPanel | null>(
    initialPlanPaymentsOpen ? "planPayments" : null,
  );
  const [isPlanPaymentsWelcomeOpen, setIsPlanPaymentsWelcomeOpen] = useState(initialPlanPaymentsOpen);

  useEffect(() => {
    const closeMenu = () => setIsMenuOpen(false);

    window.addEventListener("scroll", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("scroll", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, []);

  const openPanel = useCallback((panel: DashboardMenuPanel) => {
    setIsMenuOpen(false);
    setActivePanel(panel);
    setIsPlanPaymentsWelcomeOpen(panel === "planPayments");
  }, []);

  useEffect(() => {
    const openPlanPayments = () => openPanel("planPayments");

    window.addEventListener(openPlanPaymentsEventName, openPlanPayments);

    return () => {
      window.removeEventListener(openPlanPaymentsEventName, openPlanPayments);
    };
  }, [openPanel]);

  const closePanel = useCallback(() => {
    setActivePanel(null);
    setIsPlanPaymentsWelcomeOpen(false);
  }, []);
  const closePlanPaymentsWelcome = useCallback(() => {
    setIsPlanPaymentsWelcomeOpen(false);
  }, []);

  const panelTitle = activePanel ? panelLabels[activePanel] : "";

  return (
    <>
      <div className="absolute right-5 top-5 sm:right-8 sm:top-6">
        <div className="relative">
          <button
            type="button"
            aria-expanded={isMenuOpen}
            aria-label="Abrir menú"
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 text-white transition duration-300 hover:scale-[1.04] hover:bg-[#48c7d2]/16"
          >
            <span className="flex flex-col gap-1">
              <span
                className={`block h-0.5 w-4 rounded-full bg-current transition ${
                  isMenuOpen ? "translate-y-1.5 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-4 rounded-full bg-current transition ${isMenuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 w-4 rounded-full bg-current transition ${
                  isMenuOpen ? "-translate-y-1.5 -rotate-45" : ""
                }`}
              />
            </span>
          </button>

          {isMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-20 flex min-w-[220px] flex-col gap-2 rounded-[1.5rem] border border-[#48c7d2]/30 bg-[#12110f] p-3 shadow-[0_18px_45px_rgba(18,17,15,0.24)]">
              <button type="button" onClick={() => openPanel("profile")} className={menuItemClass}>
                Mi perfil
              </button>
              <button
                type="button"
                onClick={() => {
                  openPanel("planPayments");
                  router.push("/dashboard/plan-y-pagos");
                }}
                className={menuItemClass}
              >
                Plan y pagos
              </button>
              <div className="my-1 h-px bg-[#48c7d2]/20" />
              <form action={logout} className="flex">
                <button type="submit" className={logoutItemClass}>
                  Cerrar sesión
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <AdminSideDrawer
        isOpen={Boolean(activePanel)}
        title={panelTitle}
        closeOnEscape={!isPlanPaymentsWelcomeOpen}
        onClose={closePanel}
      >
        {activePanel === "profile" ? <ProfileDrawerContent profile={profile} /> : null}
        {activePanel === "planPayments" ? (
          <PlanPaymentsDrawerContent planPayments={planPayments} />
        ) : null}
      </AdminSideDrawer>
      {activePanel === "planPayments" && isPlanPaymentsWelcomeOpen ? (
        <PlanPaymentsWelcomeModal onClose={closePlanPaymentsWelcome} />
      ) : null}
    </>
  );
}
