export const founderPlanBasePriceCop = 19900;
export const operationalPlanBasePriceCop = 24900;
export const additionalSitePriceCop = 9900;
export const includedSitesInBasePlan = 1;
export const paymentProviderLabel = "Mercado Pago";

export type SubscriptionStatus = "trial" | "active" | "payment_issue" | "suspended" | "cancelled";
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
  | "suspended"
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
  selectedBranchIds: string[];
};

export type PlanPaymentsData = {
  companySlug: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionViewState: SubscriptionViewState;
  accountCapabilities: AccountCapabilities;
  planType: PlanType;
  trialEndsAt: string | null;
  nextChargeAt: string | null;
  paymentGraceEndsAt: string | null;
  cancellationRequestedAt: string | null;
  cancellationEffectiveAt: string | null;
  baseMonthlyPriceCop: number;
  additionalSiteMonthlyPriceCop: number;
  includedActiveSites: number;
  maxActiveLocations: number;
  paymentMethodStatus: PaymentMethodStatus;
  paymentAttentionRequired: boolean;
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

  if (status === "suspended") {
    return "suspended";
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
  paymentGraceEndsAt = null,
  now = new Date(),
}: {
  status: SubscriptionStatus;
  planType: PlanType;
  trialEndsAt: string | null;
  paymentGraceEndsAt?: string | null;
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

  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "payment_issue") {
    const paymentGraceEndDate = paymentGraceEndsAt ? new Date(paymentGraceEndsAt) : null;
    return paymentGraceEndDate && !Number.isNaN(paymentGraceEndDate.getTime()) && paymentGraceEndDate.getTime() > now.getTime()
      ? "payment_issue"
      : "suspended";
  }

  return "suspended";
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
    subscriptionViewState === "operational_active" ||
    subscriptionViewState === "payment_issue";
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

  if (status === "suspended") {
    return "Suspendido";
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

  if (subscriptionViewState === "suspended") {
    return "Suspendido";
  }

  if (subscriptionViewState === "cancelled") {
    return "Cancelado";
  }

  return "Activo";
}

export function canCancelSubscription(subscriptionViewState: SubscriptionViewState) {
  return (
    subscriptionViewState === "founder_active" ||
    subscriptionViewState === "operational_active" ||
    subscriptionViewState === "payment_issue" ||
    subscriptionViewState === "suspended"
  );
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
  const hasPaymentIssue =
    subscriptionViewState === "payment_issue" ||
    subscriptionViewState === "suspended" ||
    subscriptionViewState === "cancelled";

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
      message: "Tu negocio está protegido con Quimly.",
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

  if (subscriptionViewState === "suspended") {
    return {
      title: planType === "founder" ? "Plan fundador" : "Plan operativo",
      eyebrow: null,
      statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
      message: "Tu acceso está suspendido porque no pudimos procesar el pago. Reactiva tu plan y elige cuántas sedes deseas incluir.",
      isTrial,
      isActivePlan,
      hasPaymentIssue,
    };
  }

  return {
    title: "Problema con tu pago",
    eyebrow: null,
    statusLabel: getSubscriptionViewStateLabel(subscriptionViewState),
    message: "Tu negocio sigue protegido mientras Mercado Pago reintenta el cobro. Actualiza tu método de pago para evitar la suspensión.",
    isTrial,
    isActivePlan,
    hasPaymentIssue,
  };
}

export type BranchCreationBlockedMessage = {
  summaryLabel: string;
  title: string;
  description: string;
  actionLabel: string;
  action: "open_plan_payments" | "resolve_capacity" | "manage_scheduled_downgrade";
};

export function getBranchCreationBlockedMessage({
  subscriptionViewState,
  accountCapabilities,
  hasScheduledDowngrade = false,
}: {
  subscriptionViewState: SubscriptionViewState;
  accountCapabilities: Pick<AccountCapabilities, "activeBranches" | "maxBranches" | "requiresCapacityResolution">;
  hasScheduledDowngrade?: boolean;
}): BranchCreationBlockedMessage {
  if (accountCapabilities.requiresCapacityResolution) {
    return {
      summaryLabel: "Regularizar sedes activas",
      title: "Primero elige las sedes que seguirán activas.",
      description: `Tu plan permite ${accountCapabilities.maxBranches} sede${accountCapabilities.maxBranches === 1 ? "" : "s"}, pero tienes ${accountCapabilities.activeBranches} activa${accountCapabilities.activeBranches === 1 ? "" : "s"}. Ajusta esa selección antes de crear otra sede.`,
      actionLabel: "Elegir sedes activas",
      action: "resolve_capacity",
    };
  }

  if (subscriptionViewState === "trial_active") {
    return {
      summaryLabel: "Activar plan para agregar sedes",
      title: "Tu prueba incluye una sola sede.",
      description: "Activa tu plan para aumentar la capacidad y agregar otra sede.",
      actionLabel: "Activar plan",
      action: "open_plan_payments",
    };
  }

  if (subscriptionViewState === "trial_expired") {
    return {
      summaryLabel: "Activar plan para agregar sedes",
      title: "Tu prueba terminó.",
      description: "Activa tu plan para recuperar el acceso y agregar las sedes que necesites.",
      actionLabel: "Activar plan",
      action: "open_plan_payments",
    };
  }

  if (subscriptionViewState === "payment_issue") {
    return {
      summaryLabel: "Actualizar método de pago",
      title: "Tu pago requiere atención.",
      description: "Actualiza tu método de pago para conservar el acceso. Cuando Mercado Pago confirme el pago, podrás aumentar la capacidad si lo necesitas.",
      actionLabel: "Actualizar método de pago",
      action: "open_plan_payments",
    };
  }

  if (subscriptionViewState === "suspended") {
    return {
      summaryLabel: "Reactivar plan para agregar sedes",
      title: "Tu acceso está suspendido.",
      description: "Reactiva tu plan y define la capacidad que necesita tu negocio antes de agregar otra sede.",
      actionLabel: "Reactivar plan",
      action: "open_plan_payments",
    };
  }

  if (subscriptionViewState === "cancelled") {
    return {
      summaryLabel: "Recuperar plan para agregar sedes",
      title: "Tu suscripción está cancelada.",
      description: "Recupera tu plan para volver a crear sedes y gestionar la operación.",
      actionLabel: "Recuperar suscripción",
      action: "open_plan_payments",
    };
  }

  if (hasScheduledDowngrade && accountCapabilities.activeBranches >= accountCapabilities.maxBranches) {
    return {
      summaryLabel: "Gestionar reducción programada",
      title: "Tienes una reducción de capacidad programada.",
      description: "Cancela esa reducción antes de aumentar la capacidad y crear otra sede.",
      actionLabel: "Gestionar reducción",
      action: "manage_scheduled_downgrade",
    };
  }

  if (accountCapabilities.activeBranches >= accountCapabilities.maxBranches) {
    return {
      summaryLabel: "Aumentar capacidad",
      title: "No tienes cupos disponibles para otra sede.",
      description: accountCapabilities.maxBranches === 1
        ? "Tu única sede contratada ya está activa. Aumenta la capacidad de tu plan para agregar otra."
        : `Tus ${accountCapabilities.maxBranches} sedes contratadas ya están activas. Aumenta la capacidad de tu plan para agregar otra.`,
      actionLabel: "Aumentar capacidad",
      action: "open_plan_payments",
    };
  }

  return {
    summaryLabel: "Gestionar plan para agregar sedes",
    title: "No puedes agregar una sede en este momento.",
    description: "Revisa la configuración de tu plan para continuar.",
    actionLabel: "Gestionar plan",
    action: "open_plan_payments",
  };
}

export function getSiteStatusLabel(status: SiteStatus) {
  if (status === "active") {
    return "Activa";
  }

  if (status === "deleted") {
    return "Eliminada";
  }

  return "Inactiva";
}
