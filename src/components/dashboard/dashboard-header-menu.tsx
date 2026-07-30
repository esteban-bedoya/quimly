"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  getCurrentUserProfileDetails,
  getPlanCapacityChangeQuote,
  cancelCompanyPlan,
  schedulePlanDowngrade,
  updateScheduledDowngradeBranches,
  sendCurrentUserPhoneChangeOTP,
  startPlanActivation,
  startPlanUpgrade,
  updateCurrentUserPassword,
  updateCurrentUserProfile,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import { isValidEmailAddress } from "@/lib/phone";
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
  canCancelSubscription,
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
import type { AccessibleBranchSummary, UserProfile } from "@/types/auth";

const menuItemClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16";
const logoutItemClass =
  "inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-white/5 hover:text-[0.95rem] hover:text-white";

type DashboardMenuPanel = "profile" | "planPayments";

const openPlanPaymentsEventName = "quimly:open-plan-payments";
const subscribeToHydration = () => () => {};
const billingHelpWhatsAppUrl =
  "https://wa.me/573016143804?text=%C2%A1Hola%2C%20Quimly!%20Necesito%20ayuda%20con%20mis%20pagos.";
const totalPayableTodayLabel = (
  <span className="block">
    <span className="block">Total a pagar hoy</span>
    <span className="block text-xs leading-4 text-[#8a9298]">Ajuste proporcional por los días restantes</span>
  </span>
);

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
type PlanActivationStep = "sites" | "branches" | "confirm" | "payment";
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

function MonthlyPriceInfoTooltip({
  planType,
  baseMonthlyPriceCop,
  additionalSiteMonthlyPriceCop,
  align,
}: Pick<PlanPaymentsData, "planType" | "baseMonthlyPriceCop" | "additionalSiteMonthlyPriceCop"> & {
  align?: "left" | "right";
}) {
  const message = getMonthlyPriceTooltipMessage({
    planType,
    baseMonthlyPriceCop,
    additionalSiteMonthlyPriceCop,
  });

  return <InfoTooltip align={align} label={`Ver detalle del valor mensual. ${message}`} message={message} />;
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
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <MonthlyPriceInfoTooltip
        planType={planType}
        baseMonthlyPriceCop={baseMonthlyPriceCop}
        additionalSiteMonthlyPriceCop={additionalSiteMonthlyPriceCop}
      />
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
  const router = useRouter();
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
    let isActive = true;

    getCurrentUserProfileDetails().then((nextState) => {
      if (!isActive || !nextState.profile) {
        return;
      }

      startTransition(() => {
        setDetailsState(nextState);
        router.refresh();
      });
    });

    return () => {
      isActive = false;
    };
  }, [router, state]);

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

