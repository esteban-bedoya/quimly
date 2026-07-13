import type { SubscriptionStatus } from "@/lib/billing";
import type { BillingIntentStatus, BillingIntentType } from "@/lib/billing/repository.server";

export type LateApprovedResolution = "apply" | "already_applied" | "refund";

export function getCancellationProjection({
  currentStatus,
  currentPeriodEndsAt,
  cancellationAt,
  now,
}: {
  currentStatus: SubscriptionStatus;
  currentPeriodEndsAt: string | null;
  cancellationAt: string;
  now: Date;
}) {
  const cancellationTime = new Date(cancellationAt).getTime();

  if (!Number.isFinite(cancellationTime)) {
    throw new Error("La fecha de cancelación no es válida.");
  }

  if (currentStatus === "trial" || currentStatus === "cancelled") {
    return {
      status: currentStatus,
      effectiveAt: cancellationAt,
    };
  }

  const periodEndTime = currentPeriodEndsAt ? new Date(currentPeriodEndsAt).getTime() : Number.NaN;
  const effectiveAt = Number.isFinite(periodEndTime) && periodEndTime > cancellationTime
    ? new Date(periodEndTime).toISOString()
    : new Date(cancellationTime).toISOString();

  return {
    status: new Date(effectiveAt).getTime() <= now.getTime() ? "cancelled" as const : currentStatus,
    effectiveAt,
  };
}

export function shouldApplyRecurringPaymentAfterCancellation({
  currentStatus,
  paymentStatus,
  cancellationRequested,
}: {
  currentStatus: SubscriptionStatus;
  paymentStatus: string;
  cancellationRequested: boolean;
}) {
  return currentStatus !== "cancelled" || (paymentStatus === "approved" && cancellationRequested);
}

