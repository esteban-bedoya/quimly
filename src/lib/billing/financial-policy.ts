import type { SubscriptionStatus } from "@/lib/billing";
import type { BillingIntentStatus, BillingIntentType } from "@/lib/billing/repository.server";

export type LateApprovedResolution = "apply" | "already_applied" | "refund";

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