function getPlanEndDateLabel(subscriptionViewState: PlanPaymentsData["subscriptionViewState"]) {
  if (subscriptionViewState === "trial_expired") {
    return "Finalizada";
  }

  if (subscriptionViewState === "cancelled") {
    return "Finalizado";
  }

  return "Finaliza";
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
  profileEmail,
  branches,
}: {
  planPayments: PlanPaymentsData;
  profileEmail: string | null;
  branches: AccessibleBranchSummary[];
}) {
  const router = useRouter();
  const visualState = getPlanPaymentsVisualState({
    subscriptionViewState: planPayments.subscriptionViewState,
    planType: planPayments.planType,
    baseMonthlyPriceCop: planPayments.baseMonthlyPriceCop,
  });
  const currentPlanLabel = planPayments.planType === "founder" ? "Plan Founder" : "Plan Operativo";
  const planStatusMessage =
    visualState.title === "Plan fundador" || visualState.title === "Plan operativo" ? null : visualState.title;
  const minimumActivationSiteCount = Math.max(planPayments.includedActiveSites, 1);
  const minimumSiteCount = minimumActivationSiteCount;
  const [activationStep, setActivationStep] = useState<PlanActivationStep | null>(null);
  const [planChangeMode, setPlanChangeMode] = useState<PlanChangeMode>("activation");
  const [selectedSiteCount, setSelectedSiteCount] = useState(minimumSiteCount);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState(profileEmail ?? "");
  const [planChangeSuccess, setPlanChangeSuccess] = useState<string | null>(null);
  const [capacityQuote, setCapacityQuote] = useState<CapacityChangeQuote | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingPlanOperation | null>(null);
  const [isPaymentMethodFormOpen, setIsPaymentMethodFormOpen] = useState(false);
  const [isCancellationConfirmationOpen, setIsCancellationConfirmationOpen] = useState(false);
  const [billingLifecycleState, setBillingLifecycleState] = useState<AdminActionState | undefined>(undefined);
  const [cancellationEffectiveOverride, setCancellationEffectiveOverride] = useState<string | null>(null);
  const [isImmediateCancellationOverride, setIsImmediateCancellationOverride] = useState(false);
  const [selectedDowngradeBranchIds, setSelectedDowngradeBranchIds] = useState<string[]>([]);
  const [isEditingScheduledSelection, setIsEditingScheduledSelection] = useState(false);
  const [scheduledSelectionState, setScheduledSelectionState] = useState<AdminActionState | undefined>(undefined);
  const [isActivationPending, startActivationTransition] = useTransition();
  const [isQuotePending, startQuoteTransition] = useTransition();
  const [isLifecyclePending, startLifecycleTransition] = useTransition();
  const [isScheduledSelectionPending, startScheduledSelectionTransition] = useTransition();
  const capacityQuoteRequestRef = useRef(0);
  const activationPlanType = planPayments.planType;
  const activationBaseMonthlyPriceCop = planPayments.baseMonthlyPriceCop;
  const activationPlanName = activationPlanType === "founder" ? "Plan fundador" : "Plan operativo";
  const selectedAdditionalSites = Math.max(selectedSiteCount - planPayments.includedActiveSites, 0);
  const selectedAdditionalSitesMonthlyTotal =
    selectedAdditionalSites * planPayments.additionalSiteMonthlyPriceCop;
  const scheduledCapacityChange = planPayments.scheduledCapacityChange;
  const activeBranches = branches.filter((branch) => branch.status === "active");
  const activeBranchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const activationMonthlyTotal = planChangeMode === "capacity"
      ? capacityQuote?.requestedMonthlyTotalCop ?? planPayments.monthlyTotalCop
    : calculatePlanMonthlyTotalCop({
        planType: activationPlanType,
        siteCount: selectedSiteCount,
        baseMonthlyPriceCop: activationBaseMonthlyPriceCop,
        additionalSiteMonthlyPriceCop: planPayments.additionalSiteMonthlyPriceCop,
        includedActiveSites: planPayments.includedActiveSites,
      });
  const cancellationEffectiveAt = cancellationEffectiveOverride ?? planPayments.cancellationEffectiveAt;
  const isCancellationScheduled = Boolean(planPayments.cancellationRequestedAt || cancellationEffectiveAt);
  const isImmediateCancellationEffective =
    isImmediateCancellationOverride || planPayments.subscriptionViewState === "cancelled";
  const isCancellationPending = isCancellationScheduled && !isImmediateCancellationEffective && visualState.statusLabel !== "Cancelado";
  const canCancelPlan = canCancelSubscription(planPayments.subscriptionViewState);
  const isImmediateCancellation = canCancelPlan && !visualState.isActivePlan;
  const planEndDateLabel = getPlanEndDateLabel(planPayments.subscriptionViewState);
  const paymentStatusLabel = isImmediateCancellationEffective
    ? "Cancelado"
    : isCancellationPending
      ? "Cancelación programada"
      : visualState.statusLabel;
  const paymentStatusMessage = isImmediateCancellationEffective
    ? "La suscripción fue cancelada y no se realizarán nuevos cobros."
    : isCancellationPending
      ? `Tu plan conserva acceso hasta el ${formatDateLabel(cancellationEffectiveAt)}. No se realizarán nuevos cobros.`
      : planPayments.subscriptionViewState === "payment_issue" && planPayments.paymentGraceEndsAt
        ? `Tu negocio sigue protegido mientras Mercado Pago reintenta el cobro hasta el ${formatDateLabel(planPayments.paymentGraceEndsAt)}. Actualiza tu método de pago para evitar la suspensión.`
        : visualState.message;
  const isActivationMode = activationStep !== null;
  const isReactivationFlow =
    isActivationMode &&
    (planPayments.subscriptionViewState === "cancelled" || planPayments.subscriptionViewState === "suspended");
  const isCapacityChangeMode = planChangeMode === "capacity";
  const paymentStatusDotClassName = paymentStatusLabel === "Cancelación programada"
    ? "bg-[#c4874f]"
    : paymentStatusLabel === "Prueba finalizada" || paymentStatusLabel === "Cancelado" || paymentStatusLabel === "Suspendido"
      ? "bg-[#bc7568]"
      : visualState.isActivePlan
        ? "bg-[#5fa57b]"
        : paymentStatusLabel === "Pago pendiente"
          ? "bg-[#c99a3f]"
          : "bg-[#5e9da5]";
  const capacityChangeDirection =
    selectedSiteCount > planPayments.maxActiveLocations
      ? "upgrade"
      : selectedSiteCount < planPayments.maxActiveLocations
        ? "downgrade"
        : "unchanged";
  const requiresMercadoPagoCheckout = visualState.isTrial || isReactivationFlow || capacityChangeDirection === "upgrade";
  const hasCurrentCapacityQuote =
    capacityQuote?.requestedMaxActiveLocations === selectedSiteCount &&
    capacityQuote.changeType === capacityChangeDirection;
  const minimumSelectableSiteCount = isCapacityChangeMode
    ? Math.max(planPayments.includedActiveSites, 1)
    : minimumSiteCount;

  const downgradeNeedsBranchSelection =
    isCapacityChangeMode &&
    capacityChangeDirection === "downgrade" &&
    activeBranches.length > 0;
  const requiredDowngradeSelectionCount = Math.min(activeBranches.length, selectedSiteCount);
  const scheduledDowngradeNeedsBranchSelection =
    scheduledCapacityChange?.changeType === "downgrade" &&
    activeBranches.length > scheduledCapacityChange.requestedMaxActiveLocations;

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
        setIsImmediateCancellationOverride(result.isImmediate === true);
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
    setSelectedDowngradeBranchIds([]);
    setActivationStep("sites");
    requestCapacityQuote(planPayments.maxActiveLocations);
  };
  const closePlanConfigurationFlow = () => {
    capacityQuoteRequestRef.current += 1;
    setActivationStep(null);
    setCapacityQuote(null);
    setPendingOperation(null);
    setActivationError(null);
    setSelectedDowngradeBranchIds([]);
  };
  const updateSelectedSiteCount = (nextValue: number) => {
    setSelectedSiteCount(nextValue);
    setSelectedDowngradeBranchIds([]);

    if (isCapacityChangeMode) {
      requestCapacityQuote(nextValue);
    }
  };
  const increaseSites = () => updateSelectedSiteCount(selectedSiteCount + 1);
  const decreaseSites = () =>
    updateSelectedSiteCount(Math.max(minimumSelectableSiteCount, selectedSiteCount - 1));
  const toggleDowngradeBranchSelection = (branchId: string) => {
    const targetCount = isEditingScheduledSelection
      ? scheduledCapacityChange?.requestedMaxActiveLocations ?? 0
      : selectedSiteCount;

    setSelectedDowngradeBranchIds((currentBranchIds) => {
      if (currentBranchIds.includes(branchId)) {
        return currentBranchIds.filter((currentBranchId) => currentBranchId !== branchId);
      }

      if (currentBranchIds.length >= targetCount) {
        return currentBranchIds;
      }

      return [...currentBranchIds, branchId];
    });
  };
  const openScheduledSelectionEditor = () => {
    if (!scheduledCapacityChange) {
      return;
    }

    setActivationError(null);
    setScheduledSelectionState(undefined);
    const activeBranchIdSet = new Set(activeBranches.map((branch) => branch.id));
    setSelectedDowngradeBranchIds(scheduledCapacityChange.selectedBranchIds.filter((branchId) => activeBranchIdSet.has(branchId)));
    setIsEditingScheduledSelection(true);
  };
  const saveScheduledSelection = () => {
    const companySlug = planPayments.companySlug;

    if (!companySlug || !scheduledCapacityChange) {
      setScheduledSelectionState({ error: "No fue posible identificar la reducción programada." });
      return;
    }

    startScheduledSelectionTransition(async () => {
      const result = await updateScheduledDowngradeBranches({
        companySlug,
        selectedBranchIds: selectedDowngradeBranchIds,
      });
      setScheduledSelectionState(result);

      if (result.success) {
        setIsEditingScheduledSelection(false);
        router.refresh();
      }
    });
  };
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

    if (requiresMercadoPagoCheckout && !isValidEmailAddress(checkoutEmail)) {
      setActivationError("Ingresa un correo electrónico válido para continuar con Mercado Pago.");
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
            payerEmail: checkoutEmail,
          })
        : capacityChangeDirection === "upgrade"
          ? await startPlanUpgrade({
              companySlug,
              requestedMaxActiveLocations: selectedSiteCount,
              payerEmail: checkoutEmail,
            })
          : capacityChangeDirection === "downgrade"
            ? await schedulePlanDowngrade({
                companySlug,
                requestedMaxActiveLocations: selectedSiteCount,
                selectedBranchIds: selectedDowngradeBranchIds,
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

  if (isEditingScheduledSelection && scheduledCapacityChange) {
    const targetCount = scheduledCapacityChange.requestedMaxActiveLocations;
    const selectedCount = selectedDowngradeBranchIds.length;

    return (
      <>
        <AdminDrawerSection title="Sedes que permanecerán activas">
          <div className="grid gap-4">
            <div>
              <p className="text-sm leading-6 text-[#5e6770]">
                Elige las {targetCount} sede{targetCount === 1 ? "" : "s"} que conservarán la operación cuando Mercado Pago confirme la próxima renovación.
              </p>
              <p className="mt-2 text-xs leading-5 text-[#8a9298]">
                Puedes cambiar esta selección hasta el {formatDateLabel(scheduledCapacityChange.effectiveAt)}. Todas las sedes continúan operando mientras llega esa fecha.
              </p>
            </div>
            <div className="grid gap-2">
              {activeBranches.map((branch) => {
                const isSelected = selectedDowngradeBranchIds.includes(branch.id);
                const isDisabled = !isSelected && selectedCount >= targetCount;

                return (
                  <label
                    key={branch.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-[#12110f] transition ${
                      isSelected ? "border-[#21734f] shadow-[0_10px_28px_rgba(33,115,79,0.12)]" : "border-[#d9dfe0]"
                    } ${isDisabled ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled || isScheduledSelectionPending}
                      onChange={() => toggleDowngradeBranchSelection(branch.id)}
                      className="h-4 w-4 accent-[#21734f]"
                    />
                    <span>{branch.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-sm leading-6 text-[#6f5a2f]">Seleccionadas: {selectedCount} / {targetCount}</p>
            <AdminDrawerFeedback state={scheduledSelectionState} />
            <AdminDrawerButton
              variant="primary"
              onClick={saveScheduledSelection}
              disabled={isScheduledSelectionPending || selectedCount !== targetCount}
            >
              {isScheduledSelectionPending ? "Guardando..." : "Guardar selección"}
            </AdminDrawerButton>
            <AdminDrawerButton
              onClick={() => {
                setIsEditingScheduledSelection(false);
                setScheduledSelectionState(undefined);
              }}
              disabled={isScheduledSelectionPending}
            >
              Volver
            </AdminDrawerButton>
          </div>
        </AdminDrawerSection>
        <div className="border-t border-[#e6eaed] pt-4 text-left">
          <p className="text-xs leading-6 text-[#6a665f]">
            ¿Necesitas ayuda con tus pagos? Escríbenos por{" "}
            <a href={billingHelpWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2a7f86] transition hover:text-[#12110f]">
              WhatsApp
            </a>
          </p>
        </div>
      </>
    );
  }

  return isCancellationConfirmationOpen ? (
    <div role="group" aria-labelledby="cancel-plan-title" className="grid gap-3 rounded-2xl border border-[#ecd0c8] bg-[#fff6f3] px-4 py-4">
      <div>
        <p id="cancel-plan-title" className="text-sm font-semibold text-[#6f271d]">Confirmar cancelación</p>
        <p className="mt-1 text-sm leading-6 text-[#6d4b45]">
          {isImmediateCancellation
            ? "Cancelaremos tu suscripción de inmediato y detendremos los reintentos y cobros futuros. El acceso no se recuperará."
            : "Tu plan seguirá activo hasta la fecha de finalización del periodo pagado. Después no se realizarán nuevos cobros."}
        </p>
        {planPayments.planType === "founder" ? (
          <p className="mt-2 text-sm leading-6 text-[#6d4b45]">
            Si luego reactiva una suscripción cancelada, aplicará el flujo de reactivación normal; por tanto, podría perder el precio Founder si aplica.
          </p>
        ) : null}
      </div>
      <AdminDrawerSummaryRow
        label={isImmediateCancellation ? "Cancelación efectiva" : "Acceso hasta"}
        value={isImmediateCancellation ? "Inmediata" : formatDateLabel(planPayments.nextChargeAt)}
      />
      <AdminDrawerButton variant="primary" onClick={requestCancellation} disabled={isLifecyclePending}>
        {isLifecyclePending ? "Cancelando..." : "Confirmar cancelación"}
      </AdminDrawerButton>
      <AdminDrawerButton onClick={() => setIsCancellationConfirmationOpen(false)} disabled={isLifecyclePending}>
        Cancelar
      </AdminDrawerButton>
    </div>
  ) : (
    <>
      {!isPaymentMethodFormOpen ? (
        <AdminDrawerSection
          title={
            isActivationMode && isCapacityChangeMode ? (
              "Cambiar número de sedes"
            ) : isReactivationFlow ? (
              "Reactivar plan"
            ) : !isActivationMode ? (
              <span className="inline-flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6f7880]">Plan actual:</span>
                <span>{currentPlanLabel}</span>
              </span>
            ) : undefined
          }
        >
        {!isActivationMode ? (
          <>
            <div>
              {planStatusMessage ? (
                <p className="text-sm font-semibold leading-6 text-[#12110f]">{planStatusMessage}</p>
              ) : null}
              {visualState.eyebrow ? (
                <p className={`${planStatusMessage ? "mt-2" : ""} text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9298]`}>
                  {visualState.eyebrow}
                </p>
              ) : null}
              <p className={`${planStatusMessage || visualState.eyebrow ? "mt-3" : ""} text-sm leading-6 text-[#5e6770]`}>
                {paymentStatusMessage}
              </p>
              <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-[#dfe4e6] bg-[#f7f8f9] px-3 py-1.5 text-sm font-semibold text-[#56616a]">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${paymentStatusDotClassName}`} />
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
                  <AdminDrawerSummaryRow label={planEndDateLabel} value={formatDateLabel(cancellationEffectiveAt)} />
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
                {scheduledCapacityChange.changeType === "downgrade" && scheduledDowngradeNeedsBranchSelection ? (
                  <>
                    <div className="grid gap-1 border-t border-[#ead8b6] pt-3 text-sm leading-6 text-[#5f5750]">
                      <span className="font-semibold text-[#12110f]">Sedes que permanecerán activas</span>
                      {scheduledCapacityChange.selectedBranchIds.length ? (
                        <ul className="list-disc pl-5">
                          {scheduledCapacityChange.selectedBranchIds.map((branchId) => (
                            <li key={branchId}>{activeBranchNames.get(branchId) ?? "Sede no disponible"}</li>
                          ))}
                        </ul>
                      ) : (
                        <span>Debes elegir las sedes antes de la fecha efectiva.</span>
                      )}
                    </div>
                    <AdminDrawerButton variant="secondary" onClick={openScheduledSelectionEditor}>
                      {scheduledCapacityChange.selectedBranchIds.length ? "Modificar sedes seleccionadas" : "Elegir sedes seleccionadas"}
                    </AdminDrawerButton>
                  </>
                ) : null}
              </div>
            ) : null}

            {planPayments.subscriptionViewState === "cancelled" && cancellationEffectiveAt ? (
              <AdminDrawerSummaryRow label={planEndDateLabel} value={formatDateLabel(cancellationEffectiveAt)} />
            ) : null}

            {visualState.isTrial ? (
              <AdminDrawerSummaryRow label={planEndDateLabel} value={formatDateLabel(planPayments.trialEndsAt)} />
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
                    <MonthlyPriceInfoTooltip
                      align="left"
                      planType={planPayments.planType}
                      baseMonthlyPriceCop={planPayments.baseMonthlyPriceCop}
                      additionalSiteMonthlyPriceCop={planPayments.additionalSiteMonthlyPriceCop}
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
                  {visualState.isTrial || isReactivationFlow
                    ? "Elige cuántas sedes deseas incluir en tu plan. Podrás activar las sedes después de que Mercado Pago confirme el pago."
                    : `Actualmente tienes ${planPayments.maxActiveLocations} ${planPayments.maxActiveLocations === 1 ? "sede contratada" : "sedes contratadas"}.`}
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
                      {capacityQuote.changeType !== "upgrade" ? (
                        <AdminDrawerSummaryRow
                          label="Próximo cobro mensual"
                          value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                        />
                      ) : null}
                    </div>
                    {capacityQuote.changeType === "upgrade" ? (
                      <div className="grid gap-1 border-t border-[#cfe8d8] pt-3">
                        <AdminDrawerSummaryRow
                          label={totalPayableTodayLabel}
                          value={`${formatCopAmount(capacityQuote.immediateChargeCop ?? 0)} COP`}
                        />
                        <AdminDrawerSummaryRow
                          label="Próximo cobro mensual"
                          value={`${formatCopAmount(capacityQuote.requestedMonthlyTotalCop)} COP/mes`}
                        />
                        <AdminDrawerSummaryRow
                          label="Próxima fecha de cobro"
                          value={formatDateLabel(planPayments.nextChargeAt)}
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
                  <div className="grid gap-1 text-sm leading-6 text-[#315e43]">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                      <span>
                        {planPayments.includedActiveSites} {planPayments.includedActiveSites === 1 ? "sede base" : "sedes base"}
                      </span>
                      <span>{formatCopAmount(activationBaseMonthlyPriceCop)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                      <span>+ {selectedAdditionalSites} sedes adicionales</span>
                      <span>{formatCopAmount(selectedAdditionalSitesMonthlyTotal)}</span>
                    </div>
                  </div>
                  <p className="mt-3 flex items-baseline justify-end gap-1 text-2xl font-semibold tracking-[-0.05em] text-[#21734f]">
                    <span>{formatCopAmount(activationMonthlyTotal)}</span>
                    <span className="text-base">COP/mes</span>
                  </p>
                </div>
              )}

              <AdminDrawerButton
                variant="primary"
                onClick={() => setActivationStep(downgradeNeedsBranchSelection ? "branches" : "confirm")}
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

          {activationStep === "branches" ? (
            <>
              <div>
                <p className="text-sm leading-6 text-[#5e6770]">
                  Elige las {requiredDowngradeSelectionCount} sede{requiredDowngradeSelectionCount === 1 ? "" : "s"} activa{requiredDowngradeSelectionCount === 1 ? "" : "s"} que deseas conservar cuando Mercado Pago confirme la próxima renovación.
                </p>
                <p className="mt-2 text-xs leading-5 text-[#8a9298]">
                  La selección se puede modificar desde Plan y pagos hasta la fecha efectiva. Todas las sedes siguen operando durante el periodo actual.
                </p>
              </div>
              <div className="grid gap-2">
                {activeBranches.map((branch) => {
                  const isSelected = selectedDowngradeBranchIds.includes(branch.id);
                  const isDisabled = !isSelected && selectedDowngradeBranchIds.length >= selectedSiteCount;

                  return (
                    <label
                      key={branch.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-[#12110f] transition ${
                        isSelected ? "border-[#21734f] shadow-[0_10px_28px_rgba(33,115,79,0.12)]" : "border-[#d9dfe0]"
                      } ${isDisabled ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleDowngradeBranchSelection(branch.id)}
                        className="h-4 w-4 accent-[#21734f]"
                      />
                      <span>{branch.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-sm leading-6 text-[#6f5a2f]">Seleccionadas: {selectedDowngradeBranchIds.length} / {requiredDowngradeSelectionCount}</p>
              <AdminDrawerButton
                variant="primary"
                onClick={() => setActivationStep("confirm")}
                disabled={selectedDowngradeBranchIds.length !== requiredDowngradeSelectionCount}
              >
                Continuar
              </AdminDrawerButton>
              <AdminDrawerButton onClick={() => setActivationStep("sites")}>Volver</AdminDrawerButton>
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
                    label={totalPayableTodayLabel}
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
                      : "Se actualiza cuando Mercado Pago confirme la próxima renovación."
                  }
                />
                {capacityQuote.changeType === "downgrade" && selectedDowngradeBranchIds.length ? (
                  <AdminDrawerSummaryRow
                    label="Sedes seleccionadas"
                    value={selectedDowngradeBranchIds.map((branchId) => activeBranchNames.get(branchId) ?? "Sede no disponible").join(", ")}
                  />
                ) : null}
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
                    ? "No habrá reducción inmediata. La nueva capacidad y las sedes seleccionadas se aplicarán cuando Mercado Pago confirme la próxima renovación."
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
                      label={totalPayableTodayLabel}
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
                  <AdminDrawerSummaryRow
                    label="Plan"
                    value={`${activationPlanName} - ${selectedSiteCount} ${selectedSiteCount === 1 ? "sede" : "sedes"}`}
                  />
                  <AdminDrawerSummaryRow
                    label="Valor mensual"
                    value={`${formatCopAmount(activationMonthlyTotal)} COP/mes`}
                  />
                </>
              )}
              {requiresMercadoPagoCheckout ? (
                <div className="rounded-2xl border border-[#d9dfe0] bg-[#f7f8f9] px-4 py-3">
                  <label htmlFor="checkoutEmail" className="ui-form-field">
                    <span className="ui-form-label">Correo para pagar con Mercado Pago</span>
                    <input
                      id="checkoutEmail"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={checkoutEmail}
                      onChange={(event) => {
                        setCheckoutEmail(event.target.value);
                        setActivationError(null);
                      }}
                      placeholder="nombre@empresa.com"
                      className={adminDrawerInputClassName}
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#5e6770]">
                    Usaremos este mismo correo para crear la suscripción y actualizar tu perfil. En Mercado Pago confírmalo; usar otro puede impedir completar el pago.
                  </p>
                </div>
              ) : null}
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
          <>
            <MercadoPagoPaymentMethodForm
              companySlug={planPayments.companySlug}
              monthlyAmountCop={planPayments.monthlyTotalCop}
              onCompleted={handlePaymentMethodCompleted}
              onCancel={() => setIsPaymentMethodFormOpen(false)}
            />
          </>
        ) : visualState.isTrial ? (
          <div>
            <p className="text-sm font-semibold leading-6 text-[#12110f]">Aún no tienes un método de pago configurado.</p>
            <p className="mt-1 text-sm leading-6 text-[#5e6770]">
              Activa tu plan para continuar con Mercado Pago.
            </p>
          </div>
        ) : (
          <>
            <div aria-hidden="true" className="border-t border-[#e6eaed]" />
            {planPayments.subscriptionViewState === "cancelled" || planPayments.subscriptionViewState === "suspended" ? (
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
        {canCancelPlan && !isCancellationScheduled && !isPaymentMethodFormOpen ? (
          <button
            type="button"
            onClick={() => {
              setBillingLifecycleState(undefined);
              setIsCancellationConfirmationOpen(true);
            }}
            className="w-fit justify-self-center text-xs font-semibold text-[#8a2d1f] underline underline-offset-4 transition hover:text-[#5f1e15]"
          >
            {visualState.isActivePlan ? "Cancelar plan" : "Cancelar suscripción"}
          </button>
        ) : null}
        <AdminDrawerFeedback state={billingLifecycleState} />
        </AdminDrawerSection>
      ) : null}

      <div className="border-t border-[#e6eaed] pt-4 text-left">
        <p className="text-xs leading-6 text-[#6a665f]">
          ¿Necesitas ayuda con tus pagos? Escríbenos por{" "}
          <a
            href={billingHelpWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#2a7f86] transition hover:text-[#12110f]"
          >
            WhatsApp
          </a>
        </p>
      </div>
    </>
  );
}

export function DashboardHeaderMenu({
  profile,
  planPayments,
  branches,
}: {
  profile: UserProfile;
  planPayments: PlanPaymentsData;
  branches: AccessibleBranchSummary[];
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DashboardMenuPanel | null>(null);
  const [isPlanPaymentsWelcomeOpen, setIsPlanPaymentsWelcomeOpen] = useState(false);

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
          <PlanPaymentsDrawerContent planPayments={planPayments} profileEmail={profile.email} branches={branches} />
        ) : null}
      </AdminSideDrawer>
      {activePanel === "planPayments" && isPlanPaymentsWelcomeOpen ? (
        <PlanPaymentsWelcomeModal onClose={closePlanPaymentsWelcome} />
      ) : null}
    </>
  );
}
