import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createBillingService } from "@/lib/billing/billing-service.server";
import { createMercadoPagoBillingProvider, verifyMercadoPagoWebhookSignature } from "@/lib/billing/providers/mercado-pago.server";
import { BillingRepository } from "@/lib/billing/repository.server";
import { logServerError, logServerInfo } from "@/lib/server/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MercadoPagoWebhookPayload = Record<string, unknown> & {
  id?: string | number;
  type?: string;
  topic?: string;
  action?: string;
  live_mode?: boolean;
  date_created?: string;
  data?: { id?: string | number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOptionalString(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function getOptionalIsoDate(value: unknown) {
  const dateValue = getOptionalString(value);

  if (!dateValue || Number.isNaN(new Date(dateValue).getTime())) {
    return null;
  }

  return new Date(dateValue).toISOString();
}

function getDeliveryKey({
  payload,
  topic,
  action,
  resourceId,
  requestId,
  signature,
  signatureValid,
}: {
  payload: MercadoPagoWebhookPayload;
  topic: string;
  action: string | null;
  resourceId: string;
  requestId: string | null;
  signature: string | null;
  signatureValid: boolean;
}) {
  if (!signatureValid) {
    const invalidFingerprint = createHash("sha256")
      .update([requestId ?? "", signature ?? "", JSON.stringify(payload)].join("|"))
      .digest("hex");

    return `invalid:${invalidFingerprint}`;
  }

  const notificationId = getOptionalString(payload.id);

  if (notificationId) {
    return `notification:${notificationId}`;
  }

  const fingerprint = createHash("sha256")
    .update([topic, action ?? "", resourceId, JSON.stringify(payload)].join("|"))
    .digest("hex");

  return `fallback:${fingerprint}`;
}

function isPaymentNotification(topic: string) {
  return topic === "payment" || topic === "payments";
}

function paymentMatchesEnvironment(liveMode: boolean | null) {
  if (liveMode === null) {
    return false;
  }

  const environment = process.env.MERCADO_PAGO_ENVIRONMENT?.trim().toLowerCase() || "sandbox";
  return environment === "production" ? liveMode : !liveMode;
}

export async function POST(request: Request) {
  let payload: MercadoPagoWebhookPayload;

  try {
    const body = await request.json();
    payload = isRecord(body) ? (body as MercadoPagoWebhookPayload) : {};
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const requestId = request.headers.get("x-request-id");
  const signature = request.headers.get("x-signature");
  const queryDataId = request.url ? new URL(request.url).searchParams.get("data.id") : null;
  const payloadDataId = getOptionalString(payload.data?.id);
  const resourceId = queryDataId ?? payloadDataId ?? `unknown:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  const topic = getOptionalString(payload.type) ?? getOptionalString(payload.topic) ?? "unknown";
  const action = getOptionalString(payload.action);
  const verification = verifyMercadoPagoWebhookSignature({
    signature,
    requestId,
    dataId: queryDataId ?? payloadDataId,
  });
  const deliveryKey = getDeliveryKey({
    payload,
    topic,
    action,
    resourceId,
    requestId,
    signature,
    signatureValid: verification.valid,
  });

  let repository: BillingRepository | null = null;

  try {
    repository = new BillingRepository();
    const recorded = await repository.recordWebhookEvent({
      topic,
      action,
      resourceId,
      deliveryKey,
      requestId,
      signatureTimestamp: verification.timestamp,
      signatureValid: verification.valid,
      verificationError: verification.error,
      liveMode: typeof payload.live_mode === "boolean" ? payload.live_mode : null,
      payload,
      providerCreatedAt: getOptionalIsoDate(payload.date_created),
    });

    if (!verification.valid) {
      if (recorded.isNew) {
        await repository.markWebhookEventIgnored(recorded.event.id, verification.error ?? "Firma de webhook inválida.");
      }

      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const claimed = await repository.claimWebhookEvent(recorded.event);

    if (!claimed) {
      return Response.json({ ok: true });
    }

    if (!isPaymentNotification(topic)) {
      await repository.markWebhookEventIgnored(recorded.event.id, "El evento no corresponde a un pago inicial.");
      return Response.json({ ok: true });
    }

    const provider = createMercadoPagoBillingProvider();
    const payment = await provider.getPayment(resourceId);

    if (!paymentMatchesEnvironment(payment.liveMode)) {
      await repository.markWebhookEventIgnored(
        recorded.event.id,
        "El pago no corresponde al entorno configurado para Mercado Pago.",
      );
      return Response.json({ ok: true });
    }

    const billingService = createBillingService(repository);
    const result = await billingService.processInitialActivationPayment({
      payment,
      webhookEventId: recorded.event.id,
    });

    if (!result.handled) {
      await repository.markWebhookEventIgnored(recorded.event.id, result.reason);
      return Response.json({ ok: true });
    }

    await repository.markWebhookEventProcessed({
      eventId: recorded.event.id,
      companyId: result.companyId,
      subscriptionId: result.subscriptionId,
      canonicalResourceUpdatedAt: result.providerUpdatedAt,
    });
    revalidatePath("/dashboard");
    logServerInfo("billing.mercado_pago.payment_processed", {
      companyId: result.companyId,
      subscriptionId: result.subscriptionId,
      paymentId: payment.providerPaymentId,
      providerStatus: payment.providerStatus,
      activationApplied: result.activationApplied,
    });

    return Response.json({ ok: true });
  } catch (error) {
    logServerError("billing.mercado_pago.webhook_failed", error, {
      topic,
      resourceId,
      deliveryKey,
    });

    if (repository) {
      try {
        const event = await repository.recordWebhookEvent({
          topic,
          action,
          resourceId,
          deliveryKey,
          requestId,
          signatureTimestamp: verification.timestamp,
          signatureValid: verification.valid,
          verificationError: verification.error,
          liveMode: typeof payload.live_mode === "boolean" ? payload.live_mode : null,
          payload,
          providerCreatedAt: getOptionalIsoDate(payload.date_created),
        });
        await repository.markWebhookEventFailed(
          event.event.id,
          error instanceof Error ? error.message : "No fue posible procesar el webhook.",
        );
      } catch (recordError) {
        logServerError("billing.mercado_pago.webhook_failure_persistence_failed", recordError, {
          deliveryKey,
        });
      }
    }

    return Response.json({ error: "Unable to process webhook." }, { status: 500 });
  }
}
