"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  getCurrentUserProfileDetails,
  sendCurrentUserPhoneChangeOTP,
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
import type { AdminActionState, CurrentUserProfileDetailsState } from "@/app/dashboard/actions";
import type { UserProfile } from "@/types/auth";

const menuItemClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16";
const logoutItemClass =
  "inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-white/5 hover:text-[0.95rem] hover:text-white";

type DashboardMenuPanel = "profile" | "billing" | "subscription";

const panelLabels: Record<DashboardMenuPanel, string> = {
  profile: "Mi perfil",
  billing: "Facturación",
  subscription: "Suscripción",
};

const currentPlanLabel = "Plan operativo";
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
    setInitialData(nextData);
    setFormData(nextData);
    setPasswordData(emptyPasswordFormData);
    setPhoneOtpCode("");
    setActiveProfileField(null);
  }, [detailsState?.profile, profile]);

  useEffect(() => {
    if (!state?.success || handledProfileSaveState.current === state) {
      return;
    }

    handledProfileSaveState.current = state;
    setInitialData(formData);
    setPhoneOtpCode("");
    setActiveProfileField(null);
  }, [formData, state]);

  useEffect(() => {
    if (!passwordState?.success || handledPasswordSaveState.current === passwordState) {
      return;
    }

    handledPasswordSaveState.current = passwordState;
    setPasswordData(emptyPasswordFormData);
    setActiveProfileField(null);
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
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={(event) => setFormData((currentData) => ({ ...currentData, fullName: event.target.value }))}
                      placeholder="Nombre completo"
                      required
                      className={`mt-2 ${getInputClassName(isFullNameDirty)}`}
                    />
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
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData((currentData) => ({ ...currentData, email: event.target.value }))}
                      placeholder="nombre@empresa.com"
                      className={`mt-2 ${getInputClassName(isEmailDirty)}`}
                    />
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

function BillingDrawerContent() {
  return (
    <AdminDrawerSection>
      <AdminDrawerSummaryRow label="Plan actual" value={currentPlanLabel} />
      <AdminDrawerSummaryRow label="Estado de la suscripción" value="Activo" />
      <AdminDrawerSummaryRow label="Próximo cobro" value="No configurado" />
      <AdminDrawerSummaryRow label="Método de pago" value="Sin método registrado" />
      <AdminDrawerButton disabled>Actualizar método de pago</AdminDrawerButton>
    </AdminDrawerSection>
  );
}

function SubscriptionDrawerContent({ branchCount }: { branchCount: number }) {
  return (
    <AdminDrawerSection>
      <AdminDrawerSummaryRow label="Plan actual" value={currentPlanLabel} />
      <AdminDrawerSummaryRow label="Cantidad de sedes" value={branchCount} />
      <AdminDrawerButton disabled>Agregar sede</AdminDrawerButton>
      <AdminDrawerButton disabled>Cambiar plan</AdminDrawerButton>
      <AdminDrawerButton variant="danger" disabled>
        Cancelar suscripción
      </AdminDrawerButton>
    </AdminDrawerSection>
  );
}

export function DashboardHeaderMenu({
  profile,
  branchCount,
}: {
  profile: UserProfile;
  branchCount: number;
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
              <button type="button" onClick={() => openPanel("billing")} className={menuItemClass}>
                Facturación
              </button>
              <button type="button" onClick={() => openPanel("subscription")} className={menuItemClass}>
                Suscripción
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
        {activePanel === "billing" ? <BillingDrawerContent /> : null}
        {activePanel === "subscription" ? <SubscriptionDrawerContent branchCount={branchCount} /> : null}
      </AdminSideDrawer>
    </>
  );
}
