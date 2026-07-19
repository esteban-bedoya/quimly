import "server-only";

import { createHash } from "node:crypto";

import {
  getAccountCapabilities,
  getDefaultBaseMonthlyPriceCop,
  getEffectivePlanType as getEffectivePlanTypeForSubscription,
  getSubscriptionViewState,
  normalizePlanType,
  normalizeSubscriptionStatus,
  type AccountCapabilities,
  type PlanType,
  type SubscriptionStatus,
  type SubscriptionViewState,
} from "@/lib/billing";
import {
  createBillingPriceSnapshot,
  quoteCapacity,
  quoteUpgradeProration,
  type CapacityPriceQuote,
  type UpgradeProrationQuote,
} from "@/lib/billing/pricing";
import {
  assertNoScheduledDowngrade,
  decideLateApprovedResolution,
  getUpgradeReversalCapacity,
  isAbandonedActivationCheckoutForFounder,
  isCurrentPaymentEntitlement,
  isPaymentReversal,
  isUpgradePaymentHistorical,
} from "@/lib/billing/financial-policy";
import type {
  BillingProvider,
  ProviderAuthorizedPayment,
  ProviderPayment,
  ProviderSubscription,
} from "@/lib/billing/provider";
import {
  BillingRepository,
  type BillingInvoiceStatus,
  type BillingPaymentStatus,
  type BillingIntentRecord,
  type BillingIntentType,
  type BillingProviderSubscriptionRecord,
  type CompanyBillingContext,
  type CompanySubscriptionBillingRecord,
  type SubscriptionCapacityChangeRecord,
} from "@/lib/billing/repository.server";
import { logServerError } from "@/lib/server/logging";

export type BillingAccountSnapshot = {
  subscription: CompanySubscriptionBillingRecord;
  subscriptionViewState: SubscriptionViewState;
  accountCapabilities: AccountCapabilities;
  activeBranches: number;
  currentQuote: CapacityPriceQuote;
};

export type ActivationPreparation = {
  intentType: "activation" | "recovery";
  account: BillingAccountSnapshot;
  requestedQuote: CapacityPriceQuote;
};

export type InitialActivationIntent = {
  intent: BillingIntentRecord;
  requestedQuote: CapacityPriceQuote;
};

export type InitialPaymentProcessingResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      activationApplied: boolean;
      companyId: string;
      subscriptionId: string;
      providerUpdatedAt: string | null;
    };

export type BillingWebhookProcessingResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      companyId: string;
      subscriptionId: string;
      providerUpdatedAt: string | null;
    };

export type UpgradePreparation = {
  account: BillingAccountSnapshot;
  requestedQuote: CapacityPriceQuote;
  proration: UpgradeProrationQuote;
};

export type UpgradeIntentPreparation = {
  intent: BillingIntentRecord;
  requestedQuote: CapacityPriceQuote;
  proration: UpgradeProrationQuote;
};

export type DowngradePreparation = {
  account: BillingAccountSnapshot;
  requestedQuote: CapacityPriceQuote;
  effectiveAt: string;
};

export type PendingBillingOperation = {
  intentType: BillingIntentType;
  status: "created" | "awaiting_customer" | "awaiting_payment" | "processing" | "compensation_required";
  expiresAt: string | null;
  remainingSeconds: number | null;
};

export type CapacityChangeQuotePreview = {
  changeType: "upgrade" | "downgrade";
  currentMaxActiveLocations: number;
  requestedMaxActiveLocations: number;
  currentMonthlyTotalCop: number;
  requestedMonthlyTotalCop: number;
  immediateChargeCop: number | null;
  effectiveAt: string | null;
};

export type SubscriptionCancellationResult = {
  effectiveAt: string;
  alreadyScheduled: boolean;
};

export class BillingOperationPendingError extends Error {
  readonly pendingOperation: PendingBillingOperation;

  constructor(pendingOperation: PendingBillingOperation) {
    super("Ya existe una operación de billing pendiente para esta empresa.");
    this.name = "BillingOperationPendingError";
    this.pendingOperation = pendingOperation;
  }
}

function ensureRequestedCapacity(requestedMaxActiveLocations: number) {
  if (!Number.isInteger(requestedMaxActiveLocations) || requestedMaxActiveLocations < 1) {
    throw new Error("La capacidad solicitada debe ser un número entero mayor o igual a 1.");
  }
}

function getIntentReference(intentType: BillingIntentType) {
  return `qly_${intentType}_${crypto.randomUUID()}`;
}

function getIntentExpiry(now: Date) {
  return new Date(now.getTime() + 5 * 60 * 1000).toISOString();
}

function getAwaitingCustomerExpiry(now = new Date()) {
  return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
}

function getPendingPaymentExpiry(now = new Date()) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function getActivationRetryExpiry(now = new Date()) {
  return new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000).toISOString();
}

function getProcessingExpiry(now = new Date()) {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
}

function getEffectivePlanType(subscription: CompanySubscriptionBillingRecord): PlanType {
  return getEffectivePlanTypeForSubscription({
    planType: normalizePlanType(subscription.plan_type),
    subscriptionStatus: subscription.status,
  });
}

function createEffectivePriceSnapshot(subscription: CompanySubscriptionBillingRecord) {
  const originalPlanType = normalizePlanType(subscription.plan_type);
  const planType = getEffectivePlanType(subscription);

  return createBillingPriceSnapshot({
    planType,
    baseMonthlyPriceCop:
      planType === originalPlanType
        ? subscription.base_monthly_price_cop
        : getDefaultBaseMonthlyPriceCop(planType),
    additionalSiteMonthlyPriceCop: subscription.additional_site_monthly_price_cop,
    includedActiveSites: subscription.included_active_sites,
  });
}

function normalizeProviderPaymentStatus(providerStatus: string): BillingPaymentStatus {
  switch (providerStatus) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    case "pending":
    case "in_process":
    case "authorized":
      return "pending";
    default:
      return "unknown";
  }
}

function normalizeProviderPayment(payment: ProviderPayment): BillingPaymentStatus {
  return payment.refundedAmountCop > 0 ? "refunded" : normalizeProviderPaymentStatus(payment.providerStatus);
}

function normalizeProviderInvoiceStatus(
  providerStatus: string,
  paymentStatus: BillingPaymentStatus | null,
): BillingInvoiceStatus {
  if (paymentStatus === "approved") {
    return "paid";
  }

  if (paymentStatus === "rejected" || paymentStatus === "charged_back") {
    return "failed";
  }

  if (paymentStatus === "cancelled" || paymentStatus === "refunded") {
    return "cancelled";
  }

  switch (providerStatus.trim().toLowerCase()) {
    case "scheduled":
      return "scheduled";
    case "pending":
      return "pending";
    case "processing":
    case "processed":
      return "processing";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
    case "rejected":
      return "failed";
    default:
      return "unknown";
  }
}

function isOpenBillingIntent(intent: BillingIntentRecord) {
  return ["created", "awaiting_customer", "awaiting_payment", "processing"].includes(intent.status);
}

function getPeriodEnd(periodStartedAt: string, nextPaymentAt: string | null) {
  if (nextPaymentAt) {
    const nextPaymentDate = new Date(nextPaymentAt);
    const periodStartDate = new Date(periodStartedAt);

    if (
      !Number.isNaN(nextPaymentDate.getTime()) &&
      !Number.isNaN(periodStartDate.getTime()) &&
      nextPaymentDate.getTime() > periodStartDate.getTime()
    ) {
      return nextPaymentDate.toISOString();
    }
  }

  return addOneCalendarMonth(periodStartedAt);
}

function addOneCalendarMonth(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Mercado Pago no devolvió una fecha de aprobación válida.");
  }

  const initialDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 1);

  if (date.getUTCDate() !== initialDay) {
    date.setUTCDate(0);
  }

  return date.toISOString();
}

function getRefundIdempotencyKey(providerPaymentId: string, reason: string) {
  return createHash("sha256").update(`quimly:${providerPaymentId}:${reason}`).digest("hex");
}

function isCanceledProviderStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized === "canceled" || normalized === "cancelled";
}

function isSubscriptionCheckoutIntent(intentType: BillingIntentType | undefined) {
  return intentType === "activation" || intentType === "recovery";
}

export class BillingService {
  private readonly repository: BillingRepository;

