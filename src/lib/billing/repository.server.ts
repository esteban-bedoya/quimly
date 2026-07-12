import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CapacityChangeStatus,
  CapacityChangeType,
  PlanType,
  SubscriptionStatus,
} from "@/lib/billing";
import { getMissingSupabaseAdminConfigKeys } from "@/lib/supabase/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type CompanySubscriptionBillingRecord = {
  id: string;
  company_id: string;
  status: SubscriptionStatus;
  plan_type: PlanType;
  trial_started_at: string;
  trial_ends_at: string;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  billing_cycle_anchor_at: string | null;
  base_monthly_price_cop: number;
  additional_site_monthly_price_cop: number;
  included_active_sites: number;
  max_active_locations: number;
  payment_attention_required: boolean;
  payment_grace_ends_at: string | null;
};

export type BillingIntentRecord = {
  id: string;
  company_id: string;
  subscription_id: string;
  capacity_change_id: string | null;
  intent_type: BillingIntentType;
  status: BillingIntentStatus;
  plan_type_snapshot: PlanType;
  previous_max_active_locations: number | null;
  requested_max_active_locations: number | null;
  monthly_amount_before_cop: number | null;
  monthly_amount_after_cop: number | null;
  expected_immediate_amount_cop: number | null;
  currency: "COP";
  period_started_at: string | null;
  period_ends_at: string | null;
  proration_amount_cop: number | null;
  proration_calculated_at: string | null;
  proration_formula_version: number | null;
  external_reference: string;
  provider_checkout_url: string | null;
  requested_by: string | null;
  expires_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingIntentType =
  | "activation"
  | "upgrade"
  | "downgrade"
  | "payment_method_update"
  | "recovery"
  | "cancellation";

export type BillingIntentStatus =
  | "created"
  | "awaiting_customer"
  | "awaiting_payment"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "compensation_required";

export type BillingPaymentStatus =
  | "unknown"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

export type BillingInvoiceStatus =
  | "unknown"
  | "scheduled"
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled";

export type BillingWebhookProcessingStatus = "received" | "processing" | "processed" | "failed" | "ignored";

export type BillingProviderSubscriptionRecord = {
  id: string;
  company_id: string;
  subscription_id: string;
  billing_intent_id: string | null;
  provider: "mercado_pago";
  provider_subscription_id: string;
  external_reference: string;
  provider_status: string;
  recurring_amount_cop: number;
  currency: "COP";
  next_payment_at: string | null;
  ended_at: string | null;
};

export type BillingPaymentRecord = {
  id: string;
  company_id: string;
  billing_intent_id: string | null;
  invoice_id: string | null;
  provider_payment_id: string;
  provider_status: string;
  normalized_status: BillingPaymentStatus;
  amount_cop: number;
  currency: "COP";
  approved_at: string | null;
  refunded_amount_cop: number;
};

export type BillingPaymentReversalContext = {
  payment: BillingPaymentRecord;
  intent: BillingIntentRecord | null;
  providerSubscription: BillingProviderSubscriptionRecord;
  subscription: CompanySubscriptionBillingRecord & {
    last_successful_payment_at: string | null;
  };
  scheduledCapacityChange: SubscriptionCapacityChangeRecord | null;
};

export type BillingInvoiceRecord = {
  id: string;
  company_id: string;
  provider_subscription_record_id: string;
  provider_invoice_id: string;
  provider_status: string;
  normalized_status: BillingInvoiceStatus;
  amount_cop: number;
  currency: "COP";
  debit_at: string | null;
  period_started_at: string | null;
  period_ends_at: string | null;
  retry_attempt: number;
  provider_updated_at: string | null;
  settled_at: string | null;
};

export type BillingWebhookEventRecord = {
  id: string;
  provider: "mercado_pago";
  delivery_key: string;
  processing_status: BillingWebhookProcessingStatus;
  attempts: number;
};

export type SubscriptionCapacityChangeRecord = {
  id: string;
  company_id: string;
  subscription_id: string;
  current_max_active_locations: number;
  requested_max_active_locations: number;
  change_type: CapacityChangeType;
  status: CapacityChangeStatus;
  effective_at: string;
  requested_by: string | null;
  created_at: string;
};

export type CompanyBillingContext = {
  subscription: CompanySubscriptionBillingRecord;
  activeBranches: number;
};

export type CreateBillingIntentInput = Omit<
  BillingIntentRecord,
  "id" | "status" | "provider_checkout_url" | "completed_at" | "created_at" | "updated_at"
> & {
  status?: BillingIntentStatus;
};

function throwDatabaseError(error: { message: string }, fallback: string): never {
  throw new Error(error.message || fallback);
}

function getAdminClientOrThrow(supabaseClient?: SupabaseClient) {
  const supabase = supabaseClient ?? getSupabaseAdminClient();

  if (!supabase) {
    const missingConfigKeys = getMissingSupabaseAdminConfigKeys();
    throw new Error(`Billing requiere configuración de Supabase Admin: ${missingConfigKeys.join(", ")}.`);
  }

  return supabase;
}

export class BillingRepository {
  private readonly supabase: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = getAdminClientOrThrow(supabaseClient);
  }

  async getCompanyBillingContext(companyId: string): Promise<CompanyBillingContext> {
    const [{ count, error: activeBranchesError }, { data: subscription, error: subscriptionError }] = await Promise.all([
      this.supabase
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "active"),
      this.supabase
        .from("company_subscriptions")
        .select(
          "id, company_id, status, plan_type, trial_started_at, trial_ends_at, current_period_started_at, current_period_ends_at, billing_cycle_anchor_at, base_monthly_price_cop, additional_site_monthly_price_cop, included_active_sites, max_active_locations, payment_attention_required, payment_grace_ends_at",
        )
        .eq("company_id", companyId)
        .maybeSingle<CompanySubscriptionBillingRecord>(),
    ]);

    if (activeBranchesError) {
      throwDatabaseError(activeBranchesError, "No fue posible consultar las sedes activas.");
    }

    if (subscriptionError) {
      throwDatabaseError(subscriptionError, "No fue posible consultar la suscripción de la empresa.");
    }

    if (!subscription) {
      throw new Error("La empresa no tiene una suscripción interna configurada.");
    }

    return {
      subscription,
      activeBranches: count ?? 0,
    };
  }

  async findOpenIntent(companyId: string): Promise<BillingIntentRecord | null> {
    const { data, error } = await this.supabase
      .from("billing_intents")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BillingIntentRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible consultar las intenciones de billing.");
    }

    return data;
  }

  async expireStaleOpenIntents(companyId: string) {
    const { error } = await this.supabase.rpc("expire_stale_billing_intents", {
      target_company_id: companyId,
    });

    if (error) {
      throwDatabaseError(error, "No fue posible cerrar las operaciones de billing vencidas.");
    }
  }

  async createIntent(input: CreateBillingIntentInput): Promise<BillingIntentRecord> {
    const { data, error } = await this.supabase
      .from("billing_intents")
      .insert({
        ...input,
        status: input.status ?? "created",
      })
      .select("*")
      .single<BillingIntentRecord>();

    if (error || !data) {
      throwDatabaseError(error ?? { message: "No fue posible crear la intención de billing." }, "No fue posible crear la intención de billing.");
    }

    return data;
  }

  async createProviderSubscription({
    intent,
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
    providerSubscriptionId: string;
    providerStatus: string;
    providerCustomerId: string | null;
    providerPayerId: string | null;
    payerEmail: string | null;
    providerVersion: number | null;
    providerUpdatedAt: string | null;
    nextPaymentAt: string | null;
  }): Promise<BillingProviderSubscriptionRecord> {
    if (intent.requested_max_active_locations === null || intent.monthly_amount_after_cop === null) {
      throw new Error("La intención de activación no contiene la capacidad ni el valor mensual requeridos.");
    }

    const { data, error } = await this.supabase
      .from("billing_provider_subscriptions")
      .insert({
        company_id: intent.company_id,
        subscription_id: intent.subscription_id,
        billing_intent_id: intent.id,
        provider: "mercado_pago",
        provider_subscription_id: providerSubscriptionId,
        external_reference: intent.external_reference,
        provider_customer_id: providerCustomerId,
        provider_payer_id: providerPayerId,
        payer_email: payerEmail,
        provider_status: providerStatus,
        provider_version: providerVersion,
        provider_updated_at: providerUpdatedAt,
        recurring_amount_cop: intent.monthly_amount_after_cop,
        currency: "COP",
        next_payment_at: nextPaymentAt,
      })
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
      .single<BillingProviderSubscriptionRecord>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "No fue posible guardar la suscripción externa." },
        "No fue posible guardar la suscripción externa.",
      );
    }

    return data;
  }

  async markIntentAwaitingCustomer(
    intentId: string,
    checkoutUrl: string,
    expiresAt: string,
    metadata?: Record<string, unknown>,
  ) {
    const update: Record<string, unknown> = {
      status: "awaiting_customer",
      provider_checkout_url: checkoutUrl,
      expires_at: expiresAt,
      last_error_code: null,
      last_error_message: null,
    };

    if (metadata) {
      update.metadata = metadata;
    }

    const { error } = await this.supabase
      .from("billing_intents")
      .update(update)
      .eq("id", intentId)
      .eq("status", "created");

    if (error) {
      throwDatabaseError(error, "No fue posible dejar lista la intención de pago.");
    }
  }

  async markIntentAwaitingPayment(intentId: string, expiresAt: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "awaiting_payment",
        expires_at: expiresAt,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", intentId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment"]);

    if (error) {
      throwDatabaseError(error, "No fue posible registrar el pago pendiente.");
    }
  }

  async markIntentProcessing(intentId: string, expiresAt: string) {
    const { data, error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "processing",
        expires_at: expiresAt,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", intentId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"])
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "La operación de billing venció antes de poder procesarse." },
        "No fue posible procesar la operación de billing.",
      );
    }
  }

  async markIntentCancelled(intentId: string, errorCode: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        last_error_code: errorCode,
        last_error_message: errorMessage,
      })
      .eq("id", intentId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"]);

    if (error) {
      throwDatabaseError(error, "No fue posible cancelar la operación de billing.");
    }
  }

  async markIntentFailed(intentId: string, errorCode: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        last_error_code: errorCode,
        last_error_message: errorMessage,
      })
      .eq("id", intentId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"]);

    if (error) {
      throwDatabaseError(error, "No fue posible registrar el error de la intención de pago.");
    }
  }

  async markIntentCompensationRequired(
    intentId: string,
    errorMessage: string,
    errorCode = "provider_subscription_persistence_failed",
  ) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "compensation_required",
        last_error_code: errorCode,
        last_error_message: errorMessage,
      })
      .eq("id", intentId)
      .neq("status", "succeeded");

    if (error) {
      throwDatabaseError(error, "No fue posible registrar la compensación pendiente de billing.");
    }
  }

  async findIntentByExternalReference(externalReference: string): Promise<BillingIntentRecord | null> {
    const { data, error } = await this.supabase
      .from("billing_intents")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle<BillingIntentRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible encontrar la intención de billing.");
    }

    return data;
  }

  async findProviderSubscriptionForIntent(intentId: string): Promise<BillingProviderSubscriptionRecord | null> {
    const { data, error } = await this.supabase
      .from("billing_provider_subscriptions")
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
      .eq("billing_intent_id", intentId)
      .eq("provider", "mercado_pago")
      .maybeSingle<BillingProviderSubscriptionRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible encontrar la suscripción externa.");
    }

    return data;
  }

  async hasChargeablePaymentForIntent(intentId: string, companyId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("billing_payments")
      .select("id")
      .eq("billing_intent_id", intentId)
      .eq("company_id", companyId)
      .or("approved_at.not.is.null,normalized_status.in.(unknown,pending,approved)")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) {
      throwDatabaseError(error, "No fue posible verificar los pagos de la activación.");
    }

    return Boolean(data);
  }

  async findProviderSubscriptionByProviderId(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscriptionRecord | null> {
    const { data, error } = await this.supabase
      .from("billing_provider_subscriptions")
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
      .eq("provider", "mercado_pago")
      .eq("provider_subscription_id", providerSubscriptionId)
      .maybeSingle<BillingProviderSubscriptionRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible encontrar la suscripción externa.");
    }

    return data;
  }

  async findProviderSubscriptionForSubscription(
    subscriptionId: string,
    companyId: string,
  ): Promise<BillingProviderSubscriptionRecord | null> {
    const { data, error } = await this.supabase
      .from("billing_provider_subscriptions")
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
      .eq("subscription_id", subscriptionId)
      .eq("company_id", companyId)
      .eq("provider", "mercado_pago")
      .is("ended_at", null)
      .maybeSingle<BillingProviderSubscriptionRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible encontrar la suscripción externa activa.");
    }

    return data;
  }

  async updateProviderSubscriptionState({
    providerSubscription,
    providerStatus,
    providerVersion,
    providerUpdatedAt,
    recurringAmountCop,
    nextPaymentAt,
    endedAt,
  }: {
    providerSubscription: BillingProviderSubscriptionRecord;
    providerStatus: string;
    providerVersion: number | null;
    providerUpdatedAt: string | null;
    recurringAmountCop: number;
    nextPaymentAt: string | null;
    endedAt: string | null;
  }): Promise<BillingProviderSubscriptionRecord> {
    const { data, error } = await this.supabase
      .from("billing_provider_subscriptions")
      .update({
        provider_status: providerStatus,
        provider_version: providerVersion,
        provider_updated_at: providerUpdatedAt,
        recurring_amount_cop: recurringAmountCop,
        next_payment_at: nextPaymentAt,
        ended_at: endedAt,
      })
      .eq("id", providerSubscription.id)
      .eq("company_id", providerSubscription.company_id)
      .eq("provider", "mercado_pago")
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
      .single<BillingProviderSubscriptionRecord>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "No fue posible sincronizar la suscripción externa." },
        "No fue posible sincronizar la suscripción externa.",
      );
    }

    return data;
  }

  async getSubscriptionStatus(subscriptionId: string, companyId: string): Promise<SubscriptionStatus> {
    const { data, error } = await this.supabase
      .from("company_subscriptions")
      .select("status")
      .eq("id", subscriptionId)
      .eq("company_id", companyId)
      .maybeSingle<{ status: SubscriptionStatus }>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "No fue posible encontrar la suscripción interna." },
        "No fue posible encontrar la suscripción interna.",
      );
    }

    return data.status;
  }

  async closeActivationAttempt({
    intent,
    providerSubscription,
    providerStatus,
    providerUpdatedAt,
    intentStatus,
    errorCode,
    errorMessage,
  }: {
    intent: BillingIntentRecord;
    providerSubscription: BillingProviderSubscriptionRecord;
    providerStatus: string;
    providerUpdatedAt: string | null;
    intentStatus: "failed" | "cancelled" | "expired";
    errorCode: string;
    errorMessage: string;
  }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("close_billing_activation_attempt", {
      target_intent_id: intent.id,
      target_provider_subscription_record_id: providerSubscription.id,
      target_provider_status: providerStatus,
      target_provider_updated_at: providerUpdatedAt,
      target_intent_status: intentStatus,
      target_error_code: errorCode,
      target_error_message: errorMessage,
    });

    if (error) {
      throwDatabaseError(error, "No fue posible cerrar de forma segura la activación anterior.");
    }

    return data === true;
  }

  async claimActivationAttemptClosure(intentId: string, reason: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("claim_billing_activation_attempt_closure", {
      target_intent_id: intentId,
      target_reason: reason,
    });

    if (error) {
      throwDatabaseError(error, "No fue posible reservar el cierre seguro de la activación.");
    }

    return data === true;
  }

  async getPaymentReversalContext(paymentId: string): Promise<BillingPaymentReversalContext> {
    const { data: payment, error: paymentError } = await this.supabase
      .from("billing_payments")
      .select("id, company_id, billing_intent_id, invoice_id, provider_payment_id, provider_status, normalized_status, amount_cop, currency, approved_at, refunded_amount_cop, provider_subscription_record_id")
      .eq("id", paymentId)
      .single<BillingPaymentRecord & { provider_subscription_record_id: string }>();

    if (paymentError || !payment) {
      throwDatabaseError(paymentError ?? { message: "No fue posible encontrar el pago revertido." }, "No fue posible encontrar el pago revertido.");
    }

    const [intentResult, providerResult, subscriptionResult, capacityChangeResult] = await Promise.all([
      payment.billing_intent_id
        ? this.supabase.from("billing_intents").select("*").eq("id", payment.billing_intent_id).maybeSingle<BillingIntentRecord>()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from("billing_provider_subscriptions")
        .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at, ended_at")
        .eq("id", payment.provider_subscription_record_id)
        .single<BillingProviderSubscriptionRecord>(),
      this.supabase
        .from("company_subscriptions")
        .select("id, company_id, status, plan_type, trial_started_at, trial_ends_at, current_period_started_at, current_period_ends_at, billing_cycle_anchor_at, base_monthly_price_cop, additional_site_monthly_price_cop, included_active_sites, max_active_locations, payment_attention_required, payment_grace_ends_at, last_successful_payment_at")
        .eq("company_id", payment.company_id)
        .single<CompanySubscriptionBillingRecord & { last_successful_payment_at: string | null }>(),
      this.supabase
        .from("subscription_capacity_changes")
        .select("*")
        .eq("company_id", payment.company_id)
        .eq("status", "scheduled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SubscriptionCapacityChangeRecord>(),
    ]);

    if (intentResult.error || providerResult.error || subscriptionResult.error || capacityChangeResult.error) {
      throwDatabaseError(
        intentResult.error ?? providerResult.error ?? subscriptionResult.error ?? capacityChangeResult.error ?? { message: "No fue posible reconstruir el pago revertido." },
        "No fue posible reconstruir el pago revertido.",
      );
    }

    if (!providerResult.data || !subscriptionResult.data) {
      throw new Error("El pago revertido no tiene una suscripción financiera completa.");
    }

    return {
      payment,
      intent: intentResult.data,
      providerSubscription: providerResult.data,
      subscription: subscriptionResult.data,
      scheduledCapacityChange: capacityChangeResult.data,
    };
  }

  async applyPaymentReversal({
    paymentId,
    webhookEventId,
    isCurrentEntitlement,
    nextSubscriptionStatus,
    targetCapacity,
    targetRecurringAmountCop,
    providerState,
    occurredAt,
  }: {
    paymentId: string;
    webhookEventId: string;
    isCurrentEntitlement: boolean;
    nextSubscriptionStatus: SubscriptionStatus | null;
    targetCapacity: number | null;
    targetRecurringAmountCop: number | null;
    providerState: {
      providerStatus: string;
      providerVersion: number | null;
      providerUpdatedAt: string | null;
      nextPaymentAt: string | null;
    } | null;
    occurredAt: string;
  }) {
    const { error } = await this.supabase.rpc("apply_billing_payment_reversal", {
      target_payment_id: paymentId,
      target_webhook_event_id: webhookEventId,
      target_is_current_entitlement: isCurrentEntitlement,
      target_next_subscription_status: nextSubscriptionStatus,
      target_capacity: targetCapacity,
      target_recurring_amount_cop: targetRecurringAmountCop,
      target_provider_status: providerState?.providerStatus ?? null,
      target_provider_version: providerState?.providerVersion ?? null,
      target_provider_updated_at: providerState?.providerUpdatedAt ?? null,
      target_next_payment_at: providerState?.nextPaymentAt ?? null,
      target_occurred_at: occurredAt,
    });

    if (error) {
      throwDatabaseError(error, "No fue posible revertir el acceso financiado por el pago.");
    }
  }

  async recordWebhookEvent({
    topic,
    action,
    resourceId,
    deliveryKey,
    requestId,
    signatureTimestamp,
    signatureValid,
    verificationError,
    liveMode,
    payload,
    providerCreatedAt,
  }: {
    topic: string;
    action: string | null;
    resourceId: string;
    deliveryKey: string;
    requestId: string | null;
    signatureTimestamp: number | null;
    signatureValid: boolean;
    verificationError: string | null;
    liveMode: boolean | null;
    payload: Record<string, unknown>;
    providerCreatedAt: string | null;
  }): Promise<{ event: BillingWebhookEventRecord; isNew: boolean }> {
    const { data, error } = await this.supabase
      .from("billing_webhook_events")
      .insert({
        provider: "mercado_pago",
        topic,
        action,
        resource_id: resourceId,
        delivery_key: deliveryKey,
        request_id: requestId,
        signature_timestamp: signatureTimestamp,
        signature_valid: signatureValid,
        verification_error: verificationError,
        live_mode: liveMode,
        payload,
        provider_created_at: providerCreatedAt,
      })
      .select("id, provider, delivery_key, processing_status, attempts")
      .maybeSingle<BillingWebhookEventRecord>();

    if (!error && data) {
      return { event: data, isNew: true };
    }

    if (error?.code !== "23505") {
      throwDatabaseError(error ?? { message: "No fue posible registrar el webhook." }, "No fue posible registrar el webhook.");
    }

    const { data: existing, error: existingError } = await this.supabase
      .from("billing_webhook_events")
      .select("id, provider, delivery_key, processing_status, attempts")
      .eq("provider", "mercado_pago")
      .eq("delivery_key", deliveryKey)
      .maybeSingle<BillingWebhookEventRecord>();

    if (existingError || !existing) {
      throwDatabaseError(existingError ?? { message: "No fue posible recuperar el webhook existente." }, "No fue posible recuperar el webhook existente.");
    }

    return { event: existing, isNew: false };
  }

  async claimWebhookEvent(event: BillingWebhookEventRecord): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("billing_webhook_events")
      .update({
        processing_status: "processing",
        attempts: event.attempts + 1,
        claimed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", event.id)
      .in("processing_status", ["received", "failed"])
      .eq("attempts", event.attempts)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      throwDatabaseError(error, "No fue posible procesar el webhook.");
    }

    return Boolean(data);
  }

  async markWebhookEventIgnored(eventId: string, reason: string) {
    const { error } = await this.supabase
      .from("billing_webhook_events")
      .update({
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        last_error: reason,
      })
      .eq("id", eventId);

    if (error) {
      throwDatabaseError(error, "No fue posible cerrar el webhook ignorado.");
    }
  }

  async markWebhookEventProcessed({
    eventId,
    companyId,
    subscriptionId,
    canonicalResourceUpdatedAt,
  }: {
    eventId: string;
    companyId: string;
    subscriptionId: string;
    canonicalResourceUpdatedAt: string | null;
  }) {
    const { error } = await this.supabase
      .from("billing_webhook_events")
      .update({
        company_id: companyId,
        subscription_id: subscriptionId,
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        canonical_resource_updated_at: canonicalResourceUpdatedAt,
        last_error: null,
      })
      .eq("id", eventId);

    if (error) {
      throwDatabaseError(error, "No fue posible cerrar el webhook procesado.");
    }
  }

  async markWebhookEventFailed(eventId: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("billing_webhook_events")
      .update({
        processing_status: "failed",
        last_error: errorMessage,
      })
      .eq("id", eventId);

    if (error) {
      throwDatabaseError(error, "No fue posible registrar el error del webhook.");
    }
  }

  async upsertInvoice({
    providerSubscription,
    providerInvoiceId,
    providerStatus,
    normalizedStatus,
    amountCop,
    debitAt,
    retryAttempt,
    providerUpdatedAt,
    settledAt,
    periodStartedAt,
    periodEndsAt,
  }: {
    providerSubscription: BillingProviderSubscriptionRecord;
    providerInvoiceId: string;
    providerStatus: string;
    normalizedStatus: BillingInvoiceStatus;
    amountCop: number;
    debitAt: string | null;
    retryAttempt: number;
    providerUpdatedAt: string | null;
    settledAt: string | null;
    periodStartedAt: string | null;
    periodEndsAt: string | null;
  }): Promise<BillingInvoiceRecord> {
    const { data: existing, error: existingError } = await this.supabase
      .from("billing_invoices")
      .select("id, company_id, provider_subscription_record_id")
      .eq("provider", "mercado_pago")
      .eq("provider_invoice_id", providerInvoiceId)
      .maybeSingle<{ id: string; company_id: string; provider_subscription_record_id: string }>();

    if (existingError) {
      throwDatabaseError(existingError, "No fue posible consultar la factura recurrente.");
    }

    if (
      existing &&
      (existing.company_id !== providerSubscription.company_id ||
        existing.provider_subscription_record_id !== providerSubscription.id)
    ) {
      throw new Error("La factura de Mercado Pago ya pertenece a otra suscripción interna.");
    }

    const { data, error } = await this.supabase
      .from("billing_invoices")
      .upsert(
        {
          company_id: providerSubscription.company_id,
          provider_subscription_record_id: providerSubscription.id,
          provider: "mercado_pago",
          provider_invoice_id: providerInvoiceId,
          provider_status: providerStatus,
          normalized_status: normalizedStatus,
          amount_cop: amountCop,
          currency: "COP",
          debit_at: debitAt,
          period_started_at: periodStartedAt,
          period_ends_at: periodEndsAt,
          retry_attempt: retryAttempt,
          provider_updated_at: providerUpdatedAt,
          settled_at: settledAt,
        },
        { onConflict: "provider,provider_invoice_id" },
      )
      .select("id, company_id, provider_subscription_record_id, provider_invoice_id, provider_status, normalized_status, amount_cop, currency, debit_at, period_started_at, period_ends_at, retry_attempt, provider_updated_at, settled_at")
      .single<BillingInvoiceRecord>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "No fue posible registrar la factura recurrente." },
        "No fue posible registrar la factura recurrente.",
      );
    }

    return data;
  }

  async upsertPayment({
    companyId,
    billingIntentId,
    invoiceId,
    providerSubscription,
    providerPaymentId,
    providerStatus,
    providerStatusDetail,
    normalizedStatus,
    amountCop,
    paymentMethodType,
    providerCreatedAt,
    providerUpdatedAt,
    approvedAt,
    refundedAmountCop,
  }: {
    companyId: string;
    billingIntentId: string | null;
    invoiceId: string | null;
    providerSubscription: BillingProviderSubscriptionRecord;
    providerPaymentId: string;
    providerStatus: string;
    providerStatusDetail: string | null;
    normalizedStatus: BillingPaymentStatus;
    amountCop: number;
    paymentMethodType: string | null;
    providerCreatedAt: string | null;
    providerUpdatedAt: string | null;
    approvedAt: string | null;
    refundedAmountCop: number;
  }): Promise<BillingPaymentRecord> {
    const { data: existing, error: existingError } = await this.supabase
      .from("billing_payments")
      .select("id, company_id, provider_subscription_record_id, billing_intent_id, invoice_id")
      .eq("provider", "mercado_pago")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle<{
        id: string;
        company_id: string;
        provider_subscription_record_id: string;
        billing_intent_id: string | null;
        invoice_id: string | null;
      }>();

    if (existingError) {
      throwDatabaseError(existingError, "No fue posible consultar el pago.");
    }

    if (
      existing &&
      (existing.company_id !== companyId || existing.provider_subscription_record_id !== providerSubscription.id)
    ) {
      throw new Error("El pago de Mercado Pago ya pertenece a otra suscripción interna.");
    }

    const { data, error } = await this.supabase
      .from("billing_payments")
      .upsert(
        {
          company_id: companyId,
          provider_subscription_record_id: providerSubscription.id,
          billing_intent_id: billingIntentId ?? existing?.billing_intent_id ?? null,
          invoice_id: invoiceId ?? existing?.invoice_id ?? null,
          provider: "mercado_pago",
          provider_payment_id: providerPaymentId,
          provider_status: providerStatus,
          provider_status_detail: providerStatusDetail,
          normalized_status: normalizedStatus,
          amount_cop: amountCop,
          currency: "COP",
          payment_method_type: paymentMethodType,
          provider_created_at: providerCreatedAt,
          provider_updated_at: providerUpdatedAt,
          approved_at: approvedAt,
          refunded_amount_cop: refundedAmountCop,
        },
        { onConflict: "provider,provider_payment_id" },
      )
      .select("id, company_id, billing_intent_id, invoice_id, provider_payment_id, provider_status, normalized_status, amount_cop, currency, approved_at, refunded_amount_cop")
      .single<BillingPaymentRecord>();

    if (error || !data) {
      throwDatabaseError(error ?? { message: "No fue posible registrar el pago." }, "No fue posible registrar el pago.");
    }

    return data;
  }

  async applyRecurringPaymentState({
    providerSubscription,
    payment,
    normalizedStatus,
    webhookEventId,
    periodStartedAt,
    periodEndsAt,
  }: {
    providerSubscription: BillingProviderSubscriptionRecord;
    payment: BillingPaymentRecord;
    normalizedStatus: BillingPaymentStatus;
    webhookEventId: string;
    periodStartedAt: string;
    periodEndsAt: string;
  }) {
    const { data: currentSubscription, error: currentSubscriptionError } = await this.supabase
      .from("company_subscriptions")
      .select("status")
      .eq("id", providerSubscription.subscription_id)
      .eq("company_id", providerSubscription.company_id)
      .maybeSingle<{ status: SubscriptionStatus }>();

    if (currentSubscriptionError || !currentSubscription) {
      throwDatabaseError(
        currentSubscriptionError ?? { message: "No fue posible encontrar la suscripción interna." },
        "No fue posible encontrar la suscripción interna.",
      );
    }

    if (currentSubscription.status === "trial" || currentSubscription.status === "cancelled") {
      return;
    }

    const now = payment.approved_at ?? new Date().toISOString();
    let nextStatus: SubscriptionStatus | null = null;
    let update: Record<string, unknown> | null = null;

    if (normalizedStatus === "approved") {
      nextStatus = "active";
      update = {
        status: nextStatus,
        payment_method_status: "configured",
        payment_attention_required: false,
        last_payment_issue_at: null,
        payment_grace_ends_at: null,
        last_successful_payment_at: now,
        current_period_started_at: periodStartedAt,
        current_period_ends_at: periodEndsAt,
      };
    } else if (
      normalizedStatus === "rejected" ||
      normalizedStatus === "cancelled" ||
      normalizedStatus === "charged_back"
    ) {
      nextStatus = "payment_issue";
      update = {
        status: nextStatus,
        payment_attention_required: true,
        last_payment_issue_at: new Date().toISOString(),
      };
    }

    if (!update || !nextStatus) {
      return;
    }

    const { error: subscriptionError } = await this.supabase
      .from("company_subscriptions")
      .update(update)
      .eq("id", providerSubscription.subscription_id)
      .eq("company_id", providerSubscription.company_id)
      .eq("status", currentSubscription.status);

    if (subscriptionError) {
      throwDatabaseError(subscriptionError, "No fue posible actualizar el estado de la renovación.");
    }

    if (currentSubscription.status === nextStatus) {
      return;
    }

    const { error: historyError } = await this.supabase.from("subscription_status_history").upsert(
      {
        company_id: providerSubscription.company_id,
        subscription_id: providerSubscription.subscription_id,
        from_status: currentSubscription.status,
        to_status: nextStatus,
        reason:
          nextStatus === "active" ? "recurring_subscription_payment_approved" : "recurring_subscription_payment_failed",
        source: "webhook",
        billing_payment_id: payment.id,
        webhook_event_id: webhookEventId,
        deduplication_key: `mercado_pago_recurring_payment:${payment.provider_payment_id}:${nextStatus}`,
        metadata: {
          provider: "mercado_pago",
          providerPaymentId: payment.provider_payment_id,
          providerStatus: payment.provider_status,
        },
        occurred_at: now,
      },
      { onConflict: "deduplication_key", ignoreDuplicates: true },
    );

    if (historyError) {
      throwDatabaseError(historyError, "No fue posible registrar el estado de la renovación.");
    }
  }

  async applyProviderSubscriptionState({
    providerSubscription,
    providerStatus,
    providerUpdatedAt,
    webhookEventId,
  }: {
    providerSubscription: BillingProviderSubscriptionRecord;
    providerStatus: string;
    providerUpdatedAt: string | null;
    webhookEventId: string;
  }) {
    const normalizedProviderStatus = providerStatus.trim().toLowerCase();
    const { data: currentSubscription, error: currentSubscriptionError } = await this.supabase
      .from("company_subscriptions")
      .select("status, cancellation_requested_at")
      .eq("id", providerSubscription.subscription_id)
      .eq("company_id", providerSubscription.company_id)
      .maybeSingle<{ status: SubscriptionStatus; cancellation_requested_at: string | null }>();

    if (currentSubscriptionError || !currentSubscription) {
      throwDatabaseError(
        currentSubscriptionError ?? { message: "No fue posible encontrar la suscripción interna." },
        "No fue posible encontrar la suscripción interna.",
      );
    }

    const baseUpdate: Record<string, unknown> = {
      mercado_pago_subscription_id: providerSubscription.provider_subscription_id,
    };
    let nextStatus: SubscriptionStatus | null = null;
    let reason: string | null = null;

    if (normalizedProviderStatus === "authorized") {
      baseUpdate.payment_method_status = "configured";
    } else if (
      normalizedProviderStatus === "paused" &&
      (currentSubscription.status === "active" || currentSubscription.status === "payment_issue")
    ) {
      nextStatus = "payment_issue";
      reason = "provider_subscription_paused";
      baseUpdate.status = nextStatus;
      baseUpdate.payment_attention_required = true;
      baseUpdate.last_payment_issue_at = providerUpdatedAt ?? new Date().toISOString();
    } else if (
      (normalizedProviderStatus === "cancelled" || normalizedProviderStatus === "canceled") &&
      currentSubscription.status !== "trial"
    ) {
      const cancellationAt = providerUpdatedAt ?? new Date().toISOString();
      nextStatus = "cancelled";
      reason = "provider_subscription_cancelled";
      baseUpdate.status = nextStatus;
      baseUpdate.cancellation_requested_at = currentSubscription.cancellation_requested_at ?? cancellationAt;
      baseUpdate.cancellation_effective_at = cancellationAt;
    }

    const { error: subscriptionError } = await this.supabase
      .from("company_subscriptions")
      .update(baseUpdate)
      .eq("id", providerSubscription.subscription_id)
      .eq("company_id", providerSubscription.company_id);

    if (subscriptionError) {
      throwDatabaseError(subscriptionError, "No fue posible sincronizar el estado externo de la suscripción.");
    }

    if (!nextStatus || !reason || currentSubscription.status === nextStatus) {
      return;
    }

    const { error: historyError } = await this.supabase.from("subscription_status_history").upsert(
      {
        company_id: providerSubscription.company_id,
        subscription_id: providerSubscription.subscription_id,
        from_status: currentSubscription.status,
        to_status: nextStatus,
        reason,
        source: "webhook",
        webhook_event_id: webhookEventId,
        deduplication_key: `mercado_pago_preapproval:${providerSubscription.provider_subscription_id}:${nextStatus}`,
        metadata: {
          provider: "mercado_pago",
          providerSubscriptionId: providerSubscription.provider_subscription_id,
          providerStatus,
        },
        occurred_at: providerUpdatedAt ?? new Date().toISOString(),
      },
      { onConflict: "deduplication_key", ignoreDuplicates: true },
    );

    if (historyError) {
      throwDatabaseError(historyError, "No fue posible registrar el estado externo de la suscripción.");
    }
  }

  async activateInitialSubscription({
    intent,
    payment,
    webhookEventId,
    periodStartedAt,
    periodEndsAt,
  }: {
    intent: BillingIntentRecord;
    payment: BillingPaymentRecord;
    webhookEventId: string;
    periodStartedAt: string;
    periodEndsAt: string;
  }) {
    const { error } = await this.supabase.rpc("complete_billing_activation", {
      target_intent_id: intent.id,
      target_payment_id: payment.id,
      target_webhook_event_id: webhookEventId,
      target_period_started_at: periodStartedAt,
      target_period_ends_at: periodEndsAt,
    });

    if (error) {
      throwDatabaseError(error, "No fue posible activar la suscripción de forma transaccional.");
    }
  }

  async completeApprovedUpgrade({
    intent,
    payment,
    providerSubscription,
    providerState,
  }: {
    intent: BillingIntentRecord;
    payment: BillingPaymentRecord;
    providerSubscription: BillingProviderSubscriptionRecord;
    providerState: {
      providerStatus: string;
      providerVersion: number | null;
      providerUpdatedAt: string | null;
      nextPaymentAt: string | null;
    };
  }) {
    const { error } = await this.supabase.rpc("complete_billing_upgrade", {
      target_intent_id: intent.id,
      target_payment_id: payment.id,
      target_provider_subscription_record_id: providerSubscription.id,
      target_provider_status: providerState.providerStatus,
      target_provider_version: providerState.providerVersion,
      target_provider_updated_at: providerState.providerUpdatedAt,
      target_next_payment_at: providerState.nextPaymentAt,
      target_completed_at: payment.approved_at ?? new Date().toISOString(),
    });

    if (error) {
      throwDatabaseError(error, "No fue posible aplicar el aumento de capacidad.");
    }
  }

  async completeScheduledDowngrade({
    intent,
    providerSubscription,
    providerState,
  }: {
    intent: BillingIntentRecord;
    providerSubscription: BillingProviderSubscriptionRecord;
    providerState: {
      providerStatus: string;
      providerVersion: number | null;
      providerUpdatedAt: string | null;
      nextPaymentAt: string | null;
    };
  }) {
    const { error } = await this.supabase.rpc("complete_scheduled_billing_downgrade", {
      target_intent_id: intent.id,
      target_provider_subscription_record_id: providerSubscription.id,
      target_provider_status: providerState.providerStatus,
      target_provider_version: providerState.providerVersion,
      target_provider_updated_at: providerState.providerUpdatedAt,
      target_next_payment_at: providerState.nextPaymentAt,
      target_completed_at: new Date().toISOString(),
    });

    if (error) {
      throwDatabaseError(error, "No fue posible completar la reducción programada.");
    }
  }

  async createScheduledCapacityChange({
    companyId,
    subscriptionId,
    currentMaxActiveLocations,
    requestedMaxActiveLocations,
    effectiveAt,
    requestedBy,
  }: {
    companyId: string;
    subscriptionId: string;
    currentMaxActiveLocations: number;
    requestedMaxActiveLocations: number;
    effectiveAt: string;
    requestedBy: string | null;
  }): Promise<SubscriptionCapacityChangeRecord> {
    const { data, error } = await this.supabase
      .from("subscription_capacity_changes")
      .insert({
        company_id: companyId,
        subscription_id: subscriptionId,
        current_max_active_locations: currentMaxActiveLocations,
        requested_max_active_locations: requestedMaxActiveLocations,
        change_type: "downgrade",
        status: "scheduled",
        effective_at: effectiveAt,
        requested_by: requestedBy,
      })
      .select("*")
      .single<SubscriptionCapacityChangeRecord>();

    if (error || !data) {
      throwDatabaseError(error ?? { message: "No fue posible programar la reducción de capacidad." }, "No fue posible programar la reducción de capacidad.");
    }

    return data;
  }

  async findScheduledCapacityChange(companyId: string): Promise<SubscriptionCapacityChangeRecord | null> {
    const { data, error } = await this.supabase
      .from("subscription_capacity_changes")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "scheduled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionCapacityChangeRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible consultar el cambio de capacidad programado.");
    }

    return data;
  }

  async cancelScheduledCapacityChange(changeId: string, companyId: string) {
    const { error } = await this.supabase
      .from("subscription_capacity_changes")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", changeId)
      .eq("company_id", companyId)
      .eq("status", "scheduled");

    if (error) {
      throwDatabaseError(error, "No fue posible cancelar el cambio de capacidad programado.");
    }
  }
}
