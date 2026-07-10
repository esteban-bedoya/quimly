export const founderPlanBasePriceCop = 19900;
export const operationalPlanBasePriceCop = 24900;
export const additionalSitePriceCop = 19900;
export const includedSitesInBasePlan = 1;
export const paymentProviderLabel = "Mercado Pago";

export type SubscriptionStatus = "trial" | "active" | "payment_issue" | "cancelled";
export type PlanType = "founder" | "operational";
export type SiteStatus = "active" | "inactive" | "deleted";
export type PaymentMethodStatus = "pending" | "configured";
export type CapacityState = "normal" | "exceeded" | "requires_resolution";
export type CapacityChangeType = "upgrade" | "downgrade";
export type CapacityChangeStatus = "scheduled" | "applied" | "cancelled";
export type SubscriptionViewState =
  | "trial_active"
  | "trial_expired"
  | "founder_active"
  | "operational_active"
  | "payment_issue"
  | "cancelled";

export type AccountCapabilities = {
  maxBranches: number;
  activeBranches: number;
  capacityState: CapacityState;
  canOperate: boolean;
  canCreateBranch: boolean;
  canCreateRecords: boolean;
  canDownloadReports: boolean;
  requiresCapacityResolution: boolean;
};

export type ScheduledCapacityChange = {
  id: string;
  requestedMaxActiveLocations: number;
  changeType: CapacityChangeType;
  status: CapacityChangeStatus;
  effectiveAt: string;
  createdAt: string;
};

export type PlanPaymentsData = {
  companySlug: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionViewState: SubscriptionViewState;
  accountCapabilities: AccountCapabilities;
  planType: PlanType;
  trialEndsAt: string | null;
  nextChargeAt: string | null;
  baseMonthlyPriceCop: number;
  additionalSiteMonthlyPriceCop: number;
  includedActiveSites: number;
  maxActiveLocations: number;
  paymentMethodStatus: PaymentMethodStatus;
  totalSites: number;
  activeSites: number;
  inactiveSites: number;
  billableAdditionalSites: number;
  monthlyTotalCop: number;
  scheduledCapacityChange: ScheduledCapacityChange | null;
};

export type AccountCapabilitiesInput = {
  subscriptionViewState: SubscriptionViewState;
  maxActiveLocations: number;
  activeBranches?: number;
};

export type PlanPaymentsVisualState = {
  title: string;
  eyebrow: string | null;
  statusLabel: string;
  message: string;
  isTrial: boolean;
  isActivePlan: boolean;
  hasPaymentIssue: boolean;
};

export function normalizeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  if (status === "active") {
    return "active";
  }

  if (status === "cancelled" || status === "canceled") {
    return "cancelled";
  }

  if (status === "expired" || status === "past_due" || status === "payment_failed" || status === "payment_issue") {
    return "payment_issue";
  }

  return "trial";
}

export function normalizePlanType(planType: string | null | undefined): PlanType {
  return planType === "founder" ? "founder" : "operational";
}

export function normalizeSiteStatus(status: string | null | undefined, isActive: boolean): SiteStatus {
  if (status === "deleted") {
    return "deleted";
  }

  if (status === "inactive") {
    return "inactive";
  }

  return isActive ? "active" : "inactive";
}

export function normalizePaymentMethodStatus(status: string | null | undefined): PaymentMethodStatus {
  return status === "configured" ? "configured" : "pending";
}

