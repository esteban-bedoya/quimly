import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  BillingProvider,
  ProviderPayment,
  ProviderSubscriptionCheckout,
  ProviderSubscriptionCheckoutRequest,
} from "@/lib/billing/provider";

const mercadoPagoApiUrl = "https://api.mercadopago.com";

type MercadoPagoPreapprovalResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
  payer_id?: number | string;
  payer_email?: string;
  collector_id?: number | string;
  version?: number;
  date_last_updated?: string;
  last_modified?: string;
  next_payment_date?: string;
};

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  preapproval_id?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_type_id?: string;
  date_created?: string;
  date_last_updated?: string;
  date_approved?: string;
  live_mode?: boolean;
};

type MercadoPagoApiError = {
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

export type MercadoPagoWebhookVerification = {
  valid: boolean;
  timestamp: number | null;
  error: string | null;
};

function getMercadoPagoAccessToken() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error("Falta configurar MERCADO_PAGO_ACCESS_TOKEN en el servidor.");
  }

  return accessToken;
}

function getMercadoPagoEnvironment() {
  const environment = process.env.MERCADO_PAGO_ENVIRONMENT?.trim().toLowerCase() || "sandbox";

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("MERCADO_PAGO_ENVIRONMENT debe ser sandbox o production.");
  }

  return environment;
}

function getPayerEmailForEnvironment({
  environment,
  payerEmail,
}: {
  environment: ReturnType<typeof getMercadoPagoEnvironment>;
  payerEmail: string;
}) {
  if (environment === "production") {
    return payerEmail;
  }

  const sandboxPayerEmail = process.env.MERCADO_PAGO_SANDBOX_PAYER_EMAIL?.trim();

  if (!sandboxPayerEmail) {
    throw new Error("Falta configurar MERCADO_PAGO_SANDBOX_PAYER_EMAIL para probar Mercado Pago Sandbox.");
  }

  return sandboxPayerEmail;
}

function getJsonErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const error = value as MercadoPagoApiError;
  return error.cause?.find((cause) => cause.description)?.description ?? error.message ?? error.error ?? null;
}

async function requestMercadoPago<T>(path: string, init: RequestInit) {
  const response = await fetch(`${mercadoPagoApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as T | MercadoPagoApiError | null;

  if (!response.ok) {
    throw new Error(getJsonErrorMessage(payload) ?? "Mercado Pago no pudo procesar la solicitud.");
  }

  if (!payload) {
    throw new Error("Mercado Pago devolvió una respuesta vacía.");
  }

  return payload as T;
}

function getRequiredString(value: string | number | undefined, fieldName: string) {
  const normalized = typeof value === "number" ? String(value) : value?.trim();

  if (!normalized) {
    throw new Error(`Mercado Pago no devolvió ${fieldName}.`);
  }

  return normalized;
}

function toIsoDate(value: string | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return null;
  }

  return new Date(value).toISOString();
}

function buildWebhookManifest({
  dataId,
  requestId,
  timestamp,
}: {
  dataId: string | null;
  requestId: string | null;
  timestamp: string;
}) {
  return [
    dataId ? `id:${dataId.toLowerCase()};` : "",
    requestId ? `request-id:${requestId};` : "",
    `ts:${timestamp};`,
  ].join("");
}

function parseSignature(signature: string | null) {
  if (!signature) {
    return null;
  }

  const parts = signature.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3) ?? null;
  const hash = parts.find((part) => part.startsWith("v1="))?.slice(3) ?? null;

  if (!timestamp || !hash || !/^\d+$/.test(timestamp) || !/^[a-f0-9]+$/i.test(hash)) {
    return null;
  }

  return { timestamp, hash };
}

export function verifyMercadoPagoWebhookSignature({
  signature,
  requestId,
  dataId,
}: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}): MercadoPagoWebhookVerification {
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const parsedSignature = parseSignature(signature);

  if (!webhookSecret) {
    return { valid: false, timestamp: null, error: "Webhook secret no configurado." };
  }

  if (!parsedSignature) {
    return { valid: false, timestamp: null, error: "Firma de webhook inválida o ausente." };
  }

  const manifest = buildWebhookManifest({
    dataId,
    requestId,
    timestamp: parsedSignature.timestamp,
  });
  const expectedHash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
  const actualHash = parsedSignature.hash.toLowerCase();
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const valid =
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);

  return {
    valid,
    timestamp: Number(parsedSignature.timestamp),
    error: valid ? null : "La firma del webhook no coincide.",
  };
}

export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = "mercado_pago" as const;

  async createSubscriptionCheckout(
    request: ProviderSubscriptionCheckoutRequest,
  ): Promise<ProviderSubscriptionCheckout> {
    if (!request.payerEmail) {
      throw new Error("Debes configurar un correo electrónico antes de activar tu plan.");
    }

    const environment = getMercadoPagoEnvironment();
    const payerEmail = getPayerEmailForEnvironment({
      environment,
      payerEmail: request.payerEmail,
    });
    const response = await requestMercadoPago<MercadoPagoPreapprovalResponse>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: `Quimly ${request.price.maxActiveLocations} sede${request.price.maxActiveLocations === 1 ? "" : "s"}`,
        external_reference: request.externalReference,
        payer_email: payerEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: request.price.monthlyTotalCop,
          currency_id: "COP",
        },
        back_url: request.returnUrl,
        status: "pending",
      }),
    });
    const checkoutUrl = environment === "sandbox" ? response.sandbox_init_point ?? response.init_point : response.init_point;

    return {
      providerSubscriptionId: getRequiredString(response.id, "el identificador de suscripción"),
      checkoutUrl: getRequiredString(checkoutUrl, "la URL de checkout"),
      providerStatus: response.status?.trim() || "pending",
      // Mercado Pago devuelve collector_id para la cuenta de Quimly, no para el cliente pagador.
      providerCustomerId: null,
      providerPayerId: response.payer_id === undefined ? null : String(response.payer_id),
      payerEmail: response.payer_email || payerEmail,
      providerVersion: typeof response.version === "number" ? response.version : null,
      providerUpdatedAt: toIsoDate(response.last_modified ?? response.date_last_updated),
      nextPaymentAt: toIsoDate(response.next_payment_date),
    };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const response = await requestMercadoPago<MercadoPagoPaymentResponse>(
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      { method: "GET" },
    );
    const amountCop = response.transaction_amount;

    if (typeof amountCop !== "number" || !Number.isInteger(amountCop) || amountCop < 0) {
      throw new Error("Mercado Pago devolvió un monto de pago inválido.");
    }

    return {
      providerPaymentId: getRequiredString(response.id, "el identificador de pago"),
      providerStatus: response.status?.trim() || "unknown",
      providerStatusDetail: response.status_detail ?? null,
      externalReference: response.external_reference ?? null,
      providerSubscriptionId: response.preapproval_id ?? null,
      amountCop,
      currency: response.currency_id?.trim() || "",
      paymentMethodType: response.payment_type_id ?? null,
      providerCreatedAt: toIsoDate(response.date_created),
      providerUpdatedAt: toIsoDate(response.date_last_updated),
      approvedAt: toIsoDate(response.date_approved),
      liveMode: typeof response.live_mode === "boolean" ? response.live_mode : null,
    };
  }
}

export function createMercadoPagoBillingProvider() {
  return new MercadoPagoBillingProvider();
}
