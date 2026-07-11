import { createHmac, randomUUID } from "node:crypto";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getSupabaseConfiguration() {
  return {
    url: requireEnvironment("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
    serviceRoleKey: requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function querySupabase(table, parameters) {
  const { url, serviceRoleKey } = getSupabaseConfiguration();
  const endpoint = new URL(`/rest/v1/${table}`, url);

  for (const [name, value] of Object.entries(parameters)) {
    endpoint.searchParams.set(name, value);
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Supabase no pudo consultar ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function createWebhookSignature({ dataId, requestId }) {
  const secret = requireEnvironment("MERCADO_PAGO_WEBHOOK_SECRET");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const hash = createHmac("sha256", secret).update(manifest).digest("hex");

  return `ts=${timestamp},v1=${hash}`;
}

async function sendPaymentWebhook({ paymentId, notificationId }) {
  const appUrl = requireEnvironment("NEXT_PUBLIC_APP_URL");
  const requestId = randomUUID();
  const endpoint = new URL("/api/webhooks/mercado-pago", appUrl);
  endpoint.searchParams.set("data.id", paymentId);

  const payload = {
    id: notificationId,
    live_mode: false,
    type: "payment",
    date_created: new Date().toISOString(),
    action: "payment.updated",
    data: { id: paymentId },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": createWebhookSignature({ dataId: paymentId, requestId }),
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

async function inspectActivation(companyId, expectedResult) {
  assert(expectedResult === "approved" || expectedResult === "rejected", "El resultado esperado debe ser approved o rejected.");

  const [subscription] = await querySupabase("company_subscriptions", {
    company_id: `eq.${companyId}`,
    select: "id,status,plan_type,max_active_locations,payment_method_status",
  });
  const [intent] = await querySupabase("billing_intents", {
    company_id: `eq.${companyId}`,
    intent_type: "eq.activation",
    select: "id,status,external_reference,expected_immediate_amount_cop,completed_at,created_at",
    order: "created_at.desc",
    limit: "1",
  });

  assert(subscription, "No se encontró company_subscriptions para la empresa.");
  assert(intent, "No se encontró una intención de activación para la empresa.");

  const [payment] = await querySupabase("billing_payments", {
    billing_intent_id: `eq.${intent.id}`,
    select: "id,provider_payment_id,provider_status,normalized_status,amount_cop,approved_at",
    order: "created_at.desc",
    limit: "1",
  });

  assert(payment, "No se encontró el pago asociado a la intención.");

  if (expectedResult === "approved") {
    assert(intent.status === "succeeded", `Se esperaba intent succeeded y llegó ${intent.status}.`);
    assert(payment.normalized_status === "approved", `Se esperaba payment approved y llegó ${payment.normalized_status}.`);
    assert(subscription.status === "active", `Se esperaba subscription active y llegó ${subscription.status}.`);
  } else {
    assert(payment.normalized_status === "rejected", `Se esperaba payment rejected y llegó ${payment.normalized_status}.`);
    assert(subscription.status === "trial", `Se esperaba subscription trial y llegó ${subscription.status}.`);
  }

  console.log(JSON.stringify({ subscription, intent, payment }, null, 2));
  console.log(`Caso ${expectedResult === "approved" ? "A" : "B"}: OK`);
}

async function verifyDuplicate(paymentId, notificationId) {
  const first = await sendPaymentWebhook({ paymentId, notificationId });
  const second = await sendPaymentWebhook({ paymentId, notificationId });

  assert(first.status === 200, `La primera entrega respondió ${first.status}: ${first.body}`);
  assert(second.status === 200, `La segunda entrega respondió ${second.status}: ${second.body}`);

  const events = await querySupabase("billing_webhook_events", {
    provider: "eq.mercado_pago",
    delivery_key: `eq.notification:${notificationId}`,
    select: "id,processing_status,attempts,last_error",
  });
  const payments = await querySupabase("billing_payments", {
    provider: "eq.mercado_pago",
    provider_payment_id: `eq.${paymentId}`,
    select: "id,provider_payment_id,normalized_status",
  });

  assert(events.length === 1, `Se esperaba 1 webhook y se encontraron ${events.length}.`);
  assert(events[0].processing_status === "processed", `El webhook quedó en ${events[0].processing_status}.`);
  assert(payments.length === 1, `Se esperaba 1 pago y se encontraron ${payments.length}.`);

  console.log(JSON.stringify({ deliveries: [first.status, second.status], event: events[0], payment: payments[0] }, null, 2));
  console.log("Caso C: OK");
}

async function verifyRetryable(missingPaymentId, notificationId) {
  const first = await sendPaymentWebhook({ paymentId: missingPaymentId, notificationId });
  const second = await sendPaymentWebhook({ paymentId: missingPaymentId, notificationId });

  assert(first.status >= 500, `La primera entrega debía solicitar retry y respondió ${first.status}.`);
  assert(second.status >= 500, `La segunda entrega debía solicitar retry y respondió ${second.status}.`);

  const events = await querySupabase("billing_webhook_events", {
    provider: "eq.mercado_pago",
    delivery_key: `eq.notification:${notificationId}`,
    select: "id,processing_status,attempts,last_error",
  });
  const payments = await querySupabase("billing_payments", {
    provider: "eq.mercado_pago",
    provider_payment_id: `eq.${missingPaymentId}`,
    select: "id",
  });

  assert(events.length === 1, `Se esperaba 1 webhook retryable y se encontraron ${events.length}.`);
  assert(events[0].processing_status === "failed", `El webhook retryable quedó en ${events[0].processing_status}.`);
  assert(events[0].attempts === 2, `Se esperaban 2 intentos y se registraron ${events[0].attempts}.`);
  assert(payments.length === 0, "Un recurso inexistente no debe crear billing_payments.");

  console.log(JSON.stringify({ deliveries: [first.status, second.status], event: events[0] }, null, 2));
  console.log("Caso D: OK");
}

function printUsage() {
  console.log(`Uso:
  npm run test:billing:sandbox -- inspect <company-id> approved
  npm run test:billing:sandbox -- inspect <company-id> rejected
  npm run test:billing:sandbox -- duplicate <payment-id> [notification-id]
  npm run test:billing:sandbox -- retryable <payment-id-inexistente> [notification-id]`);
}

const [command, resourceId, argument] = process.argv.slice(2);

try {
  if (command === "inspect" && resourceId && argument) {
    await inspectActivation(resourceId, argument);
  } else if (command === "duplicate" && resourceId) {
    await verifyDuplicate(resourceId, argument ?? `sandbox-duplicate-${randomUUID()}`);
  } else if (command === "retryable" && resourceId) {
    await verifyRetryable(resourceId, argument ?? `sandbox-retryable-${randomUUID()}`);
  } else {
    printUsage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