  constructor(repository = new BillingRepository()) {
    this.repository = repository;
  }

  async getAccountSnapshot(companyId: string): Promise<BillingAccountSnapshot> {
    const context = await this.repository.getCompanyBillingContext(companyId);
    return this.buildAccountSnapshot(context);
  }

  async cancelSubscription({
    companyId,
    requestedBy,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    requestedBy: string;
    provider: BillingProvider;
    now?: Date;
  }): Promise<SubscriptionCancellationResult> {
    const account = await this.getAccountSnapshot(companyId);
    const { subscription } = account;

    if (subscription.cancellation_requested_at && subscription.cancellation_effective_at) {
      return {
        effectiveAt: subscription.cancellation_effective_at,
        alreadyScheduled: true,
      };
    }

    if (
      account.subscriptionViewState !== "founder_active" &&
      account.subscriptionViewState !== "operational_active"
    ) {
      throw new Error("Solo puedes cancelar una suscripción activa.");
    }

    await this.ensureNoOpenIntent(companyId);

    const providerSubscription = await this.repository.findProviderSubscriptionForSubscription(
      subscription.id,
      companyId,
    );

    if (!providerSubscription) {
      throw new Error("La empresa no tiene una suscripción activa en Mercado Pago.");
    }

    const requestedAt = now.toISOString();
    const periodEndTime = subscription.current_period_ends_at
      ? new Date(subscription.current_period_ends_at).getTime()
      : Number.NaN;
    const effectiveAt = Number.isFinite(periodEndTime) && periodEndTime > now.getTime()
      ? new Date(periodEndTime).toISOString()
      : requestedAt;
    const intent = await this.repository.createIntent({
      company_id: companyId,
      subscription_id: subscription.id,
      capacity_change_id: null,
      intent_type: "cancellation",
      plan_type_snapshot: account.currentQuote.planType,
      previous_max_active_locations: subscription.max_active_locations,
      requested_max_active_locations: subscription.max_active_locations,
      monthly_amount_before_cop: account.currentQuote.monthlyTotalCop,
      monthly_amount_after_cop: 0,
      expected_immediate_amount_cop: 0,
      currency: "COP",
      period_started_at: subscription.current_period_started_at,
      period_ends_at: effectiveAt,
      proration_amount_cop: null,
      proration_calculated_at: null,
      proration_formula_version: null,
      external_reference: getIntentReference("cancellation"),
      requested_by: requestedBy,
      expires_at: getProcessingExpiry(now),
      last_error_code: null,
      last_error_message: null,
      metadata: { source: "plan_payments" },
    });

    await this.repository.markIntentProcessing(intent.id, getProcessingExpiry(now));

    let terminalProviderState: ProviderSubscription;

    try {
      const currentProviderState = await provider.getSubscription(
        providerSubscription.provider_subscription_id,
      );
      terminalProviderState = isCanceledProviderStatus(currentProviderState.providerStatus)
        ? currentProviderState
        : await provider.updateSubscriptionStatus(providerSubscription.provider_subscription_id, "canceled");
    } catch (error) {
      await this.repository.markIntentFailed(
        intent.id,
        "provider_subscription_cancellation_failed",
        error instanceof Error ? error.message : "Mercado Pago no pudo cancelar la suscripción.",
      );
      throw error;
    }

    if (
      terminalProviderState.providerSubscriptionId !== providerSubscription.provider_subscription_id ||
      terminalProviderState.currency !== "COP" ||
      !isCanceledProviderStatus(terminalProviderState.providerStatus)
    ) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "Mercado Pago no confirmó de forma consistente la cancelación de la suscripción.",
        "provider_subscription_cancellation_mismatch",
      );
      throw new Error("Mercado Pago no confirmó la cancelación del plan.");
    }

    try {
      await this.repository.completeCancellation({
        intent,
        providerSubscription,
        providerState: terminalProviderState,
        requestedAt,
        effectiveAt,
      });
    } catch (error) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        error instanceof Error ? error.message : "Quimly no pudo registrar la cancelación confirmada.",
        "cancellation_internal_persistence_failed",
      );
      throw error;
    }

    const updatedAccount = await this.getAccountSnapshot(companyId);

    return {
      effectiveAt: updatedAccount.subscription.cancellation_effective_at ?? effectiveAt,
      alreadyScheduled: false,
    };
  }

  async updateSubscriptionPaymentMethod({
    companyId,
    requestedBy,
    cardToken,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    requestedBy: string;
    cardToken: string;
    provider: BillingProvider;
    now?: Date;
  }): Promise<void> {
    const account = await this.getAccountSnapshot(companyId);
    const { subscription } = account;

    if (subscription.cancellation_requested_at) {
      throw new Error("No puedes cambiar el método de pago de una suscripción cancelada.");
    }

    if (
      account.subscriptionViewState !== "founder_active" &&
      account.subscriptionViewState !== "operational_active" &&
      account.subscriptionViewState !== "payment_issue" &&
      account.subscriptionViewState !== "suspended"
    ) {
      throw new Error("La suscripción no admite actualizar el método de pago.");
    }

    await this.ensureNoOpenIntent(companyId);

    const providerSubscription = await this.repository.findProviderSubscriptionForSubscription(
      subscription.id,
      companyId,
    );

    if (!providerSubscription) {
      throw new Error("La empresa no tiene una suscripción actualizable en Mercado Pago.");
    }

    const intent = await this.repository.createIntent({
      company_id: companyId,
      subscription_id: subscription.id,
      capacity_change_id: null,
      intent_type: "payment_method_update",
      plan_type_snapshot: account.currentQuote.planType,
      previous_max_active_locations: subscription.max_active_locations,
      requested_max_active_locations: subscription.max_active_locations,
      monthly_amount_before_cop: account.currentQuote.monthlyTotalCop,
      monthly_amount_after_cop: account.currentQuote.monthlyTotalCop,
      expected_immediate_amount_cop: 0,
      currency: "COP",
      period_started_at: subscription.current_period_started_at,
      period_ends_at: subscription.current_period_ends_at,
      proration_amount_cop: null,
      proration_calculated_at: null,
      proration_formula_version: null,
      external_reference: getIntentReference("payment_method_update"),
      requested_by: requestedBy,
      expires_at: getProcessingExpiry(now),
      last_error_code: null,
      last_error_message: null,
      metadata: { source: "plan_payments" },
    });

    await this.repository.markIntentProcessing(intent.id, getProcessingExpiry(now));

    let providerState: ProviderSubscription;

    try {
      providerState = await provider.updateSubscriptionPaymentMethod(
        providerSubscription.provider_subscription_id,
        cardToken,
        account.subscriptionViewState === "suspended",
      );
    } catch (error) {
      await this.repository.markIntentFailed(
        intent.id,
        "provider_payment_method_update_failed",
        error instanceof Error ? error.message : "Mercado Pago no pudo actualizar el método de pago.",
      );
      throw error;
    }

    if (
      providerState.providerSubscriptionId !== providerSubscription.provider_subscription_id ||
      providerState.currency !== "COP" ||
      isCanceledProviderStatus(providerState.providerStatus) ||
      (account.subscriptionViewState === "suspended" && providerState.providerStatus.trim().toLowerCase() !== "authorized")
    ) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "Mercado Pago respondió con una suscripción inconsistente después de actualizar la tarjeta.",
        "payment_method_update_provider_mismatch",
      );
      throw new Error("Mercado Pago no confirmó el nuevo método de pago.");
    }

    try {
      await this.repository.completePaymentMethodUpdate({ intent, providerSubscription, providerState });
    } catch (error) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        error instanceof Error ? error.message : "Quimly no pudo registrar el nuevo método de pago.",
        "payment_method_update_internal_persistence_failed",
      );
      throw error;
    }
  }

  async getPendingOperation(companyId: string, now = new Date()): Promise<PendingBillingOperation | null> {
    await this.repository.expireStaleOpenIntents(companyId);
    const openIntent = await this.repository.findOpenIntent(companyId);

    if (!openIntent) {
      return null;
    }

    const remainingSeconds = openIntent.expires_at
      ? Math.max(0, Math.ceil((new Date(openIntent.expires_at).getTime() - now.getTime()) / 1000))
      : null;

    return {
      intentType: openIntent.intent_type,
      status: openIntent.status as PendingBillingOperation["status"],
      expiresAt: openIntent.expires_at,
      remainingSeconds,
    };
  }

  async quoteCapacityChange({
    companyId,
    requestedMaxActiveLocations,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    now?: Date;
  }): Promise<CapacityChangeQuotePreview> {
    ensureRequestedCapacity(requestedMaxActiveLocations);

    const account = await this.getAccountSnapshot(companyId);
    const currentMaxActiveLocations = account.subscription.max_active_locations;

    if (requestedMaxActiveLocations === currentMaxActiveLocations) {
      throw new Error("Selecciona una capacidad diferente a la actual.");
    }

    if (requestedMaxActiveLocations > currentMaxActiveLocations) {
      const preparation = await this.prepareUpgrade({ companyId, requestedMaxActiveLocations, now });

      return {
        changeType: "upgrade",
        currentMaxActiveLocations,
        requestedMaxActiveLocations: preparation.requestedQuote.maxActiveLocations,
        currentMonthlyTotalCop: preparation.proration.previousMonthlyTotalCop,
        requestedMonthlyTotalCop: preparation.proration.nextMonthlyTotalCop,
        immediateChargeCop: preparation.proration.proratedAmountCop,
        effectiveAt: null,
      };
    }

    const preparation = await this.prepareDowngrade({ companyId, requestedMaxActiveLocations });

    return {
      changeType: "downgrade",
      currentMaxActiveLocations,
      requestedMaxActiveLocations: preparation.requestedQuote.maxActiveLocations,
      currentMonthlyTotalCop: preparation.account.currentQuote.monthlyTotalCop,
      requestedMonthlyTotalCop: preparation.requestedQuote.monthlyTotalCop,
      immediateChargeCop: null,
      effectiveAt: preparation.effectiveAt,
    };
  }

  async prepareActivation({
    companyId,
    requestedMaxActiveLocations,
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
  }): Promise<ActivationPreparation> {
    ensureRequestedCapacity(requestedMaxActiveLocations);

    const account = await this.getAccountSnapshot(companyId);
    const isTrial = account.subscriptionViewState === "trial_active" || account.subscriptionViewState === "trial_expired";
    const isRecoverable = account.subscriptionViewState === "cancelled";

    if (!isTrial && !isRecoverable) {
      throw new Error("La empresa ya tiene un plan activo. Usa el flujo de cambio de capacidad.");
    }

    return {
      intentType: isTrial ? "activation" : "recovery",
      account,
      requestedQuote: this.quoteCapacity(account.subscription, requestedMaxActiveLocations),
    };
  }

  async createActivationIntent({
    companyId,
    requestedMaxActiveLocations,
    requestedBy,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    provider: BillingProvider;
    now?: Date;
  }): Promise<BillingIntentRecord> {
    const { intent } = await this.createInitialActivationIntent({
      companyId,
      requestedMaxActiveLocations,
      requestedBy,
      provider,
      now,
    });

    return intent;
  }

  async createInitialActivationIntent({
    companyId,
    requestedMaxActiveLocations,
    requestedBy,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    provider: BillingProvider;
    now?: Date;
  }): Promise<InitialActivationIntent> {
    await this.closeExpiredActivationAttempt(companyId, provider, now);
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareActivation({ companyId, requestedMaxActiveLocations });

    const { subscription } = preparation.account;
    const intent = await this.repository.createIntent({
      company_id: companyId,
      subscription_id: subscription.id,
      capacity_change_id: null,
      intent_type: preparation.intentType,
      plan_type_snapshot: preparation.requestedQuote.planType,
      previous_max_active_locations: subscription.max_active_locations,
      requested_max_active_locations: preparation.requestedQuote.maxActiveLocations,
      monthly_amount_before_cop: null,
      monthly_amount_after_cop: preparation.requestedQuote.monthlyTotalCop,
      expected_immediate_amount_cop: preparation.requestedQuote.monthlyTotalCop,
      currency: "COP",
      period_started_at: null,
      period_ends_at: null,
      proration_amount_cop: null,
      proration_calculated_at: null,
      proration_formula_version: null,
      external_reference: getIntentReference(preparation.intentType),
      requested_by: requestedBy,
      expires_at: getIntentExpiry(now),
      last_error_code: null,
      last_error_message: null,
      metadata: {
        source: "billing_service",
        subscriptionViewState: preparation.account.subscriptionViewState,
      },
    });

    return {
      intent,
      requestedQuote: preparation.requestedQuote,
    };
  }

  async closeAbandonedActivationCheckoutForFounder({
    companyId,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    provider: BillingProvider;
    now?: Date;
  }): Promise<boolean> {
    const intent = await this.repository.findOpenIntent(companyId);

    if (
      !intent ||
      intent.intent_type !== "activation" ||
      intent.status !== "awaiting_customer" ||
      !intent.expires_at ||
      new Date(intent.expires_at).getTime() > now.getTime()
    ) {
      return false;
    }

    const providerSubscription = await this.repository.findProviderSubscriptionForIntent(intent.id);

    if (!providerSubscription) {
      return false;
    }

    const [hasChargeablePayment, currentProviderState] = await Promise.all([
      this.repository.hasChargeablePaymentForIntent(intent.id, companyId),
      provider.getSubscription(providerSubscription.provider_subscription_id),
    ]);

    if (!isAbandonedActivationCheckoutForFounder({
      intentType: intent.intent_type,
      intentStatus: intent.status,
      expiresAt: intent.expires_at,
      providerStatus: currentProviderState.providerStatus,
      hasChargeablePayment,
      now,
    })) {
      return false;
    }

    const closureClaimed = await this.repository.claimActivationAttemptClosure(
      intent.id,
      "founder_assignment_after_abandoned_checkout",
    );

    if (!closureClaimed) {
      return false;
    }

    const terminalProviderState = isCanceledProviderStatus(currentProviderState.providerStatus)
      ? currentProviderState
      : await provider.updateSubscriptionStatus(providerSubscription.provider_subscription_id, "canceled");

    if (!isCanceledProviderStatus(terminalProviderState.providerStatus)) {
      throw new Error("Mercado Pago no confirmó la cancelación del checkout abandonado.");
    }

    return this.repository.closeActivationAttempt({
      intent,
      providerSubscription,
      providerStatus: terminalProviderState.providerStatus,
      providerUpdatedAt: terminalProviderState.providerUpdatedAt,
      intentStatus: "cancelled",
      errorCode: "founder_assignment_abandoned_checkout_cancelled",
      errorMessage: "El checkout abandonado fue cancelado antes de asignar Founder.",
    });
  }

  async markInitialActivationCheckoutCreated({
    intent,
    checkoutUrl,
    providerSubscriptionId,
    providerStatus,
    providerCustomerId,
    providerPayerId,
    payerEmail,
    providerVersion,
    providerUpdatedAt,
    nextPaymentAt,
  }: {
    intent: BillingIntentRecord;
    checkoutUrl: string;
    providerSubscriptionId: string;
    providerStatus: string;
    providerCustomerId: string | null;
    providerPayerId: string | null;
    payerEmail: string | null;
    providerVersion: number | null;
    providerUpdatedAt: string | null;
    nextPaymentAt: string | null;
  }) {
    try {
      await this.repository.createProviderSubscription({
        intent,
        providerSubscriptionId,
        providerStatus,
        providerCustomerId,
        providerPayerId,
        payerEmail,
        providerVersion,
        providerUpdatedAt,
        nextPaymentAt,
      });
      await this.repository.markIntentAwaitingCustomer(
        intent.id,
        checkoutUrl,
        getAwaitingCustomerExpiry(),
      );
    } catch (error) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        error instanceof Error ? error.message : "No fue posible persistir la suscripción externa.",
      );
      throw error;
    }
  }

  async markInitialActivationCheckoutFailed(intentId: string, error: unknown) {
    await this.repository.markIntentFailed(
      intentId,
      "provider_checkout_creation_failed",
      error instanceof Error ? error.message : "Mercado Pago no pudo crear el checkout.",
    );
  }

  async processInitialActivationPayment({
    payment,
    webhookEventId,
    provider,
    invoiceId = null,
  }: {
    payment: ProviderPayment;
    webhookEventId: string;
    provider: BillingProvider;
    invoiceId?: string | null;
  }): Promise<InitialPaymentProcessingResult> {
    if (!payment.externalReference) {
      return { handled: false, reason: "El pago no contiene una referencia interna." };
    }

    const intent = await this.repository.findIntentByExternalReference(payment.externalReference);

    if (!intent || !isSubscriptionCheckoutIntent(intent.intent_type)) {
      return { handled: false, reason: "El pago no corresponde a una activación o reactivación." };
    }

    const providerSubscription = await this.repository.findProviderSubscriptionForIntent(intent.id);

    if (!providerSubscription) {
      throw new Error("La activación no tiene una suscripción externa asociada.");
    }

    if (payment.providerSubscriptionId && payment.providerSubscriptionId !== providerSubscription.provider_subscription_id) {
      throw new Error("El pago no corresponde a la suscripción externa esperada.");
    }

    if (payment.currency !== "COP") {
      throw new Error("El pago recibido no está en COP.");
    }

    const normalizedStatus = normalizeProviderPayment(payment);
    const storedPayment = await this.repository.upsertPayment({
      companyId: intent.company_id,
      billingIntentId: intent.id,
      invoiceId,
      providerSubscription,
      providerPaymentId: payment.providerPaymentId,
      providerStatus: payment.providerStatus,
      providerStatusDetail: payment.providerStatusDetail,
      normalizedStatus,
      amountCop: payment.amountCop,
      paymentMethodType: payment.paymentMethodType,
      providerCreatedAt: payment.providerCreatedAt,
      providerUpdatedAt: payment.providerUpdatedAt,
      approvedAt: payment.approvedAt,
      refundedAmountCop: payment.refundedAmountCop,
    });

    if (normalizedStatus !== "approved") {
      if (normalizedStatus === "pending" || normalizedStatus === "unknown") {
        await this.repository.markIntentAwaitingPayment(intent.id, getActivationRetryExpiry());
      } else {
        const closureClaimed = await this.repository.claimActivationAttemptClosure(
          intent.id,
          `payment_${normalizedStatus}`,
        );

        if (!closureClaimed) {
          return {
            handled: true,
            activationApplied: false,
            companyId: intent.company_id,
            subscriptionId: intent.subscription_id,
            providerUpdatedAt: payment.providerUpdatedAt,
          };
        }

        const providerState = providerSubscription.ended_at
          ? await provider.getSubscription(providerSubscription.provider_subscription_id)
          : await provider.updateSubscriptionStatus(providerSubscription.provider_subscription_id, "canceled");

        if (!isCanceledProviderStatus(providerState.providerStatus)) {
          throw new Error("Mercado Pago no confirmó la cancelación del preapproval rechazado.");
        }

        await this.repository.closeActivationAttempt({
          intent,
          providerSubscription,
          providerStatus: providerState.providerStatus,
          providerUpdatedAt: providerState.providerUpdatedAt,
          intentStatus: normalizedStatus === "cancelled" || normalizedStatus === "refunded" ? "cancelled" : "failed",
          errorCode:
            normalizedStatus === "cancelled" || normalizedStatus === "refunded"
              ? "activation_payment_cancelled"
              : "activation_payment_failed",
          errorMessage:
            normalizedStatus === "cancelled" || normalizedStatus === "refunded"
              ? "Mercado Pago canceló o revirtió el pago de activación."
              : "Mercado Pago rechazó el pago de activación y el preapproval fue cancelado.",
        });
      }

      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    const subscriptionStatus = await this.repository.getSubscriptionStatus(
      intent.subscription_id,
      intent.company_id,
    );
    const amountMatches = intent.expected_immediate_amount_cop === payment.amountCop;
    const closureRequested = intent.metadata.activationClosureRequested === true;
    const lateResolution = decideLateApprovedResolution({
      intentType: intent.intent_type,
      intentStatus: intent.status,
      subscriptionStatus,
      providerSubscriptionEnded: Boolean(providerSubscription.ended_at),
      stateStillMatches:
        (intent.intent_type === "activation" ? subscriptionStatus === "trial" : subscriptionStatus === "cancelled") &&
        amountMatches &&
        !closureRequested,
    });

    if (lateResolution === "already_applied") {
      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (lateResolution === "refund") {
      await provider.refundPayment(
        payment.providerPaymentId,
        getRefundIdempotencyKey(payment.providerPaymentId, "late-activation"),
      );

      if (!providerSubscription.ended_at) {
        const providerState = await provider.updateSubscriptionStatus(
          providerSubscription.provider_subscription_id,
          "canceled",
        );
        await this.repository.closeActivationAttempt({
          intent,
          providerSubscription,
          providerStatus: providerState.providerStatus,
          providerUpdatedAt: providerState.providerUpdatedAt,
          intentStatus: "cancelled",
          errorCode: "late_approved_activation_refunded",
          errorMessage: "El pago tardío no podía aplicarse y fue devuelto al pagador.",
        });
      }

      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (!amountMatches) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "El monto aprobado no coincide con el valor esperado para la activación.",
        "activation_amount_mismatch",
      );
      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (isOpenBillingIntent(intent)) {
      await this.repository.markIntentProcessing(intent.id, getProcessingExpiry());
    }
    const periodStartedAt = payment.approvedAt ?? payment.providerUpdatedAt ?? new Date().toISOString();
    await this.repository.activateInitialSubscription({
      intent,
      payment: storedPayment,
      webhookEventId,
      periodStartedAt,
      periodEndsAt: addOneCalendarMonth(periodStartedAt),
    });

    return {
      handled: true,
      activationApplied: true,
      companyId: intent.company_id,
      subscriptionId: intent.subscription_id,
      providerUpdatedAt: payment.providerUpdatedAt,
    };
  }

  async processProviderPayment({
    payment,
    webhookEventId,
    provider,
  }: {
    payment: ProviderPayment;
    webhookEventId: string;
    provider: BillingProvider;
  }): Promise<InitialPaymentProcessingResult> {
    const intent = payment.externalReference
      ? await this.repository.findIntentByExternalReference(payment.externalReference)
      : null;

    if (isPaymentReversal(payment.providerStatus, payment.refundedAmountCop)) {
      const result = await this.processPaymentReversal({
        intent,
        payment,
        provider,
        webhookEventId,
        invoiceId: null,
      });

      return result.handled ? { ...result, activationApplied: false } : result;
    }

    if (!payment.externalReference) {
      return { handled: false, reason: "El pago no contiene una referencia interna." };
    }

    if (isSubscriptionCheckoutIntent(intent?.intent_type)) {
      const subscriptionStatus = await this.repository.getSubscriptionStatus(
        intent.subscription_id,
        intent.company_id,
      );

      const canProcessInitialPayment =
        intent.intent_type === "activation" ? subscriptionStatus === "trial" : subscriptionStatus === "cancelled";

      if (canProcessInitialPayment || intent.status !== "succeeded") {
        return this.processInitialActivationPayment({ payment, webhookEventId, provider });
      }
    }

    if (intent?.intent_type === "upgrade") {
      return this.processUpgradePayment({ intent, payment, provider });
    }

    const providerSubscription = payment.providerSubscriptionId
      ? await this.repository.findProviderSubscriptionByProviderId(payment.providerSubscriptionId)
      : intent
        ? await this.repository.findProviderSubscriptionForIntent(intent.id)
        : null;

    if (!providerSubscription) {
      return { handled: false, reason: "El pago no corresponde a una suscripción externa conocida." };
    }

    const result = await this.processRecurringProviderPayment({
      payment,
      providerSubscription,
      webhookEventId,
      invoiceId: null,
      debitAt: payment.approvedAt ?? payment.providerCreatedAt,
      expectedAmountCop: null,
      provider,
    });

    if (!result.handled) {
      return result;
    }

    return {
      ...result,
      activationApplied: false,
    };
  }

  async processUpgradePayment({
    intent,
    payment,
    provider,
  }: {
    intent: BillingIntentRecord;
    payment: ProviderPayment;
    provider: BillingProvider;
  }): Promise<InitialPaymentProcessingResult> {
    const providerSubscription = await this.repository.findProviderSubscriptionForSubscription(
      intent.subscription_id,
      intent.company_id,
    );

    if (!providerSubscription) {
      return { handled: false, reason: "El upgrade no tiene una suscripción externa activa." };
    }

    if (
      payment.providerSubscriptionId &&
      payment.providerSubscriptionId !== providerSubscription.provider_subscription_id
    ) {
      throw new Error("El pago del upgrade no corresponde a la suscripción externa esperada.");
    }

    if (payment.currency !== "COP") {
      throw new Error("El pago del upgrade no está en COP.");
    }

    const normalizedStatus = normalizeProviderPayment(payment);
    const storedPayment = await this.repository.upsertPayment({
      companyId: intent.company_id,
      billingIntentId: intent.id,
      invoiceId: null,
      providerSubscription,
      providerPaymentId: payment.providerPaymentId,
      providerStatus: payment.providerStatus,
      providerStatusDetail: payment.providerStatusDetail,
      normalizedStatus,
      amountCop: payment.amountCop,
      paymentMethodType: payment.paymentMethodType,
      providerCreatedAt: payment.providerCreatedAt,
      providerUpdatedAt: payment.providerUpdatedAt,
      approvedAt: payment.approvedAt,
      refundedAmountCop: payment.refundedAmountCop,
    });

    if (normalizedStatus !== "approved") {
      if (normalizedStatus === "pending" || normalizedStatus === "unknown") {
        await this.repository.markIntentAwaitingPayment(intent.id, getPendingPaymentExpiry());
      } else if (normalizedStatus === "cancelled" || normalizedStatus === "refunded") {
        await this.repository.markIntentCancelled(
          intent.id,
          "upgrade_payment_cancelled",
          "Mercado Pago canceló el pago del aumento de capacidad.",
        );
      } else {
        await this.repository.markIntentFailed(
          intent.id,
          "upgrade_payment_failed",
          "Mercado Pago no aprobó el pago del aumento de capacidad.",
        );
      }

      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (!isOpenBillingIntent(intent)) {
      if (intent.status !== "succeeded") {
        await provider.refundPayment(
          payment.providerPaymentId,
          getRefundIdempotencyKey(payment.providerPaymentId, "late-upgrade"),
        );
        await this.repository.markIntentCancelled(
          intent.id,
          "late_approved_upgrade_refunded",
          "El upgrade fue aprobado fuera de vigencia y el pago fue devuelto.",
        );
      }

      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (
      intent.expected_immediate_amount_cop === null ||
      intent.monthly_amount_after_cop === null ||
      payment.amountCop !== intent.expected_immediate_amount_cop
    ) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "El monto aprobado no coincide con el valor proporcional esperado para el upgrade.",
        "upgrade_amount_mismatch",
      );
      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    const subscriptionStatus = await this.repository.getSubscriptionStatus(
      intent.subscription_id,
      intent.company_id,
    );

    if (subscriptionStatus !== "active") {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "La cuenta dejó de estar activa antes de aplicar el upgrade aprobado.",
        "upgrade_subscription_state_changed",
      );
      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    await this.repository.markIntentProcessing(intent.id, getProcessingExpiry());
    const providerState = await provider.updateSubscriptionAmount(
      providerSubscription.provider_subscription_id,
      intent.monthly_amount_after_cop,
    );

    if (
      providerState.providerSubscriptionId !== providerSubscription.provider_subscription_id ||
      providerState.currency !== "COP" ||
      providerState.recurringAmountCop !== intent.monthly_amount_after_cop
    ) {
      throw new Error("Mercado Pago no confirmó el nuevo valor mensual del upgrade.");
    }

    await this.repository.completeApprovedUpgrade({
      intent,
      payment: storedPayment,
      providerSubscription,
      providerState,
    });

    return {
      handled: true,
      activationApplied: false,
      companyId: intent.company_id,
      subscriptionId: intent.subscription_id,
      providerUpdatedAt: payment.providerUpdatedAt,
    };
  }

  async processAuthorizedPayment({
    authorizedPayment,
    payment,
    webhookEventId,
    provider,
  }: {
    authorizedPayment: ProviderAuthorizedPayment;
    payment: ProviderPayment | null;
    webhookEventId: string;
    provider: BillingProvider;
  }): Promise<BillingWebhookProcessingResult> {
    const providerSubscription = await this.repository.findProviderSubscriptionByProviderId(
      authorizedPayment.providerSubscriptionId,
    );

    if (!providerSubscription) {
      return { handled: false, reason: "La factura no corresponde a una suscripción externa conocida." };
    }

    if (
      authorizedPayment.externalReference &&
      authorizedPayment.externalReference !== providerSubscription.external_reference
    ) {
      throw new Error("La factura no corresponde a la referencia interna de la suscripción.");
    }

    if (authorizedPayment.currency !== "COP") {
      throw new Error("La factura recurrente no está en COP.");
    }

    const normalizedPaymentStatus = payment ? normalizeProviderPayment(payment) : null;
    const invoicePeriodStartedAt = payment?.approvedAt ?? authorizedPayment.debitAt;
    const invoice = await this.repository.upsertInvoice({
      providerSubscription,
      providerInvoiceId: authorizedPayment.providerInvoiceId,
      providerStatus: authorizedPayment.providerStatus,
      normalizedStatus: normalizeProviderInvoiceStatus(
        authorizedPayment.providerStatus,
        normalizedPaymentStatus,
      ),
      amountCop: authorizedPayment.amountCop,
      debitAt: authorizedPayment.debitAt,
      retryAttempt: authorizedPayment.retryAttempt,
      providerUpdatedAt: authorizedPayment.providerUpdatedAt,
      settledAt:
        normalizedPaymentStatus === "approved"
          ? payment?.approvedAt ?? authorizedPayment.providerUpdatedAt
          : null,
      periodStartedAt: invoicePeriodStartedAt,
      periodEndsAt: invoicePeriodStartedAt
        ? getPeriodEnd(invoicePeriodStartedAt, providerSubscription.next_payment_at)
        : null,
    });

    if (!payment) {
      return {
        handled: true,
        companyId: providerSubscription.company_id,
        subscriptionId: providerSubscription.subscription_id,
        providerUpdatedAt: authorizedPayment.providerUpdatedAt,
      };
    }

    if (
      authorizedPayment.providerPaymentId &&
      authorizedPayment.providerPaymentId !== payment.providerPaymentId
    ) {
      throw new Error("La factura recurrente no corresponde al pago consultado.");
    }

    if (isPaymentReversal(payment.providerStatus, payment.refundedAmountCop)) {
      return this.processPaymentReversal({
        intent: payment.externalReference
          ? await this.repository.findIntentByExternalReference(payment.externalReference)
          : null,
        payment,
        provider,
        webhookEventId,
        invoiceId: invoice.id,
      });
    }

    const subscriptionStatus = await this.repository.getSubscriptionStatus(
      providerSubscription.subscription_id,
      providerSubscription.company_id,
    );

    if (subscriptionStatus === "trial") {
      const activationResult = await this.processInitialActivationPayment({
        payment,
        webhookEventId,
        provider,
        invoiceId: invoice.id,
      });

      if (activationResult.handled) {
        return activationResult;
      }
    }

    return this.processRecurringProviderPayment({
      payment,
      providerSubscription,
      webhookEventId,
      invoiceId: invoice.id,
      debitAt: authorizedPayment.debitAt,
      expectedAmountCop: authorizedPayment.amountCop,
      retryAttempt: authorizedPayment.retryAttempt,
      provider,
    });
  }

  async syncProviderSubscriptionState({
    providerSubscription: providerState,
    webhookEventId,
  }: {
    providerSubscription: ProviderSubscription;
    webhookEventId: string;
  }): Promise<BillingWebhookProcessingResult> {
    const currentProviderSubscription = await this.repository.findProviderSubscriptionByProviderId(
      providerState.providerSubscriptionId,
    );

    if (!currentProviderSubscription) {
      return { handled: false, reason: "La suscripción externa no está registrada en Quimly." };
    }

    if (
      providerState.externalReference &&
      providerState.externalReference !== currentProviderSubscription.external_reference
    ) {
      throw new Error("La suscripción externa no corresponde a la referencia interna esperada.");
    }

    if (providerState.currency !== "COP") {
      throw new Error("La suscripción externa no está configurada en COP.");
    }

    const normalizedStatus = providerState.providerStatus.trim().toLowerCase();
    const updatedProviderSubscription = await this.repository.updateProviderSubscriptionState({
      providerSubscription: currentProviderSubscription,
      providerStatus: providerState.providerStatus,
      providerVersion: providerState.providerVersion,
      providerUpdatedAt: providerState.providerUpdatedAt,
      recurringAmountCop: providerState.recurringAmountCop,
      nextPaymentAt: providerState.nextPaymentAt,
      endedAt:
        normalizedStatus === "cancelled" || normalizedStatus === "canceled"
          ? providerState.providerUpdatedAt ?? new Date().toISOString()
          : null,
    });

    await this.repository.applyProviderSubscriptionState({
      providerSubscription: updatedProviderSubscription,
      providerStatus: providerState.providerStatus,
      providerUpdatedAt: providerState.providerUpdatedAt,
      webhookEventId,
    });

    return {
      handled: true,
      companyId: updatedProviderSubscription.company_id,
      subscriptionId: updatedProviderSubscription.subscription_id,
      providerUpdatedAt: providerState.providerUpdatedAt,
    };
  }

  private async processPaymentReversal({
    intent,
    payment,
    provider,
    webhookEventId,
    invoiceId,
  }: {
    intent: BillingIntentRecord | null;
    payment: ProviderPayment;
    provider: BillingProvider;
    webhookEventId: string;
    invoiceId: string | null;
  }): Promise<BillingWebhookProcessingResult> {
    const providerSubscription = payment.providerSubscriptionId
      ? await this.repository.findProviderSubscriptionByProviderId(payment.providerSubscriptionId)
      : intent
        ? await this.repository.findProviderSubscriptionForIntent(intent.id)
        : null;

    if (!providerSubscription) {
      return { handled: false, reason: "El pago revertido no corresponde a una suscripción externa conocida." };
    }

    const billingIntentId =
      intent?.intent_type === "upgrade" || (isSubscriptionCheckoutIntent(intent?.intent_type) && intent.status !== "succeeded")
        ? intent.id
        : null;
    const normalizedStatus: BillingPaymentStatus =
      payment.providerStatus === "charged_back" ? "charged_back" : "refunded";
    const storedPayment = await this.repository.upsertPayment({
      companyId: providerSubscription.company_id,
      billingIntentId,
      invoiceId,
      providerSubscription,
      providerPaymentId: payment.providerPaymentId,
      providerStatus: payment.providerStatus,
      providerStatusDetail: payment.providerStatusDetail,
      normalizedStatus,
      amountCop: payment.amountCop,
      paymentMethodType: payment.paymentMethodType,
      providerCreatedAt: payment.providerCreatedAt,
      providerUpdatedAt: payment.providerUpdatedAt,
      approvedAt: payment.approvedAt,
      refundedAmountCop:
        normalizedStatus === "refunded" && payment.refundedAmountCop === 0
          ? payment.amountCop
          : payment.refundedAmountCop,
    });
    const context = await this.repository.getPaymentReversalContext(storedPayment.id);
    const reversalPaymentId = context.intent?.metadata.reversalPaymentId;

    if (
      context.intent?.intent_type === "upgrade" &&
      typeof reversalPaymentId === "string" &&
      reversalPaymentId === payment.providerPaymentId
    ) {
      return {
        handled: true,
        companyId: providerSubscription.company_id,
        subscriptionId: providerSubscription.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    const isPartialRefund =
      normalizedStatus === "refunded" &&
      context.payment.refunded_amount_cop > 0 &&
      context.payment.refunded_amount_cop < context.payment.amount_cop;

    if (context.intent?.intent_type === "upgrade" && context.intent.status !== "succeeded") {
      await this.repository.applyPaymentReversal({
        paymentId: storedPayment.id,
        webhookEventId,
        isCurrentEntitlement: false,
        nextSubscriptionStatus: null,
        targetCapacity: null,
        targetRecurringAmountCop: null,
        providerState: null,
        occurredAt: payment.providerUpdatedAt ?? new Date().toISOString(),
      });

      return {
        handled: true,
        companyId: providerSubscription.company_id,
        subscriptionId: providerSubscription.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (isSubscriptionCheckoutIntent(context.intent?.intent_type) && context.intent.status !== "succeeded") {
      const closureClaimed = await this.repository.claimActivationAttemptClosure(
        context.intent.id,
        "payment_reversed",
      );

      if (!closureClaimed) {
        return {
          handled: true,
          companyId: providerSubscription.company_id,
          subscriptionId: providerSubscription.subscription_id,
          providerUpdatedAt: payment.providerUpdatedAt,
        };
      }

      const providerState = providerSubscription.ended_at
        ? await provider.getSubscription(providerSubscription.provider_subscription_id)
        : await provider.updateSubscriptionStatus(providerSubscription.provider_subscription_id, "canceled");

      await this.repository.closeActivationAttempt({
        intent: context.intent,
        providerSubscription,
        providerStatus: providerState.providerStatus,
        providerUpdatedAt: providerState.providerUpdatedAt,
        intentStatus: "cancelled",
        errorCode: "activation_payment_reversed",
        errorMessage: "El pago de activación fue revertido antes de aplicar el acceso.",
      });

      return {
        handled: true,
        companyId: providerSubscription.company_id,
        subscriptionId: providerSubscription.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    const occurredAt = payment.providerUpdatedAt ?? new Date().toISOString();

    if (context.intent?.intent_type === "upgrade") {
      const historical = isUpgradePaymentHistorical({
        currentPeriodStartedAt: context.subscription.current_period_started_at,
        upgradePeriodEndsAt: context.intent.period_ends_at,
      });

      if (historical && !isPartialRefund) {
        await this.repository.applyPaymentReversal({
          paymentId: storedPayment.id,
          webhookEventId,
          isCurrentEntitlement: false,
          nextSubscriptionStatus: null,
          targetCapacity: null,
          targetRecurringAmountCop: null,
          providerState: null,
          occurredAt,
        });
      } else if (isPartialRefund) {
        await this.repository.applyPaymentReversal({
          paymentId: storedPayment.id,
          webhookEventId,
          isCurrentEntitlement: true,
          nextSubscriptionStatus: "payment_issue",
          targetCapacity: null,
          targetRecurringAmountCop: null,
          providerState: null,
          occurredAt,
        });
      } else {
        if (
          context.intent.previous_max_active_locations === null ||
          context.intent.requested_max_active_locations === null
        ) {
          throw new Error("El upgrade revertido no contiene el cambio de capacidad original.");
        }

        const targetCapacity = getUpgradeReversalCapacity({
          currentCapacity: context.subscription.max_active_locations,
          previousCapacity: context.intent.previous_max_active_locations,
          requestedCapacity: context.intent.requested_max_active_locations,
          includedCapacity: context.subscription.included_active_sites,
        });
        const targetQuote = this.quoteCapacity(context.subscription, targetCapacity);
        const providerState = await provider.updateSubscriptionAmount(
          providerSubscription.provider_subscription_id,
          targetQuote.monthlyTotalCop,
        );

        if (providerState.recurringAmountCop !== targetQuote.monthlyTotalCop || providerState.currency !== "COP") {
          throw new Error("Mercado Pago no confirmó el monto recurrente después de revertir el upgrade.");
        }

        await this.repository.applyPaymentReversal({
          paymentId: storedPayment.id,
          webhookEventId,
          isCurrentEntitlement: true,
          nextSubscriptionStatus: null,
          targetCapacity,
          targetRecurringAmountCop: targetQuote.monthlyTotalCop,
          providerState,
          occurredAt,
        });
      }
    } else {
      const currentEntitlement = isCurrentPaymentEntitlement({
        paymentApprovedAt: context.payment.approved_at,
        currentPeriodStartedAt: context.subscription.current_period_started_at,
        lastSuccessfulPaymentAt: context.subscription.last_successful_payment_at,
      });
      let providerState: ProviderSubscription | null = null;
      let nextSubscriptionStatus: SubscriptionStatus | null = null;

      if (currentEntitlement) {
        const isInitialSubscription = isSubscriptionCheckoutIntent(context.intent?.intent_type);
        const targetProviderStatus = normalizedStatus === "refunded" && isInitialSubscription ? "canceled" : "paused";

        providerState = providerSubscription.ended_at
          ? await provider.getSubscription(providerSubscription.provider_subscription_id)
          : await provider.updateSubscriptionStatus(
              providerSubscription.provider_subscription_id,
              targetProviderStatus,
            );
        nextSubscriptionStatus = normalizedStatus === "refunded" && isInitialSubscription ? "cancelled" : "payment_issue";
      }

      await this.repository.applyPaymentReversal({
        paymentId: storedPayment.id,
        webhookEventId,
        isCurrentEntitlement: currentEntitlement,
        nextSubscriptionStatus,
        targetCapacity: null,
        targetRecurringAmountCop: null,
        providerState,
        occurredAt,
      });
    }

    return {
      handled: true,
      companyId: providerSubscription.company_id,
      subscriptionId: providerSubscription.subscription_id,
      providerUpdatedAt: payment.providerUpdatedAt,
    };
  }

  private async processRecurringProviderPayment({
    payment,
    providerSubscription,
    webhookEventId,
    invoiceId,
    debitAt,
    expectedAmountCop,
    retryAttempt = 0,
    provider,
  }: {
    payment: ProviderPayment;
    providerSubscription: BillingProviderSubscriptionRecord;
    webhookEventId: string;
    invoiceId: string | null;
    debitAt: string | null;
    expectedAmountCop: number | null;
    retryAttempt?: number;
    provider: BillingProvider;
  }): Promise<BillingWebhookProcessingResult> {
    if (payment.currency !== "COP") {
      throw new Error("El pago recurrente no está en COP.");
    }

    const expectedRecurringAmount = expectedAmountCop ?? providerSubscription.recurring_amount_cop;

    if (payment.amountCop !== expectedRecurringAmount) {
      throw new Error("El monto del pago recurrente no coincide con el valor de la suscripción.");
    }

    const normalizedStatus = normalizeProviderPayment(payment);
    const storedPayment = await this.repository.upsertPayment({
      companyId: providerSubscription.company_id,
      billingIntentId: null,
      invoiceId,
      providerSubscription,
      providerPaymentId: payment.providerPaymentId,
      providerStatus: payment.providerStatus,
      providerStatusDetail: payment.providerStatusDetail,
      normalizedStatus,
      amountCop: payment.amountCop,
      paymentMethodType: payment.paymentMethodType,
      providerCreatedAt: payment.providerCreatedAt,
      providerUpdatedAt: payment.providerUpdatedAt,
      approvedAt: payment.approvedAt,
      refundedAmountCop: payment.refundedAmountCop,
    });
    const periodStartedAt = payment.approvedAt ?? payment.providerUpdatedAt ?? debitAt ?? new Date().toISOString();

    await this.repository.applyRecurringPaymentState({
      providerSubscription,
      payment: storedPayment,
      normalizedStatus,
      webhookEventId,
      periodStartedAt,
      periodEndsAt: getPeriodEnd(periodStartedAt, providerSubscription.next_payment_at),
      retryAttempt,
      debitAt,
    });

    if (normalizedStatus === "rejected" && retryAttempt >= 4) {
      const pausedProviderSubscription = await provider.updateSubscriptionStatus(
        providerSubscription.provider_subscription_id,
        "paused",
      );

      if (
        pausedProviderSubscription.providerSubscriptionId !== providerSubscription.provider_subscription_id ||
        pausedProviderSubscription.currency !== "COP" ||
        pausedProviderSubscription.providerStatus.trim().toLowerCase() !== "paused"
      ) {
        throw new Error("Mercado Pago no confirmó la pausa de la suscripción después de agotar los reintentos.");
      }

      await this.repository.updateProviderSubscriptionState({
        providerSubscription,
        providerStatus: pausedProviderSubscription.providerStatus,
        providerVersion: pausedProviderSubscription.providerVersion,
        providerUpdatedAt: pausedProviderSubscription.providerUpdatedAt,
        recurringAmountCop: pausedProviderSubscription.recurringAmountCop,
        nextPaymentAt: pausedProviderSubscription.nextPaymentAt,
        endedAt: null,
      });
    }

    return {
      handled: true,
      companyId: providerSubscription.company_id,
      subscriptionId: providerSubscription.subscription_id,
      providerUpdatedAt: payment.providerUpdatedAt,
    };
  }

  async prepareUpgrade({
    companyId,
    requestedMaxActiveLocations,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    now?: Date;
  }): Promise<UpgradePreparation> {
    ensureRequestedCapacity(requestedMaxActiveLocations);

    const scheduledDowngrade = await this.repository.findScheduledCapacityChange(companyId);
    assertNoScheduledDowngrade(Boolean(scheduledDowngrade));

    const account = await this.getAccountSnapshot(companyId);

    if (
      account.subscriptionViewState !== "founder_active" &&
      account.subscriptionViewState !== "operational_active"
    ) {
      throw new Error("Solo puedes ampliar capacidad con una suscripción activa.");
    }

    if (requestedMaxActiveLocations <= account.subscription.max_active_locations) {
      throw new Error("La capacidad solicitada debe ser mayor que la capacidad contratada actual.");
    }

    const periodStartedAt = account.subscription.current_period_started_at;
    const periodEndsAt = account.subscription.current_period_ends_at;

    if (!periodStartedAt || !periodEndsAt) {
      throw new Error("La suscripción activa no tiene un periodo de facturación válido para calcular el prorrateo.");
    }

    const requestedQuote = this.quoteCapacity(account.subscription, requestedMaxActiveLocations);

    const proration = quoteUpgradeProration({
      currentQuote: account.currentQuote,
      requestedQuote,
      periodStartedAt,
      periodEndsAt,
      now,
    });

    if (proration.proratedAmountCop <= 0) {
      throw new Error("El periodo actual ya terminó. Actualiza la vista e intenta nuevamente.");
    }

    return {
      account,
      requestedQuote,
      proration,
    };
  }

  async createUpgradeIntent({
    companyId,
    requestedMaxActiveLocations,
    requestedBy,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    now?: Date;
  }): Promise<UpgradeIntentPreparation> {
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareUpgrade({ companyId, requestedMaxActiveLocations, now });
    const { subscription } = preparation.account;

    const providerSubscription = await this.repository.findProviderSubscriptionForSubscription(
      subscription.id,
      companyId,
    );

    if (!providerSubscription) {
      throw new Error("La empresa no tiene una suscripción de Mercado Pago activa para ampliar.");
    }

    const intent = await this.repository.createIntent({
      company_id: companyId,
      subscription_id: subscription.id,
      capacity_change_id: null,
      intent_type: "upgrade",
      plan_type_snapshot: preparation.requestedQuote.planType,
      previous_max_active_locations: subscription.max_active_locations,
      requested_max_active_locations: preparation.requestedQuote.maxActiveLocations,
      monthly_amount_before_cop: preparation.proration.previousMonthlyTotalCop,
      monthly_amount_after_cop: preparation.proration.nextMonthlyTotalCop,
      expected_immediate_amount_cop: preparation.proration.proratedAmountCop,
      currency: "COP",
      period_started_at: preparation.proration.periodStartedAt,
      period_ends_at: preparation.proration.periodEndsAt,
      proration_amount_cop: preparation.proration.proratedAmountCop,
      proration_calculated_at: preparation.proration.calculatedAt,
      proration_formula_version: preparation.proration.formulaVersion,
      external_reference: getIntentReference("upgrade"),
      requested_by: requestedBy,
      expires_at: getIntentExpiry(now),
      last_error_code: null,
      last_error_message: null,
      metadata: {
        source: "billing_service",
        monthlyDeltaCop: preparation.proration.monthlyDeltaCop,
      },
    });

    return {
      intent,
      requestedQuote: preparation.requestedQuote,
      proration: preparation.proration,
    };
  }

  getUpgradeCheckoutExpiresAt(now = new Date()) {
    return getAwaitingCustomerExpiry(now);
  }

  async markUpgradeCheckoutCreated({
    intent,
    checkoutUrl,
    providerCheckoutId,
    expiresAt,
  }: {
    intent: BillingIntentRecord;
    checkoutUrl: string;
    providerCheckoutId: string;
    expiresAt: string;
  }) {
    await this.repository.markIntentAwaitingCustomer(
      intent.id,
      checkoutUrl,
      expiresAt,
      {
        ...intent.metadata,
        providerCheckoutId,
      },
    );
  }

  async markUpgradeCheckoutFailed(intentId: string, error: unknown) {
    await this.repository.markIntentFailed(
      intentId,
      "provider_checkout_creation_failed",
      error instanceof Error ? error.message : "Mercado Pago no pudo crear el pago del upgrade.",
    );
  }

  async prepareDowngrade({
    companyId,
    requestedMaxActiveLocations,
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
  }): Promise<DowngradePreparation> {
    ensureRequestedCapacity(requestedMaxActiveLocations);

    const account = await this.getAccountSnapshot(companyId);

    if (
      account.subscriptionViewState !== "founder_active" &&
      account.subscriptionViewState !== "operational_active"
    ) {
      throw new Error("Solo puedes programar una reducción con una suscripción activa.");
    }

    if (requestedMaxActiveLocations >= account.subscription.max_active_locations) {
      throw new Error("La capacidad solicitada debe ser menor que la capacidad contratada actual.");
    }

    if (!account.subscription.current_period_ends_at) {
      throw new Error("La suscripción activa no tiene una fecha de renovación para programar la reducción.");
    }

    return {
      account,
      requestedQuote: this.quoteCapacity(account.subscription, requestedMaxActiveLocations),
      effectiveAt: account.subscription.current_period_ends_at,
    };
  }

  async scheduleDowngrade({
    companyId,
    requestedMaxActiveLocations,
    requestedBy,
    provider,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    provider: BillingProvider;
    now?: Date;
  }): Promise<{
    intent: BillingIntentRecord;
    capacityChange: SubscriptionCapacityChangeRecord;
  }> {
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareDowngrade({ companyId, requestedMaxActiveLocations });
    const { subscription } = preparation.account;
    const providerSubscription = await this.repository.findProviderSubscriptionForSubscription(
      subscription.id,
      companyId,
    );

    if (!providerSubscription) {
      throw new Error("La empresa no tiene una suscripción de Mercado Pago activa para reducir.");
    }

    const capacityChange = await this.repository.createScheduledCapacityChange({
      companyId,
      subscriptionId: subscription.id,
      currentMaxActiveLocations: subscription.max_active_locations,
      requestedMaxActiveLocations: preparation.requestedQuote.maxActiveLocations,
      effectiveAt: preparation.effectiveAt,
      requestedBy,
    });

    let intent: BillingIntentRecord;

    try {
      intent = await this.repository.createIntent({
        company_id: companyId,
        subscription_id: subscription.id,
        capacity_change_id: capacityChange.id,
        intent_type: "downgrade",
        plan_type_snapshot: preparation.requestedQuote.planType,
        previous_max_active_locations: subscription.max_active_locations,
        requested_max_active_locations: preparation.requestedQuote.maxActiveLocations,
        monthly_amount_before_cop: preparation.account.currentQuote.monthlyTotalCop,
        monthly_amount_after_cop: preparation.requestedQuote.monthlyTotalCop,
        expected_immediate_amount_cop: null,
        currency: "COP",
        period_started_at: subscription.current_period_started_at,
        period_ends_at: preparation.effectiveAt,
        proration_amount_cop: null,
        proration_calculated_at: null,
        proration_formula_version: null,
        external_reference: getIntentReference("downgrade"),
        requested_by: requestedBy,
        expires_at: getIntentExpiry(now),
        last_error_code: null,
        last_error_message: null,
        metadata: {
          source: "billing_service",
          appliesAtRenewal: true,
        },
      });

    } catch (error) {
      try {
        await this.repository.cancelScheduledCapacityChange(capacityChange.id, companyId);
      } catch (compensationError) {
        logServerError("billing.downgrade_capacity_change_compensation_failed", compensationError, {
          companyId,
          capacityChangeId: capacityChange.id,
        });
      }

      throw error;
    }

    let providerState: ProviderSubscription;

    try {
      providerState = await provider.updateSubscriptionAmount(
        providerSubscription.provider_subscription_id,
        preparation.requestedQuote.monthlyTotalCop,
      );
    } catch (error) {
      await Promise.allSettled([
        this.repository.cancelScheduledCapacityChange(capacityChange.id, companyId),
        this.repository.markIntentFailed(
          intent.id,
          "provider_subscription_update_failed",
          error instanceof Error ? error.message : "Mercado Pago no pudo programar el nuevo valor mensual.",
        ),
      ]);
      throw error;
    }

    if (
      providerState.providerSubscriptionId !== providerSubscription.provider_subscription_id ||
      providerState.currency !== "COP" ||
      providerState.recurringAmountCop !== preparation.requestedQuote.monthlyTotalCop
    ) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        "Mercado Pago respondió sin confirmar el valor mensual esperado para el downgrade.",
        "downgrade_provider_state_mismatch",
      );
      throw new Error("Mercado Pago no confirmó el valor mensual del downgrade.");
    }

    try {
      await this.repository.completeScheduledDowngrade({
        intent,
        providerSubscription,
        providerState,
      });
    } catch (error) {
      await this.repository.markIntentCompensationRequired(
        intent.id,
        error instanceof Error ? error.message : "El proveedor fue actualizado, pero Quimly no pudo completar el downgrade.",
        "downgrade_internal_persistence_failed",
      );
      throw error;
    }

    return { intent, capacityChange };
  }

  private async closeExpiredActivationAttempt(
    companyId: string,
    provider: BillingProvider,
    now: Date,
  ) {
    const openIntent = await this.repository.findOpenIntent(companyId);

    if (
      !openIntent ||
      !isSubscriptionCheckoutIntent(openIntent.intent_type) ||
      !openIntent.expires_at ||
      new Date(openIntent.expires_at).getTime() > now.getTime()
    ) {
      return;
    }

    const providerSubscription = await this.repository.findProviderSubscriptionForIntent(openIntent.id);

    if (!providerSubscription) {
      return;
    }

    const closureClaimed = await this.repository.claimActivationAttemptClosure(
      openIntent.id,
      "checkout_expired",
    );

    if (!closureClaimed) {
      return;
    }

    const currentProviderState = await provider.getSubscription(
      providerSubscription.provider_subscription_id,
    );
    const terminalProviderState = isCanceledProviderStatus(currentProviderState.providerStatus)
      ? currentProviderState
      : await provider.updateSubscriptionStatus(providerSubscription.provider_subscription_id, "canceled");

    if (!isCanceledProviderStatus(terminalProviderState.providerStatus)) {
      throw new Error("Mercado Pago no confirmó la cancelación del checkout de activación vencido.");
    }

    await this.repository.closeActivationAttempt({
      intent: openIntent,
      providerSubscription,
      providerStatus: terminalProviderState.providerStatus,
      providerUpdatedAt: terminalProviderState.providerUpdatedAt,
      intentStatus: "expired",
      errorCode: "activation_checkout_expired_and_cancelled",
      errorMessage: "El checkout venció y el preapproval fue cancelado en Mercado Pago.",
    });
  }

  private async ensureNoOpenIntent(companyId: string) {
    const openIntent = await this.getPendingOperation(companyId);

    if (openIntent) {
      throw new BillingOperationPendingError(openIntent);
    }
  }

  private buildAccountSnapshot(context: CompanyBillingContext): BillingAccountSnapshot {
    const subscriptionStatus = normalizeSubscriptionStatus(context.subscription.status);
    const planType = getEffectivePlanType(context.subscription);
    const subscriptionViewState = getSubscriptionViewState({
      status: subscriptionStatus,
      planType,
      trialEndsAt: context.subscription.trial_ends_at,
    });
    const accountCapabilities = getAccountCapabilities({
      subscriptionViewState,
      maxActiveLocations: context.subscription.max_active_locations,
      activeBranches: context.activeBranches,
    });
    const price = createEffectivePriceSnapshot(context.subscription);

    return {
      subscription: {
        ...context.subscription,
        status: subscriptionStatus,
        plan_type: planType,
        base_monthly_price_cop: price.baseMonthlyPriceCop,
      },
      subscriptionViewState,
      accountCapabilities,
      activeBranches: context.activeBranches,
      currentQuote: quoteCapacity({
        price,
        maxActiveLocations: context.subscription.max_active_locations,
      }),
    };
  }

  private quoteCapacity(subscription: CompanySubscriptionBillingRecord, maxActiveLocations: number) {
    return quoteCapacity({
      price: createEffectivePriceSnapshot(subscription),
      maxActiveLocations,
    });
  }
}

export function createBillingService(repository?: BillingRepository) {
  return new BillingService(repository);
}
