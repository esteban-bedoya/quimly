"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  getCurrentUserProfileDetails,
  sendCurrentUserPhoneChangeOTP,
  startPlanActivation,
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
import {
  calculatePlanMonthlyTotalCop,
  formatCopAmount,
  getPlanPaymentsVisualState,
  paymentProviderLabel,
  type PlanPaymentsData,
} from "@/lib/billing";
import type { AdminActionState, CurrentUserProfileDetailsState } from "@/app/dashboard/actions";
import type { UserProfile } from "@/types/auth";

const menuItemClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16";
const logoutItemClass =
  "inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-white/5 hover:text-[0.95rem] hover:text-white";

type DashboardMenuPanel = "profile" | "planPayments";

const openPlanPaymentsEventName = "quimly:open-plan-payments";

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

function PlanPaymentsDrawerContent({
  planPayments,
  onNavigateToSites,
}: {
  planPayments: PlanPaymentsData;
  onNavigateToSites: () => void;
}) {
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
  const [selectedSiteCount, setSelectedSiteCount] = useState(minimumSiteCount);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivationPending, startActivationTransition] = useTransition();
  const activationPlanName = planPayments.planType === "founder" ? "Plan fundador" : "Plan operativo";
  const selectedAdditionalSites = Math.max(selectedSiteCount - planPayments.includedActiveSites, 0);
  const contractedAdditionalSites = Math.max(
    planPayments.accountCapabilities.maxBranches - planPayments.includedActiveSites,
    0,
  );
  const scheduledCapacityChange = planPayments.scheduledCapacityChange;
  const activationMonthlyTotal = calculatePlanMonthlyTotalCop({
    planType: planPayments.planType,
    siteCount: selectedSiteCount,
    baseMonthlyPriceCop: planPayments.baseMonthlyPriceCop,
    additionalSiteMonthlyPriceCop: planPayments.additionalSiteMonthlyPriceCop,
    includedActiveSites: planPayments.includedActiveSites,
  });
  const paymentStatusLabel =
    planPayments.paymentMethodStatus === "configured" ? "Configurado" : "Pendiente de configuración";
  const isActivationMode = activationStep !== null;

  const handleNavigateToSites = () => {
    onNavigateToSites();
    window.requestAnimationFrame(() => {
      document.getElementById("sedes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const openActivationFlow = () => {
    setSelectedSiteCount(minimumSiteCount);
    setActivationError(null);
    setActivationStep("sites");
  };
  const openPaymentRecovery = () => {
    setSelectedSiteCount(minimumSiteCount);
    setActivationStep("payment");
  };
  const increaseSites = () => setSelectedSiteCount((currentValue) => currentValue + 1);
  const decreaseSites = () => setSelectedSiteCount((currentValue) => Math.max(minimumSiteCount, currentValue - 1));
  const startMercadoPagoCheckout = () => {
    if (!visualState.isTrial) {
      setActivationError("La recuperación de pagos se implementará en una siguiente fase.");
      return;
    }

    const companySlug = planPayments.companySlug;

    if (!companySlug) {
      setActivationError("No fue posible identificar la empresa para configurar el pago.");
      return;
    }

    startActivationTransition(async () => {
      const result = await startPlanActivation({
        companySlug,
        requestedMaxActiveLocations: selectedSiteCount,
      });

      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setActivationError(result.error ?? "No fue posible preparar el pago con Mercado Pago.");
    });
  };

  return (
    <>
      <AdminDrawerSection title="Plan actual">
        {!isActivationMode ? (
          <>
            <div>
              {visualState.eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9298]">
                  {visualState.eyebrow}
                </p>
              ) : null}
              <p
                className={
                  visualState.eyebrow
                    ? "mt-2 text-lg font-semibold tracking-[-0.04em] text-[#12110f]"
                    : "text-lg font-semibold tracking-[-0.04em] text-[#12110f]"
                }
              >
                {visualState.title}
              </p>
              {visualState.isActivePlan ? (
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#12110f]">
                  {formatCopAmount(planPayments.monthlyTotalCop)}/mes
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-[#5e6770]">{visualState.message}</p>
            </div>

            {visualState.isActivePlan ? (
              <div className="grid gap-3 border-t border-[#e6eaed] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">Detalle</p>
                <AdminDrawerSummaryRow label="Sedes utilizadas" value={`${planPayments.activeSites} sedes`} />
                <AdminDrawerSummaryRow
                  label="Capacidad contratada"
                  value={`${planPayments.accountCapabilities.maxBranches} sedes`}
                />
                <AdminDrawerSummaryRow
                  label="Valor mensual"
                  value={`${formatCopAmount(planPayments.monthlyTotalCop)}/mes`}
                />
                <AdminDrawerSummaryRow label="Próximo cobro" value={formatDateLabel(planPayments.nextChargeAt)} />
                <AdminDrawerSummaryRow label="Método de pago" value={paymentProviderLabel} />
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

            <AdminDrawerSummaryRow label="Estado" value={visualState.statusLabel} />
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
            {visualState.hasPaymentIssue ? (
              <AdminDrawerButton variant="primary" onClick={openPaymentRecovery}>
                {planPayments.subscriptionViewState === "cancelled" ? "Recuperar suscripción" : "Actualizar pago"}
              </AdminDrawerButton>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="text-lg font-semibold tracking-[-0.04em] text-[#12110f]">
                {activationStep === "payment" ? "Mercado Pago" : "Configura tu plan"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5e6770]">
                {activationStep === "sites"
                  ? "Elige la capacidad de sedes que quieres contratar. No crearemos sedes automáticamente."
                  : "Revisa el resumen antes de continuar con Mercado Pago."}
              </p>
            </div>

          {activationStep === "sites" ? (
            <>
              <div>
                <p className="text-sm font-semibold leading-6 text-[#12110f]">
                  ¿Cuántas sedes necesita administrar?
                </p>
                <p className="mt-1 text-sm leading-6 text-[#5e6770]">
                  La primera sede está incluida dentro del plan.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9dfe0] bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={decreaseSites}
                  disabled={selectedSiteCount <= minimumSiteCount}
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

              <AdminDrawerButton variant="primary" onClick={() => setActivationStep("confirm")}>
                Continuar
              </AdminDrawerButton>
            </>
          ) : null}

          {activationStep === "confirm" ? (
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
              <AdminDrawerButton variant="primary" onClick={() => setActivationStep("payment")}>
                Continuar con pago
              </AdminDrawerButton>
              <AdminDrawerButton onClick={() => setActivationStep("sites")}>Volver</AdminDrawerButton>
            </>
          ) : null}

          {activationStep === "payment" ? (
            <>
              <div>
                <p className="text-sm font-semibold leading-6 text-[#12110f]">
                  Continúa con Mercado Pago
                </p>
                <p className="mt-1 text-sm leading-6 text-[#5e6770]">
                  Crearás el pago de tu suscripción. Activaremos el plan únicamente cuando Mercado Pago confirme el pago.
                </p>
              </div>
              <AdminDrawerSummaryRow label="Plan" value={activationPlanName} />
              <AdminDrawerSummaryRow
                label="Valor mensual"
                value={`${formatCopAmount(activationMonthlyTotal)} COP/mes`}
              />
              {activationError ? <AdminDrawerFeedback state={{ error: activationError }} /> : null}
              <AdminDrawerButton variant="primary" onClick={startMercadoPagoCheckout} disabled={isActivationPending}>
                {isActivationPending ? "Preparando pago..." : "Abrir Mercado Pago"}
              </AdminDrawerButton>
              <AdminDrawerButton disabled={isActivationPending} onClick={() => setActivationStep("confirm")}>
                Volver
              </AdminDrawerButton>
            </>
          ) : null}
          </>
        )}
      </AdminDrawerSection>

      <AdminDrawerSection title="Sedes">
        <div>
          <p className="text-3xl font-semibold tracking-[-0.05em] text-[#12110f]">
            {planPayments.activeSites} / {planPayments.accountCapabilities.maxBranches}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#5e6770]">Sedes activas</p>
        </div>
        <AdminDrawerSummaryRow
          label="Incluidas en tu plan"
          value={`${planPayments.includedActiveSites} ${planPayments.includedActiveSites === 1 ? "sede" : "sedes"}`}
        />
        <AdminDrawerSummaryRow label="Sedes adicionales contratadas" value={contractedAdditionalSites} />
        <AdminDrawerButton variant="primary" onClick={handleNavigateToSites}>
          Administrar sedes
        </AdminDrawerButton>
      </AdminDrawerSection>

      <AdminDrawerSection title="Pago">
        {visualState.isTrial ? (
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
            <AdminDrawerSummaryRow label="Método de pago" value={paymentProviderLabel} />
            <AdminDrawerSummaryRow label="Estado" value={paymentStatusLabel} />
            <AdminDrawerButton
              variant={visualState.hasPaymentIssue ? "primary" : "secondary"}
              onClick={visualState.hasPaymentIssue ? openPaymentRecovery : undefined}
              disabled={!visualState.hasPaymentIssue}
            >
              {visualState.hasPaymentIssue ? "Actualizar pago" : "Actualizar método de pago"}
            </AdminDrawerButton>
            {visualState.isActivePlan ? (
              <button
                type="button"
                disabled
                className="w-fit justify-self-center text-xs font-semibold text-[#8a9298] underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar suscripción
              </button>
            ) : null}
          </>
        )}
      </AdminDrawerSection>
    </>
  );
}

export function DashboardHeaderMenu({
  profile,
  planPayments,
}: {
  profile: UserProfile;
  planPayments: PlanPaymentsData;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DashboardMenuPanel | null>(null);

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
              <button type="button" onClick={() => openPanel("planPayments")} className={menuItemClass}>
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

      <AdminSideDrawer isOpen={Boolean(activePanel)} title={panelTitle} onClose={closePanel}>
        {activePanel === "profile" ? <ProfileDrawerContent profile={profile} /> : null}
        {activePanel === "planPayments" ? (
          <PlanPaymentsDrawerContent planPayments={planPayments} onNavigateToSites={closePanel} />
        ) : null}
      </AdminSideDrawer>
    </>
  );
}
