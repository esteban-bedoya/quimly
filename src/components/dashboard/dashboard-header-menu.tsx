"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import {
  getCurrentUserProfileDetails,
  sendCurrentUserPhoneChangeOTP,
  updateCurrentUserProfile,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import {
  AdminDrawerButton,
  AdminDrawerFeedback,
  AdminDrawerField,
  AdminDrawerSection,
  AdminDrawerSubmitButton,
  AdminDrawerSummaryRow,
  AdminSideDrawer,
  adminDrawerInputClassName,
} from "@/components/dashboard/admin-side-drawer";
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

function ProfileDrawerContent({ profile }: { profile: UserProfile }) {
  const [state, formAction] = useActionState<AdminActionState | undefined, FormData>(
    updateCurrentUserProfile,
    undefined,
  );
  const [phoneOtpState, phoneOtpAction] = useActionState<AdminActionState | undefined, FormData>(
    sendCurrentUserPhoneChangeOTP,
    undefined,
  );
  const [detailsState, setDetailsState] = useState<CurrentUserProfileDetailsState | null>(null);

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

  const profileDetails = detailsState.profile;

  return (
    <>
      <form
        key={`${profileDetails.phone}-${profileDetails.email ?? ""}-${profileDetails.fullName ?? ""}`}
        action={formAction}
        className="grid gap-5"
      >
        <AdminDrawerSection>
          <AdminDrawerField id="fullName" label="Nombre">
            <input
              id="fullName"
              name="fullName"
              type="text"
              defaultValue={profileDetails.fullName ?? profile.fullName ?? ""}
              placeholder="Nombre completo"
              required
              className={adminDrawerInputClassName}
            />
          </AdminDrawerField>

          <AdminDrawerField id="phone" label="Celular">
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={profileDetails.phone}
              placeholder="3001234567"
              required
              className={adminDrawerInputClassName}
            />
          </AdminDrawerField>

          <AdminDrawerField id="phoneOtpCode" label="Código WhatsApp">
            <input
              id="phoneOtpCode"
              name="phoneOtpCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Solo si cambias el celular"
              className={adminDrawerInputClassName}
            />
          </AdminDrawerField>

          <button
            type="submit"
            formAction={phoneOtpAction}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#12110f]/12 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f7f8f9]"
          >
            Enviar código WhatsApp
          </button>

          <AdminDrawerField id="email" label="Correo opcional">
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={profileDetails.email ?? ""}
              placeholder="nombre@empresa.com"
              className={adminDrawerInputClassName}
            />
          </AdminDrawerField>

          <AdminDrawerButton disabled>Cambiar contraseña</AdminDrawerButton>
        </AdminDrawerSection>

        <AdminDrawerFeedback state={phoneOtpState} />
        <AdminDrawerFeedback state={state} />
        <AdminDrawerSubmitButton idleLabel="Guardar cambios" pendingLabel="Guardando cambios..." />
      </form>

      <div className="border-t border-[#e6eaed] pt-5">
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-[#5e6770] transition hover:bg-[#f7f8f9] hover:text-[#12110f]"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
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

      <AdminSideDrawer isOpen={Boolean(activePanel)} title={panelTitle} eyebrow="Dashboard" onClose={closePanel}>
        {activePanel === "profile" ? <ProfileDrawerContent profile={profile} /> : null}
        {activePanel === "billing" ? <BillingDrawerContent /> : null}
        {activePanel === "subscription" ? <SubscriptionDrawerContent branchCount={branchCount} /> : null}
      </AdminSideDrawer>
    </>
  );
}
