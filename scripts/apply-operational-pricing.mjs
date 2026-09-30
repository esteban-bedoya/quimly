import {
  getDefaultAdditionalSiteMonthlyPriceCop,
  getDefaultBaseMonthlyPriceCop,
  operationalPricingVersion,
} from "../src/lib/billing.ts";

const supabasePageSize = 1000;
const openIntentStatuses = ["created", "awaiting_customer", "awaiting_payment", "processing", "compensation_required"];
const applyChanges = process.argv.includes("--apply");

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function getSupabaseConfiguration() {
  return {
    url: requireEnvironment("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
    serviceRoleKey: requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function getMercadoPagoAccessToken() {
  return requireEnvironment("MERCADO_PAGO_ACCESS_TOKEN");
}

function getMercadoPagoEnvironment() {
  const environment = process.env.MERCADO_PAGO_ENVIRONMENT?.trim().toLowerCase() || "sandbox";

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("MERCADO_PAGO_ENVIRONMENT debe ser sandbox o production.");
  }

  return environment;
}

function getRequiredCopAmount(value, fieldName) {
  const amount = typeof value === "string" ? Number(value) : value;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Mercado Pago devolvió ${fieldName} inválido.`);
  }

  return amount;
}

function toIsoDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapMercadoPagoSubscription(response) {
  const providerSubscriptionId = typeof response?.id === "string" || typeof response?.id === "number"
    ? String(response.id).trim()
    : "";

  if (!providerSubscriptionId) {
    throw new Error("Mercado Pago no devolvió el identificador de la suscripción.");
  }

  return {
    providerSubscriptionId,
    providerStatus: typeof response.status === "string" && response.status.trim() ? response.status.trim() : "unknown",
    recurringAmountCop: getRequiredCopAmount(response.auto_recurring?.transaction_amount, "un monto recurrente"),
    currency: typeof response.auto_recurring?.currency_id === "string" ? response.auto_recurring.currency_id.trim() : "",
    providerVersion: Number.isInteger(response.version) ? response.version : null,
    providerUpdatedAt: toIsoDate(response.last_modified ?? response.date_last_updated),
    nextPaymentAt: toIsoDate(response.next_payment_date),
  };
}

async function querySupabase(table, parameters, { range } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfiguration();
  const endpoint = new URL(`/rest/v1/${table}`, url);

  for (const [name, value] of Object.entries(parameters)) {
    endpoint.searchParams.set(name, value);
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(range ? { Range: range } : {}),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`Supabase no pudo consultar ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function queryAllSupabase(table, parameters) {
  const rows = [];

  for (let from = 0; ; from += supabasePageSize) {
    const page = await querySupabase(table, parameters, {
      range: `${from}-${from + supabasePageSize - 1}`,
    });
    rows.push(...page);

    if (page.length < supabasePageSize) {
      return rows;
    }
  }
}

async function callSupabaseRpc(functionName, body) {
  const { url, serviceRoleKey } = getSupabaseConfiguration();
  const response = await fetch(new URL(`/rest/v1/rpc/${functionName}`, url), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Supabase no pudo registrar la nueva tarifa: ${await response.text()}`);
  }
}

async function requestMercadoPago(path, init) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    const message = payload?.cause?.find((cause) => cause.description)?.description ?? payload?.message ?? payload?.error;
    throw new Error(message ?? "Mercado Pago no pudo procesar la actualización de tarifa.");
  }

  return payload;
}

async function getMercadoPagoSubscription(providerSubscriptionId) {
  return mapMercadoPagoSubscription(
    await requestMercadoPago(`/preapproval/${encodeURIComponent(providerSubscriptionId)}`, { method: "GET" }),
  );
}

async function updateMercadoPagoSubscriptionAmount(providerSubscriptionId, recurringAmountCop) {
  return mapMercadoPagoSubscription(
    await requestMercadoPago(`/preapproval/${encodeURIComponent(providerSubscriptionId)}`, {
      method: "PUT",
      body: JSON.stringify({
        auto_recurring: {
          transaction_amount: recurringAmountCop,
          currency_id: "COP",
        },
      }),
    }),
  );
}

function buildTargetPrice(subscription) {
  const includedSites = Number(subscription.included_active_sites);
  const maxActiveLocations = Number(subscription.max_active_locations);

  if (!Number.isInteger(includedSites) || includedSites !== 1 || !Number.isInteger(maxActiveLocations) || maxActiveLocations < includedSites) {
    return { error: "La capacidad almacenada no corresponde a una tarifa de una sede inicial." };
  }

  const baseMonthlyPriceCop = getDefaultBaseMonthlyPriceCop("operational");
  const additionalSiteMonthlyPriceCop = getDefaultAdditionalSiteMonthlyPriceCop("operational");

  return {
    baseMonthlyPriceCop,
    additionalSiteMonthlyPriceCop,
    monthlyTotalCop: baseMonthlyPriceCop + (maxActiveLocations - includedSites) * additionalSiteMonthlyPriceCop,
  };
}

function groupOpenProviders(providerSubscriptions) {
  const grouped = new Map();

  for (const providerSubscription of providerSubscriptions) {
    if (providerSubscription.ended_at !== null) {
      continue;
    }

    const current = grouped.get(providerSubscription.subscription_id) ?? [];
    current.push(providerSubscription);
    grouped.set(providerSubscription.subscription_id, current);
  }

  return grouped;
}

async function loadPricingChangePlan() {
  const [subscriptions, providerSubscriptions, openIntents, scheduledCapacityChanges] = await Promise.all([
    queryAllSupabase("company_subscriptions", {
      select: "id,company_id,status,plan_type,base_monthly_price_cop,additional_site_monthly_price_cop,included_active_sites,max_active_locations",
      plan_type: "eq.operational",
    }),
    queryAllSupabase("billing_provider_subscriptions", {
      select: "id,company_id,subscription_id,provider_subscription_id,provider_status,recurring_amount_cop,ended_at",
      provider: "eq.mercado_pago",
    }),
    queryAllSupabase("billing_intents", {
      select: "company_id",
      status: `in.(${openIntentStatuses.join(",")})`,
    }),
    queryAllSupabase("subscription_capacity_changes", {
      select: "company_id",
      status: "eq.scheduled",
    }),
  ]);
  const openIntentCompanyIds = new Set(openIntents.map((intent) => intent.company_id));
  const scheduledCapacityChangeCompanyIds = new Set(scheduledCapacityChanges.map((change) => change.company_id));
  const openProvidersBySubscriptionId = groupOpenProviders(providerSubscriptions);
  const targets = [];
  const blocked = [];

  for (const subscription of subscriptions) {
    const targetPrice = buildTargetPrice(subscription);

    if ("error" in targetPrice) {
      blocked.push({ subscriptionId: subscription.id, companyId: subscription.company_id, reason: targetPrice.error });
      continue;
    }

    if (openIntentCompanyIds.has(subscription.company_id)) {
      blocked.push({ subscriptionId: subscription.id, companyId: subscription.company_id, reason: "Tiene una operación de billing pendiente." });
      continue;
    }

    if (scheduledCapacityChangeCompanyIds.has(subscription.company_id)) {
      blocked.push({ subscriptionId: subscription.id, companyId: subscription.company_id, reason: "Tiene una reducción de capacidad programada." });
      continue;
    }

    const openProviders = openProvidersBySubscriptionId.get(subscription.id) ?? [];

    if (openProviders.length > 1) {
      blocked.push({ subscriptionId: subscription.id, companyId: subscription.company_id, reason: "Tiene más de un preapproval abierto en Mercado Pago." });
      continue;
    }

    targets.push({
      subscription,
      targetPrice,
      providerSubscription: openProviders[0] ?? null,
    });
  }

  return { targets, blocked };
}

async function applyTarget(target) {
  let providerState = null;

  if (target.providerSubscription) {
    providerState = await getMercadoPagoSubscription(target.providerSubscription.provider_subscription_id);

    if (providerState.providerSubscriptionId !== target.providerSubscription.provider_subscription_id || providerState.currency !== "COP") {
      throw new Error("Mercado Pago devolvió un preapproval diferente o en una moneda no compatible.");
    }

    if (["cancelled", "canceled"].includes(providerState.providerStatus.toLowerCase())) {
      throw new Error("El preapproval de Mercado Pago está cancelado y requiere revisión manual.");
    }

    if (providerState.recurringAmountCop !== target.targetPrice.monthlyTotalCop) {
      providerState = await updateMercadoPagoSubscriptionAmount(
        target.providerSubscription.provider_subscription_id,
        target.targetPrice.monthlyTotalCop,
      );
    }

    if (providerState.recurringAmountCop !== target.targetPrice.monthlyTotalCop || providerState.currency !== "COP") {
      throw new Error("Mercado Pago no confirmó el nuevo monto recurrente.");
    }
  }

  await callSupabaseRpc("apply_operational_pricing_20260930", {
    target_subscription_id: target.subscription.id,
    target_base_monthly_price_cop: target.targetPrice.baseMonthlyPriceCop,
    target_additional_site_monthly_price_cop: target.targetPrice.additionalSiteMonthlyPriceCop,
    target_provider_subscription_id: providerState?.providerSubscriptionId ?? null,
    target_recurring_amount_cop: providerState?.recurringAmountCop ?? null,
    target_provider_status: providerState?.providerStatus ?? null,
    target_provider_version: providerState?.providerVersion ?? null,
    target_provider_updated_at: providerState?.providerUpdatedAt ?? null,
    target_next_payment_at: providerState?.nextPaymentAt ?? null,
  });
}

function printUsage() {
  console.log(`Uso:
  npm run billing:operational-price-change
  QUIMLY_OPERATIONAL_PRICING_CONFIRM=${operationalPricingVersion} npm run billing:operational-price-change -- --apply`);
}

try {
  if (applyChanges && process.env.QUIMLY_OPERATIONAL_PRICING_CONFIRM !== operationalPricingVersion) {
    throw new Error(`Para aplicar cambios reales, define QUIMLY_OPERATIONAL_PRICING_CONFIRM=${operationalPricingVersion}.`);
  }

  const plan = await loadPricingChangePlan();
  const summary = {
    mode: applyChanges ? "apply" : "dry-run",
    mercadoPagoEnvironment: applyChanges ? getMercadoPagoEnvironment() : null,
    pricingVersion: operationalPricingVersion,
    targetCount: plan.targets.length,
    blocked: plan.blocked,
    targets: plan.targets.map(({ subscription, targetPrice, providerSubscription }) => ({
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      status: subscription.status,
      currentMonthlyTotalCop:
        Number(subscription.base_monthly_price_cop) +
        (Number(subscription.max_active_locations) - Number(subscription.included_active_sites)) * Number(subscription.additional_site_monthly_price_cop),
      targetMonthlyTotalCop: targetPrice.monthlyTotalCop,
      providerSubscriptionId: providerSubscription?.provider_subscription_id ?? null,
    })),
  };

  if (!applyChanges) {
    console.log(JSON.stringify(summary, null, 2));
    printUsage();
  } else {
    const applied = [];
    const failed = [];

    for (const target of plan.targets) {
      try {
        await applyTarget(target);
        applied.push({ subscriptionId: target.subscription.id, companyId: target.subscription.company_id });
      } catch (error) {
        failed.push({
          subscriptionId: target.subscription.id,
          companyId: target.subscription.company_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(JSON.stringify({ ...summary, applied, failed }, null, 2));

    if (failed.length) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