export function formatCopAmount(amount: number) {
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function getDefaultBaseMonthlyPriceCop(planType: PlanType) {
  return planType === "founder" ? founderPlanBasePriceCop : operationalPlanBasePriceCop;
}

export function calculatePlanMonthlyTotalCop({
  planType,
  siteCount,
  baseMonthlyPriceCop = getDefaultBaseMonthlyPriceCop(planType),
  additionalSiteMonthlyPriceCop = additionalSitePriceCop,
  includedActiveSites = includedSitesInBasePlan,
}: {
  planType: PlanType;
  siteCount: number;
  baseMonthlyPriceCop?: number;
  additionalSiteMonthlyPriceCop?: number;
  includedActiveSites?: number;
}) {
  const additionalSites = Math.max(siteCount - includedActiveSites, 0);
  return baseMonthlyPriceCop + additionalSites * additionalSiteMonthlyPriceCop;
}

export function getSubscriptionViewState({
  status,
  planType,
  trialEndsAt,
  now = new Date(),
}: {
  status: SubscriptionStatus;
  planType: PlanType;
  trialEndsAt: string | null;
  now?: Date;
}): SubscriptionViewState {
  if (status === "trial") {
    const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
    return trialEndDate && !Number.isNaN(trialEndDate.getTime()) && trialEndDate.getTime() < now.getTime()
      ? "trial_expired"
      : "trial_active";
  }

  if (status === "active") {
    return planType === "founder" ? "founder_active" : "operational_active";
  }

  return status === "cancelled" ? "cancelled" : "payment_issue";
}

export function getCapacityState({
  canFinanciallyOperate,
  maxBranches,
  activeBranches,
}: {
  canFinanciallyOperate: boolean;
  maxBranches: number;
  activeBranches: number;
}): CapacityState {
  if (activeBranches <= maxBranches) {
    return "normal";
  }

  return canFinanciallyOperate ? "requires_resolution" : "exceeded";
}

export function getAccountCapabilities({
  subscriptionViewState,
  maxActiveLocations,
  activeBranches = 0,
}: AccountCapabilitiesInput): AccountCapabilities {
  const canFinanciallyOperate =
    subscriptionViewState === "trial_active" ||
    subscriptionViewState === "founder_active" ||
    subscriptionViewState === "operational_active";
  const contractedMaxBranches = Math.max(maxActiveLocations, 0);
  const maxBranches = canFinanciallyOperate
    ? subscriptionViewState === "trial_active"
      ? includedSitesInBasePlan
      : contractedMaxBranches
    : 0;
  const normalizedActiveBranches = Math.max(activeBranches, 0);
  const capacityState = getCapacityState({
    canFinanciallyOperate,
    maxBranches,
    activeBranches: normalizedActiveBranches,
  });
  const requiresCapacityResolution = capacityState === "requires_resolution";
  const canOperate = canFinanciallyOperate && !requiresCapacityResolution;

  return {
    maxBranches,
    activeBranches: normalizedActiveBranches,
    capacityState,
    canOperate,
    canCreateBranch: canOperate && normalizedActiveBranches < maxBranches,
    canCreateRecords: canOperate,
    canDownloadReports: true,
    requiresCapacityResolution,
  };
}

export function getPlanName(planType: PlanType, subscriptionStatus: SubscriptionStatus) {
  if (subscriptionStatus === "trial") {
    return "Plan gratuito de prueba";
  }

  return planType === "founder" ? "Plan fundador" : "Plan operativo";
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus) {
  if (status === "trial") {
    return "Prueba activa";
  }

  if (status === "active") {
    return "Activo";
  }

  if (status === "payment_issue") {
    return "Pago pendiente";
  }

  return "Cancelado";
}

export function getSubscriptionViewStateLabel(subscriptionViewState: SubscriptionViewState) {
  if (subscriptionViewState === "trial_active") {
    return "Prueba activa";
  }

  if (subscriptionViewState === "trial_expired") {
    return "Prueba finalizada";
  }

  if (subscriptionViewState === "payment_issue") {
    return "Pago pendiente";
  }

  if (subscriptionViewState === "cancelled") {
    return "Cancelado";
  }

  return "Activo";
}

export function getPlanPaymentsVisualState({
  subscriptionViewState,
  planType,
  baseMonthlyPriceCop,
}: {
  subscriptionViewState: SubscriptionViewState;
  planType: PlanType;
  baseMonthlyPriceCop: number;
}): PlanPaymentsVisualState {
  const isTrial = subscriptionViewState === "trial_active" || subscriptionViewState === "trial_expired";
  const isActivePlan = subscriptionViewState === "founder_active" || subscriptionViewState === "operational_active";
  const hasPaymentIssue = subscriptionViewState === "payment_issue" || subscriptionViewState === "cancelled";

  if (subscriptionViewState === "trial_active" && planType === "founder") {
    return {
      title: "Plan gratuito de prueba",
      eyebrow: "14 DÍAS PARA EXPLORAR QUIMLY",
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: `Activa tu Plan fundador por ${formatCopAmount(
        baseMonthlyPriceCop,
      )}/mes mientras mantengas tu suscripción activa.`,
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  if (subscriptionViewState === "trial_active") {
    return {
      title: "Plan gratuito de prueba",
      eyebrow: "14 DÍAS PARA EXPLORAR QUIMLY",
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: `Al finalizar tu prueba continúa usando Quimly con el Plan operativo desde ${formatCopAmount(
        baseMonthlyPriceCop,
      )}/mes.`,
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  if (subscriptionViewState === "trial_expired") {
    return {
      title: "Tu prueba gratuita terminó",
      eyebrow: null,
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: "Activa un plan para continuar usando Quimly y mantener tus soportes sanitarios organizados.",
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  if (subscriptionViewState === "founder_active") {
    return {
      title: "Plan fundador",
      eyebrow: null,
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: "Tu empresa está usando Quimly con precio fundador.",
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  if (subscriptionViewState === "operational_active") {
    return {
      title: "Plan operativo",
      eyebrow: null,
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: "Tu empresa está protegida con Quimly.",
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  if (subscriptionViewState === "cancelled") {
    return {
      title: "Suscripción cancelada",
      eyebrow: null,
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: "Reactiva tu suscripción para volver a operar sedes y registrar controles sanitarios.",
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  return {
    title: "Problema con tu pago",
    eyebrow: null,
    statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
    message: "No pudimos procesar tu pago. Actualiza tu método de pago para continuar usando Quimly.",
    isTrial,
    isActivePlan,
    hasPaymentIssue,
  };
}

export function getBranchCreationBlockedMessage(subscriptionViewState: SubscriptionViewState) {
  if (subscriptionViewState === "trial_active" || subscriptionViewState === "trial_expired") {
    return {
      title: "Agregar una sede requiere activar tu plan.",
      description: "Activa el Plan operativo para contratar capacidad y sumar sedes cuando la necesites.",
      actionLabel: "Activar plan",
    };
  }

  if (subscriptionViewState === "payment_issue") {
    return {
      title: "Has alcanzado el límite operativo de tu cuenta.",
      description: "Actualiza tu pago para recuperar la capacidad de sedes de tu plan.",
      actionLabel: "Actualizar pago",
    };
  }

  if (subscriptionViewState === "cancelled") {
    return {
      title: "Tu suscripción está cancelada.",
      description: "Reactiva tu plan para volver a crear sedes y gestionar la operación.",
      actionLabel: "Recuperar suscripción",
    };
  }

  return {
    title: "Has alcanzado el límite de sedes activas de tu plan.",
    description: "Amplía tu plan para activar otra sede.",
    actionLabel: "Ampliar plan",
  };
}

export function getSiteStatusLabel(status: SiteStatus) {
  if (status === "active") {
    return "Operativa";
  }

  if (status === "deleted") {
    return "Eliminada";
  }

  return "Inactiva";
}