function getRequiredTimestamp(value: string, fieldName: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} no es una fecha válida.`);
  }

  return timestamp;
}

export function getProtectedCancellationEffectiveAt({
  requestedEffectiveAt,
  currentPeriodEndsAt,
  existingCancellationEffectiveAt,
}: {
  requestedEffectiveAt: string;
  currentPeriodEndsAt: string | null;
  existingCancellationEffectiveAt: string | null;
}) {
  const candidates = [requestedEffectiveAt, currentPeriodEndsAt, existingCancellationEffectiveAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => getRequiredTimestamp(value, "La fecha efectiva de cancelación"));

  return new Date(Math.max(...candidates)).toISOString();
}

export function getApprovedRenewalProjection({
  currentPeriodStartedAt,
  currentPeriodEndsAt,
  cancellationRequested,
  cancellationEffectiveAt,
  approvedPeriodStartedAt,
  approvedPeriodEndsAt,
}: {
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  cancellationRequested: boolean;
  cancellationEffectiveAt: string | null;
  approvedPeriodStartedAt: string;
  approvedPeriodEndsAt: string;
}) {
  const approvedEnd = getRequiredTimestamp(approvedPeriodEndsAt, "El fin del periodo aprobado");
  const currentEnd = currentPeriodEndsAt
    ? getRequiredTimestamp(currentPeriodEndsAt, "El fin del periodo vigente")
    : Number.NEGATIVE_INFINITY;
  const keepsCurrentPeriod = currentEnd >= approvedEnd;
  const protectedPeriodEndsAt = new Date(Math.max(currentEnd, approvedEnd)).toISOString();

  return {
    status: "active" as const,
    currentPeriodStartedAt:
      keepsCurrentPeriod && currentPeriodStartedAt ? currentPeriodStartedAt : approvedPeriodStartedAt,
    currentPeriodEndsAt: protectedPeriodEndsAt,
    cancellationEffectiveAt: cancellationRequested
      ? getProtectedCancellationEffectiveAt({
          requestedEffectiveAt: approvedPeriodEndsAt,
          currentPeriodEndsAt: protectedPeriodEndsAt,
          existingCancellationEffectiveAt: cancellationEffectiveAt,
        })
      : null,
  };
}

export function getRecurringPaymentFailureProjection({
  currentStatus,
  currentPeriodEndsAt,
  cancellationRequested,
  cancellationEffectiveAt,
  now,
}: {
  currentStatus: SubscriptionStatus;
  currentPeriodEndsAt: string | null;
  cancellationRequested: boolean;
  cancellationEffectiveAt: string | null;
  now: Date;
}) {
  const protectedAccessUntil = [
    currentPeriodEndsAt,
    cancellationRequested ? cancellationEffectiveAt : null,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => getRequiredTimestamp(value, "El fin del acceso pagado"))
    .reduce<number | null>((latest, value) => latest === null || value > latest ? value : latest, null);

  const keepsPaidAccess = protectedAccessUntil !== null && protectedAccessUntil > now.getTime();

  return {
    status: keepsPaidAccess ? currentStatus : "payment_issue" as const,
    paymentAttentionRequired: !cancellationRequested,
    paymentGraceEndsAt: keepsPaidAccess ? new Date(protectedAccessUntil).toISOString() : null,
  };
}

export function isAbandonedActivationCheckoutForFounder({
  intentType,
  intentStatus,
  expiresAt,
  providerStatus,
  hasChargeablePayment,
  now,
}: {
  intentType: BillingIntentType;
  intentStatus: BillingIntentStatus;
  expiresAt: string | null;
  providerStatus: string;
  hasChargeablePayment: boolean;
  now: Date;
}) {
  if (
    intentType !== "activation" ||
    intentStatus !== "awaiting_customer" ||
    !expiresAt ||
    hasChargeablePayment
  ) {
    return false;
  }

  const expiresAtTime = new Date(expiresAt).getTime();
  const normalizedProviderStatus = providerStatus.trim().toLowerCase();

  return (
    Number.isFinite(expiresAtTime) &&
    expiresAtTime <= now.getTime() &&
    ["pending", "canceled", "cancelled"].includes(normalizedProviderStatus)
  );
}

const openIntentStatuses: BillingIntentStatus[] = [
  "created",
  "awaiting_customer",
  "awaiting_payment",
  "processing",
];

export function decideLateApprovedResolution({
  intentType,
  intentStatus,
  subscriptionStatus,
  providerSubscriptionEnded,
  stateStillMatches,
}: {
  intentType: BillingIntentType;
  intentStatus: BillingIntentStatus;
  subscriptionStatus: SubscriptionStatus;
  providerSubscriptionEnded: boolean;
  stateStillMatches: boolean;
}): LateApprovedResolution {
  if (intentStatus === "succeeded") {
    return "already_applied";
  }

  if (openIntentStatuses.includes(intentStatus)) {
    return stateStillMatches ? "apply" : "refund";
  }

  if (providerSubscriptionEnded) {
    return "refund";
  }

  if (intentType === "activation" && subscriptionStatus === "trial" && stateStillMatches) {
    return "apply";
  }

  if (intentType === "upgrade" && subscriptionStatus === "active" && stateStillMatches) {
    return "apply";
  }

  return "refund";
}

export function isPaymentReversal(status: string, refundedAmountCop: number) {
  return status === "refunded" || status === "charged_back" || refundedAmountCop > 0;
}

export function isCurrentPaymentEntitlement({
  paymentApprovedAt,
  currentPeriodStartedAt,
  lastSuccessfulPaymentAt,
}: {
  paymentApprovedAt: string | null;
  currentPeriodStartedAt: string | null;
  lastSuccessfulPaymentAt: string | null;
}) {
  if (!paymentApprovedAt) {
    return false;
  }

  return paymentApprovedAt === currentPeriodStartedAt || paymentApprovedAt === lastSuccessfulPaymentAt;
}

export function getUpgradeReversalCapacity({
  currentCapacity,
  previousCapacity,
  requestedCapacity,
  includedCapacity,
}: {
  currentCapacity: number;
  previousCapacity: number;
  requestedCapacity: number;
  includedCapacity: number;
}) {
  const financedCapacity = requestedCapacity - previousCapacity;

  if (financedCapacity <= 0) {
    throw new Error("El upgrade revertido no contiene una capacidad financiada válida.");
  }

  return Math.max(includedCapacity, currentCapacity - financedCapacity);
}

export function isUpgradePaymentHistorical({
  currentPeriodStartedAt,
  upgradePeriodEndsAt,
}: {
  currentPeriodStartedAt: string | null;
  upgradePeriodEndsAt: string | null;
}) {
  if (!currentPeriodStartedAt || !upgradePeriodEndsAt) {
    return false;
  }

  const currentStart = new Date(currentPeriodStartedAt).getTime();
  const upgradeEnd = new Date(upgradePeriodEndsAt).getTime();

  return Number.isFinite(currentStart) && Number.isFinite(upgradeEnd) && currentStart >= upgradeEnd;
}

export function assertNoScheduledDowngrade(hasScheduledDowngrade: boolean) {
  if (hasScheduledDowngrade) {
    throw new Error("Cancela primero la reducción de capacidad programada antes de iniciar un upgrade.");
  }
}
