import "server-only";

import {
  getAccountCapabilities,
  getSubscriptionViewState,
  normalizePlanType,
  normalizeSubscriptionStatus,
  type AccountCapabilities,
  type PlanType,
  type SubscriptionViewState,
} from "@/lib/billing";
import {
  createBillingPriceSnapshot,
  quoteCapacity,
  quoteUpgradeProration,
  type CapacityPriceQuote,
  type UpgradeProrationQuote,
} from "@/lib/billing/pricing";
import type { ProviderAuthorizedPayment, ProviderPayment, ProviderSubscription } from "@/lib/billing/provider";
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

export type DowngradePreparation = {
  account: BillingAccountSnapshot;
  requestedQuote: CapacityPriceQuote;
  effectiveAt: string;
};

function ensureRequestedCapacity(requestedMaxActiveLocations: number) {
  if (!Number.isInteger(requestedMaxActiveLocations) || requestedMaxActiveLocations < 1) {
    throw new Error("La capacidad solicitada debe ser un número entero mayor o igual a 1.");
  }
}

function getIntentReference(intentType: BillingIntentType) {
  return `qly_${intentType}_${crypto.randomUUID()}`;
}

function getIntentExpiry(now: Date) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function getEffectivePlanType(subscription: CompanySubscriptionBillingRecord): PlanType {
  const planType = normalizePlanType(subscription.plan_type);

  return subscription.status === "cancelled" && planType === "founder" ? "operational" : planType;
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

export class BillingService {
  private readonly repository: BillingRepository;

  constructor(repository = new BillingRepository()) {
    this.repository = repository;
  }

  async getAccountSnapshot(companyId: string): Promise<BillingAccountSnapshot> {
    const context = await this.repository.getCompanyBillingContext(companyId);
    return this.buildAccountSnapshot(context);
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
    const isRecoverable = account.subscriptionViewState === "payment_issue" || account.subscriptionViewState === "cancelled";

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
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    now?: Date;
  }): Promise<BillingIntentRecord> {
    const { intent } = await this.createInitialActivationIntent({
      companyId,
      requestedMaxActiveLocations,
      requestedBy,
      now,
    });

    return intent;
  }

  async createInitialActivationIntent({
    companyId,
    requestedMaxActiveLocations,
    requestedBy,
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    now?: Date;
  }): Promise<InitialActivationIntent> {
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareActivation({ companyId, requestedMaxActiveLocations });

    if (preparation.intentType !== "activation") {
      throw new Error("La recuperación de suscripciones aún no está disponible.");
    }

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
      await this.repository.markIntentAwaitingCustomer(intent.id, checkoutUrl);
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
    invoiceId = null,
  }: {
    payment: ProviderPayment;
    webhookEventId: string;
    invoiceId?: string | null;
  }): Promise<InitialPaymentProcessingResult> {
    if (!payment.externalReference) {
      return { handled: false, reason: "El pago no contiene una referencia interna." };
    }

    const intent = await this.repository.findIntentByExternalReference(payment.externalReference);

    if (!intent || intent.intent_type !== "activation" || !isOpenBillingIntent(intent)) {
      return { handled: false, reason: "El pago no corresponde a una activación inicial." };
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

    const subscriptionStatus = await this.repository.getSubscriptionStatus(
      intent.subscription_id,
      intent.company_id,
    );

    if (subscriptionStatus !== "trial") {
      return {
        handled: false,
        reason: "La suscripción interna ya no admite esta activación inicial.",
      };
    }

    const normalizedStatus = normalizeProviderPaymentStatus(payment.providerStatus);
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
    });

    if (normalizedStatus !== "approved") {
      return {
        handled: true,
        activationApplied: false,
        companyId: intent.company_id,
        subscriptionId: intent.subscription_id,
        providerUpdatedAt: payment.providerUpdatedAt,
      };
    }

    if (intent.expected_immediate_amount_cop !== payment.amountCop) {
      throw new Error("El monto aprobado no coincide con el valor esperado para la activación.");
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
  }: {
    payment: ProviderPayment;
    webhookEventId: string;
  }): Promise<InitialPaymentProcessingResult> {
    if (!payment.externalReference) {
      return { handled: false, reason: "El pago no contiene una referencia interna." };
    }

    const intent = await this.repository.findIntentByExternalReference(payment.externalReference);

    if (intent?.intent_type === "activation" && isOpenBillingIntent(intent)) {
      const subscriptionStatus = await this.repository.getSubscriptionStatus(
        intent.subscription_id,
        intent.company_id,
      );

      if (subscriptionStatus === "trial") {
        return this.processInitialActivationPayment({ payment, webhookEventId });
      }
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
    });

    if (!result.handled) {
      return result;
    }

    return {
      ...result,
      activationApplied: false,
    };
  }

  async processAuthorizedPayment({
    authorizedPayment,
    payment,
    webhookEventId,
  }: {
    authorizedPayment: ProviderAuthorizedPayment;
    payment: ProviderPayment | null;
    webhookEventId: string;
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

    const normalizedPaymentStatus = payment ? normalizeProviderPaymentStatus(payment.providerStatus) : null;
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

    const subscriptionStatus = await this.repository.getSubscriptionStatus(
      providerSubscription.subscription_id,
      providerSubscription.company_id,
    );

    if (subscriptionStatus === "trial") {
      const activationResult = await this.processInitialActivationPayment({
        payment,
        webhookEventId,
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

  private async processRecurringProviderPayment({
    payment,
    providerSubscription,
    webhookEventId,
    invoiceId,
    debitAt,
  }: {
    payment: ProviderPayment;
    providerSubscription: BillingProviderSubscriptionRecord;
    webhookEventId: string;
    invoiceId: string | null;
    debitAt: string | null;
  }): Promise<BillingWebhookProcessingResult> {
    if (payment.currency !== "COP") {
      throw new Error("El pago recurrente no está en COP.");
    }

    if (payment.amountCop !== providerSubscription.recurring_amount_cop) {
      throw new Error("El monto del pago recurrente no coincide con el valor de la suscripción.");
    }

    const normalizedStatus = normalizeProviderPaymentStatus(payment.providerStatus);
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
    });
    const periodStartedAt = payment.approvedAt ?? payment.providerUpdatedAt ?? debitAt ?? new Date().toISOString();

    await this.repository.applyRecurringPaymentState({
      providerSubscription,
      payment: storedPayment,
      normalizedStatus,
      webhookEventId,
      periodStartedAt,
      periodEndsAt: getPeriodEnd(periodStartedAt, providerSubscription.next_payment_at),
    });

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

    return {
      account,
      requestedQuote,
      proration: quoteUpgradeProration({
        currentQuote: account.currentQuote,
        requestedQuote,
        periodStartedAt,
        periodEndsAt,
        now,
      }),
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
  }): Promise<BillingIntentRecord> {
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareUpgrade({ companyId, requestedMaxActiveLocations, now });
    const { subscription } = preparation.account;

    return this.repository.createIntent({
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
    now = new Date(),
  }: {
    companyId: string;
    requestedMaxActiveLocations: number;
    requestedBy: string | null;
    now?: Date;
  }): Promise<{
    intent: BillingIntentRecord;
    capacityChange: SubscriptionCapacityChangeRecord;
  }> {
    await this.ensureNoOpenIntent(companyId);

    const preparation = await this.prepareDowngrade({ companyId, requestedMaxActiveLocations });
    const { subscription } = preparation.account;
    const capacityChange = await this.repository.createScheduledCapacityChange({
      companyId,
      subscriptionId: subscription.id,
      currentMaxActiveLocations: subscription.max_active_locations,
      requestedMaxActiveLocations: preparation.requestedQuote.maxActiveLocations,
      effectiveAt: preparation.effectiveAt,
      requestedBy,
    });

    try {
      const intent = await this.repository.createIntent({
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

      return { intent, capacityChange };
    } catch (error) {
      try {
        await this.repository.deleteScheduledCapacityChange(capacityChange.id, companyId);
      } catch (compensationError) {
        logServerError("billing.downgrade_capacity_change_compensation_failed", compensationError, {
          companyId,
          capacityChangeId: capacityChange.id,
        });
      }

      throw error;
    }
  }

  private async ensureNoOpenIntent(companyId: string) {
    const openIntent = await this.repository.findOpenIntent(companyId);

    if (openIntent) {
      throw new Error("Ya existe una operación de billing pendiente para esta empresa.");
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
    const price = createBillingPriceSnapshot({
      planType,
      baseMonthlyPriceCop: context.subscription.base_monthly_price_cop,
      additionalSiteMonthlyPriceCop: context.subscription.additional_site_monthly_price_cop,
      includedActiveSites: context.subscription.included_active_sites,
    });

    return {
      subscription: {
        ...context.subscription,
        status: subscriptionStatus,
        plan_type: planType,
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
      price: createBillingPriceSnapshot({
        planType: getEffectivePlanType(subscription),
        baseMonthlyPriceCop: subscription.base_monthly_price_cop,
        additionalSiteMonthlyPriceCop: subscription.additional_site_monthly_price_cop,
        includedActiveSites: subscription.included_active_sites,
      }),
      maxActiveLocations,
    });
  }
}

export function createBillingService(repository?: BillingRepository) {
  return new BillingService(repository);
}
