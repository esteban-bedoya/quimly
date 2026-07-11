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
};

export type BillingPaymentRecord = {
  id: string;
  company_id: string;
  billing_intent_id: string | null;
  provider_payment_id: string;
  provider_status: string;
  normalized_status: BillingPaymentStatus;
  amount_cop: number;
  currency: "COP";
  approved_at: string | null;
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
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at")
      .single<BillingProviderSubscriptionRecord>();

    if (error || !data) {
      throwDatabaseError(
        error ?? { message: "No fue posible guardar la suscripción externa." },
        "No fue posible guardar la suscripción externa.",
      );
    }

    return data;
  }

  async markIntentAwaitingCustomer(intentId: string, checkoutUrl: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "awaiting_customer",
        provider_checkout_url: checkoutUrl,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", intentId)
      .eq("status", "created");

    if (error) {
      throwDatabaseError(error, "No fue posible dejar lista la intención de pago.");
    }
  }

  async markIntentFailed(intentId: string, errorCode: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "failed",
        last_error_code: errorCode,
        last_error_message: errorMessage,
      })
      .eq("id", intentId)
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"]);

    if (error) {
      throwDatabaseError(error, "No fue posible registrar el error de la intención de pago.");
    }
  }

  async markIntentCompensationRequired(intentId: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("billing_intents")
      .update({
        status: "compensation_required",
        last_error_code: "provider_subscription_persistence_failed",
        last_error_message: errorMessage,
      })
      .eq("id", intentId)
      .eq("status", "created");

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
      .select("id, company_id, subscription_id, billing_intent_id, provider, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, currency, next_payment_at")
      .eq("billing_intent_id", intentId)
      .eq("provider", "mercado_pago")
      .maybeSingle<BillingProviderSubscriptionRecord>();

    if (error) {
      throwDatabaseError(error, "No fue posible encontrar la suscripción externa.");
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

  async upsertPayment({
    intent,
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
  }: {
    intent: BillingIntentRecord;
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
  }): Promise<BillingPaymentRecord> {
    const { data, error } = await this.supabase
      .from("billing_payments")
      .upsert(
        {
          company_id: intent.company_id,
          provider_subscription_record_id: providerSubscription.id,
          billing_intent_id: intent.id,
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
        },
        { onConflict: "provider,provider_payment_id" },
      )
      .select("id, company_id, billing_intent_id, provider_payment_id, provider_status, normalized_status, amount_cop, currency, approved_at")
      .single<BillingPaymentRecord>();

    if (error || !data) {
      throwDatabaseError(error ?? { message: "No fue posible registrar el pago." }, "No fue posible registrar el pago.");
    }

    return data;
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
    if (intent.requested_max_active_locations === null) {
      throw new Error("La intención de activación no tiene capacidad solicitada.");
    }

    const { data: currentSubscription, error: currentSubscriptionError } = await this.supabase
      .from("company_subscriptions")
      .select("status")
      .eq("id", intent.subscription_id)
      .eq("company_id", intent.company_id)
      .maybeSingle<{ status: SubscriptionStatus }>();

    if (currentSubscriptionError || !currentSubscription) {
      throwDatabaseError(
        currentSubscriptionError ?? { message: "No fue posible encontrar la suscripción interna." },
        "No fue posible encontrar la suscripción interna.",
      );
    }

    if (currentSubscription.status !== "trial" && currentSubscription.status !== "active") {
      throw new Error("La suscripción interna ya no admite esta activación inicial.");
    }

    if (currentSubscription.status === "trial") {
      const { data: activatedSubscription, error: subscriptionError } = await this.supabase
        .from("company_subscriptions")
        .update({
          status: "active",
          plan_type: intent.plan_type_snapshot,
          max_active_locations: intent.requested_max_active_locations,
          payment_method_status: "configured",
          current_period_started_at: periodStartedAt,
          current_period_ends_at: periodEndsAt,
          billing_cycle_anchor_at: periodStartedAt,
          payment_attention_required: false,
          payment_grace_ends_at: null,
          last_successful_payment_at: payment.approved_at ?? periodStartedAt,
        })
        .eq("id", intent.subscription_id)
        .eq("company_id", intent.company_id)
        .eq("status", "trial")
        .select("id")
        .maybeSingle<{ id: string }>();

      if (subscriptionError) {
        throwDatabaseError(subscriptionError, "No fue posible activar la suscripción interna.");
      }

      if (!activatedSubscription) {
        const latestStatus = await this.getSubscriptionStatus(intent.subscription_id, intent.company_id);

        if (latestStatus !== "active") {
          throw new Error("La suscripción interna cambió de estado antes de completar la activación.");
        }
      }
    }

    const { error: intentError } = await this.supabase
      .from("billing_intents")
      .update({
        status: "succeeded",
        completed_at: payment.approved_at ?? new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", intent.id);

    if (intentError) {
      throwDatabaseError(intentError, "No fue posible completar la intención de pago.");
    }

    const { error: historyError } = await this.supabase.from("subscription_status_history").upsert(
      {
        company_id: intent.company_id,
        subscription_id: intent.subscription_id,
        from_status: "trial",
        to_status: "active",
        reason: "initial_subscription_payment_approved",
        source: "webhook",
        billing_intent_id: intent.id,
        billing_payment_id: payment.id,
        webhook_event_id: webhookEventId,
        deduplication_key: `mercado_pago_payment_approved:${payment.provider_payment_id}`,
        metadata: {
          provider: "mercado_pago",
          providerPaymentId: payment.provider_payment_id,
        },
        occurred_at: payment.approved_at ?? new Date().toISOString(),
      },
      { onConflict: "deduplication_key", ignoreDuplicates: true },
    );

    if (historyError) {
      throwDatabaseError(historyError, "No fue posible registrar el historial de la suscripción.");
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

  async deleteScheduledCapacityChange(changeId: string, companyId: string) {
    const { error } = await this.supabase
      .from("subscription_capacity_changes")
      .delete()
      .eq("id", changeId)
      .eq("company_id", companyId)
      .eq("status", "scheduled");

    if (error) {
      throwDatabaseError(error, "No fue posible revertir el cambio de capacidad programado.");
    }
  }
}
