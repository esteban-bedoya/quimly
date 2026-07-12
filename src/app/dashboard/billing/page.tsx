import Link from "next/link";

import { calculatePlanMonthlyTotalCop, formatCopAmount, normalizePlanType } from "@/lib/billing";
import { requireRole } from "@/lib/auth/authorization";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const pageSize = 100;

const tabs = [
  ["payments", "Transacciones"],
  ["invoices", "Cobros recurrentes"],
  ["intents", "Operaciones"],
  ["subscriptions", "Suscripciones"],
  ["providers", "Preapprovals Mercado Pago"],
  ["webhooks", "Webhooks"],
  ["changes", "Cambios de capacidad"],
  ["reconciliation", "Conciliaciones"],
] as const;

type BillingTab = (typeof tabs)[number][0];

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  status: string;
  plan_type: string;
  max_active_locations: number;
  base_monthly_price_cop: number;
  additional_site_monthly_price_cop: number;
  included_active_sites: number;
  current_period_ends_at: string | null;
  payment_attention_required: boolean;
  last_successful_payment_at: string | null;
  mercado_pago_subscription_id: string | null;
  updated_at: string;
};

type ProviderSubscriptionRow = {
  id: string;
  company_id: string;
  subscription_id: string;
  provider_subscription_id: string;
  provider_status: string;
  recurring_amount_cop: number;
  next_payment_at: string | null;
  ended_at: string | null;
  updated_at: string;
};

type AttentionItem = {
  id: string;
  category: string;
  detail: string;
  companyId: string | null;
  createdAt: string | null;
};

function getTab(value: string | string[] | undefined): BillingTab {
  const candidate = typeof value === "string" ? value : "payments";
  return tabs.some(([tab]) => tab === candidate) ? (candidate as BillingTab) : "payments";
}

function getPage(value: string | string[] | undefined) {
  const candidate = typeof value === "string" ? Number.parseInt(value, 10) : 1;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—";
}

function statusTone(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";

  if (["approved", "paid", "processed", "active", "authorized", "applied", "completed", "succeeded"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["failed", "rejected", "charged_back", "refunded", "compensation_required", "payment_issue"].includes(normalized)) {
    return "bg-rose-100 text-rose-800";
  }

  if (["pending", "processing", "received", "awaiting_customer", "awaiting_payment", "scheduled", "created"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-[#f2ebe0] text-[#625c53]";
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] ${statusTone(value)}`}>
      {formatLabel(value)}
    </span>
  );
}

function companyLabel(companies: Map<string, CompanyRow>, companyId: string | null | undefined) {
  if (!companyId) {
    return "Sin empresa";
  }

  const company = companies.get(companyId);
  return company ? company.name : "Empresa eliminada o no disponible";
}

function paginationHref(tab: BillingTab, page: number) {
  return `/dashboard/billing?tab=${tab}&page=${page}`;
}

function requireData<T>({ data, error }: { data: T | null; error: { message: string } | null }, message: string): T {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }

  return data as T;
}

async function getCompanyMap(companyIds: string[]) {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const supabase = getSupabaseAdminClient();

  if (!supabase || ids.length === 0) {
    return new Map<string, CompanyRow>();
  }

  const companies = requireData(
    await supabase.from("companies").select("id, name, slug").in("id", ids).returns<CompanyRow[]>(),
    "No fue posible consultar las empresas",
  );

  return new Map(companies.map((company) => [company.id, company]));
}

async function getBillingOverview() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Falta la configuración administrativa de Supabase requerida por Billing.");
  }

  const now = new Date().toISOString();
  const [
    approvedPayments,
    paymentReversals,
    failedWebhooks,
    staleIntents,
    compensationIntents,
    currentSubscriptions,
    currentProviderSubscriptions,
    attentionCompensationIntents,
    attentionStaleIntents,
    attentionWebhooks,
    attentionPayments,
    reconciliationRuns,
  ] = await Promise.all([
    supabase.from("billing_payments").select("id", { count: "exact", head: true }).eq("normalized_status", "approved"),
    supabase
      .from("billing_payments")
      .select("id", { count: "exact", head: true })
      .in("normalized_status", ["refunded", "charged_back"]),
    supabase.from("billing_webhook_events").select("id", { count: "exact", head: true }).eq("processing_status", "failed"),
    supabase
      .from("billing_intents")
      .select("id", { count: "exact", head: true })
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"])
      .lt("expires_at", now),
    supabase
      .from("billing_intents")
      .select("id", { count: "exact", head: true })
      .eq("status", "compensation_required"),
    supabase
      .from("company_subscriptions")
      .select(
        "id, company_id, status, plan_type, max_active_locations, base_monthly_price_cop, additional_site_monthly_price_cop, included_active_sites, current_period_ends_at, payment_attention_required, last_successful_payment_at, mercado_pago_subscription_id, updated_at",
      )
      .returns<SubscriptionRow[]>(),
    supabase
      .from("billing_provider_subscriptions")
      .select("id, company_id, subscription_id, provider_subscription_id, provider_status, recurring_amount_cop, next_payment_at, ended_at, updated_at")
      .is("ended_at", null)
      .returns<ProviderSubscriptionRow[]>(),
    supabase
      .from("billing_intents")
      .select("id, company_id, intent_type, status, last_error_code, last_error_message, expires_at, updated_at")
      .eq("status", "compensation_required")
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("billing_intents")
      .select("id, company_id, intent_type, status, last_error_code, last_error_message, expires_at, updated_at")
      .in("status", ["created", "awaiting_customer", "awaiting_payment", "processing"])
      .lt("expires_at", now)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("billing_webhook_events")
      .select("id, company_id, topic, resource_id, attempts, last_error, received_at")
      .eq("processing_status", "failed")
      .order("received_at", { ascending: false })
      .limit(12),
    supabase
      .from("billing_payments")
      .select("id, company_id, provider_payment_id, normalized_status, amount_cop, refunded_amount_cop, updated_at")
      .in("normalized_status", ["refunded", "charged_back"])
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("billing_reconciliation_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  const subscriptions = requireData(currentSubscriptions, "No fue posible consultar las suscripciones internas");
  const providerSubscriptions = requireData(
    currentProviderSubscriptions,
    "No fue posible consultar las suscripciones de Mercado Pago",
  );
  const providerBySubscription = new Map(providerSubscriptions.map((item) => [item.subscription_id, item]));
  const providerMismatches: AttentionItem[] = [];

  for (const subscription of subscriptions) {
    const providerSubscription = providerBySubscription.get(subscription.id);
    if (!providerSubscription) {
      continue;
    }

    const providerStatus = providerSubscription.provider_status.trim().toLowerCase();
    const expectedAmount = calculatePlanMonthlyTotalCop({
      planType: normalizePlanType(subscription.plan_type),
      siteCount: subscription.max_active_locations,
      baseMonthlyPriceCop: subscription.base_monthly_price_cop,
      additionalSiteMonthlyPriceCop: subscription.additional_site_monthly_price_cop,
      includedActiveSites: subscription.included_active_sites,
    });

    if (
      (subscription.status === "active" && ["paused", "cancelled", "canceled"].includes(providerStatus)) ||
      (subscription.status !== "cancelled" && providerStatus !== "authorized" && subscription.status !== "trial")
    ) {
      providerMismatches.push({
        id: `state:${subscription.id}`,
        category: "Estado interno vs Mercado Pago",
        detail: `Quimly: ${formatLabel(subscription.status)} · Mercado Pago: ${formatLabel(providerSubscription.provider_status)}`,
        companyId: subscription.company_id,
        createdAt: providerSubscription.updated_at,
      });
    }

    if (providerSubscription.recurring_amount_cop !== expectedAmount) {
      providerMismatches.push({
        id: `amount:${subscription.id}`,
        category: "Monto recurrente distinto",
        detail: `Quimly espera ${formatCopAmount(expectedAmount)} · Mercado Pago tiene ${formatCopAmount(providerSubscription.recurring_amount_cop)}`,
        companyId: subscription.company_id,
        createdAt: providerSubscription.updated_at,
      });
    }
  }

  const intentItems = [
    ...requireData(attentionCompensationIntents, "No fue posible consultar las compensaciones pendientes"),
    ...requireData(attentionStaleIntents, "No fue posible consultar las operaciones vencidas"),
  ].map((intent) => ({
    id: `intent:${intent.id}`,
    category: intent.status === "compensation_required" ? "Compensación pendiente" : "Operación vencida sin cierre",
    detail: `${formatLabel(intent.intent_type)} · ${intent.last_error_message ?? intent.last_error_code ?? "Requiere revisión"}`,
    companyId: intent.company_id,
    createdAt: intent.updated_at,
  }));
  const webhookItems = requireData(attentionWebhooks, "No fue posible consultar los webhooks fallidos").map((event) => ({
    id: `webhook:${event.id}`,
    category: "Webhook fallido",
    detail: `${formatLabel(event.topic)} #${event.resource_id} · intento ${event.attempts}${event.last_error ? ` · ${event.last_error}` : ""}`,
    companyId: event.company_id,
    createdAt: event.received_at,
  }));
  const paymentItems = requireData(attentionPayments, "No fue posible consultar los pagos revertidos").map((payment) => ({
    id: `payment:${payment.id}`,
    category: formatLabel(payment.normalized_status),
    detail: `Pago ${payment.provider_payment_id} · ${formatCopAmount(payment.amount_cop)}${payment.refunded_amount_cop ? ` · devuelto ${formatCopAmount(payment.refunded_amount_cop)}` : ""}`,
    companyId: payment.company_id,
    createdAt: payment.updated_at,
  }));
  const attention = [...providerMismatches, ...intentItems, ...webhookItems, ...paymentItems]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 40);
  const companies = await getCompanyMap(attention.map((item) => item.companyId ?? ""));

  const count = (result: { count: number | null; error: { message: string } | null }, message: string) => {
    if (result.error) {
      throw new Error(`${message}: ${result.error.message}`);
    }
    return result.count ?? 0;
  };

  return {
    approvedPayments: count(approvedPayments, "No fue posible contar los pagos aprobados"),
    paymentReversals: count(paymentReversals, "No fue posible contar los pagos revertidos"),
    failedWebhooks: count(failedWebhooks, "No fue posible contar los webhooks fallidos"),
    staleIntents: count(staleIntents, "No fue posible contar las operaciones vencidas"),
    compensationIntents: count(compensationIntents, "No fue posible contar las compensaciones pendientes"),
    failedReconciliations: count(reconciliationRuns, "No fue posible contar las conciliaciones fallidas"),
    attention,
    attentionCompanies: companies,
  };
}

async function getTabData(tab: BillingTab, page: number) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Falta la configuración administrativa de Supabase requerida por Billing.");
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const queryByTab = {
    payments: () =>
      supabase
        .from("billing_payments")
        .select("id, company_id, provider_payment_id, provider_status, provider_status_detail, normalized_status, amount_cop, refunded_amount_cop, payment_method_type, rejection_reason, billing_intent_id, invoice_id, approved_at, provider_created_at, provider_updated_at, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
    invoices: () =>
      supabase
        .from("billing_invoices")
        .select("id, company_id, provider_invoice_id, provider_status, normalized_status, amount_cop, retry_attempt, debit_at, period_started_at, period_ends_at, settled_at, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
    intents: () =>
      supabase
        .from("billing_intents")
        .select("id, company_id, intent_type, status, external_reference, expected_immediate_amount_cop, monthly_amount_after_cop, requested_max_active_locations, expires_at, completed_at, last_error_code, last_error_message, created_at, updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
    subscriptions: () =>
      supabase
        .from("company_subscriptions")
        .select("id, company_id, status, plan_type, max_active_locations, base_monthly_price_cop, additional_site_monthly_price_cop, included_active_sites, current_period_ends_at, payment_attention_required, last_successful_payment_at, mercado_pago_subscription_id, updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to),
    providers: () =>
      supabase
        .from("billing_provider_subscriptions")
        .select("id, company_id, provider_subscription_id, external_reference, provider_status, recurring_amount_cop, next_payment_at, ended_at, provider_updated_at, updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to),
    webhooks: () =>
      supabase
        .from("billing_webhook_events")
        .select("id, company_id, topic, action, resource_id, delivery_key, signature_valid, live_mode, processing_status, attempts, last_error, received_at, processed_at", { count: "exact" })
        .order("received_at", { ascending: false })
        .range(from, to),
    changes: () =>
      supabase
        .from("subscription_capacity_changes")
        .select("id, company_id, current_max_active_locations, requested_max_active_locations, change_type, status, effective_at, applied_at, cancelled_at, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
    reconciliation: () =>
      supabase
        .from("billing_reconciliation_runs")
        .select("id, company_id, mode, status, scope_key, scanned_count, synchronized_count, mismatch_count, error_message, started_at, finished_at", { count: "exact" })
        .order("started_at", { ascending: false })
        .range(from, to),
  } as const;

  const result = await queryByTab[tab]();
  if (result.error) {
    throw new Error(`No fue posible consultar el listado de Billing: ${result.error.message}`);
  }

  const data = (result.data ?? []) as Record<string, unknown>[];
  const companies = await getCompanyMap(
    data.flatMap((row) => (typeof row.company_id === "string" ? [row.company_id] : [])),
  );

  return {
    rows: data,
    companies,
    total: result.count ?? 0,
  };
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 overflow-x-auto rounded-[1.25rem] border border-[#12110f]/10">{children}</div>;
}

function EmptyRow({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-5 py-8 text-center text-sm text-[#6c655d]">
        {children}
      </td>
    </tr>
  );
}

function Pagination({ tab, page, total }: { tab: BillingTab; page: number; total: number }) {
  const hasPrevious = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-[#615b53]">
      <p>
        Mostrando {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </p>
      <div className="flex gap-2">
        {hasPrevious ? (
          <Link href={paginationHref(tab, page - 1)} className="rounded-full border border-[#12110f]/14 px-4 py-2 font-semibold text-[#12110f] hover:bg-[#f3eee6]">
            Anterior
          </Link>
        ) : null}
        {hasNext ? (
          <Link href={paginationHref(tab, page + 1)} className="rounded-full bg-[#12110f] px-4 py-2 font-semibold text-white hover:bg-[#27231f]">
            Siguiente
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function BillingTable({ tab, rows, companies }: { tab: BillingTab; rows: Record<string, unknown>[]; companies: Map<string, CompanyRow> }) {
  if (tab === "payments") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Pago Mercado Pago</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Monto</th><th className="px-5 py-3">Asociación</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate((row.approved_at as string | null) ?? (row.created_at as string))}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4"><p className="font-mono text-xs text-[#12110f]">{String(row.provider_payment_id)}</p><p className="mt-1 text-xs text-[#756e65]">{formatLabel(row.provider_status as string)}</p></td><td className="px-5 py-4"><StatusBadge value={row.normalized_status as string} /></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-[#12110f]">{formatCopAmount(Number(row.amount_cop))}{Number(row.refunded_amount_cop) > 0 ? <p className="mt-1 text-xs font-normal text-rose-700">Devuelto: {formatCopAmount(Number(row.refunded_amount_cop))}</p> : null}</td><td className="px-5 py-4 text-xs text-[#625c53]">{row.billing_intent_id ? "Operación vinculada" : "Renovación / sin operación"}{row.invoice_id ? " · Factura vinculada" : ""}</td></tr>) : <EmptyRow columns={6}>Aún no hay transacciones.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "invoices") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Fecha de débito</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Factura Mercado Pago</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Monto</th><th className="px-5 py-3">Periodo</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.debit_at as string | null)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4 font-mono text-xs text-[#12110f]">{String(row.provider_invoice_id)}</td><td className="px-5 py-4"><StatusBadge value={row.normalized_status as string} /></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-[#12110f]">{formatCopAmount(Number(row.amount_cop))}<p className="mt-1 text-xs font-normal text-[#756e65]">Reintento: {Number(row.retry_attempt)}</p></td><td className="whitespace-nowrap px-5 py-4 text-xs text-[#625c53]">{formatDate(row.period_started_at as string | null)}<br />{formatDate(row.period_ends_at as string | null)}</td></tr>) : <EmptyRow columns={6}>Aún no hay cobros recurrentes.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "intents") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Creada</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Operación</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Valores</th><th className="px-5 py-3">Detalle</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.created_at as string)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4"><p className="font-semibold text-[#12110f]">{formatLabel(row.intent_type as string)}</p><p className="mt-1 font-mono text-[0.68rem] text-[#756e65]">{String(row.external_reference)}</p></td><td className="px-5 py-4"><StatusBadge value={row.status as string} /><p className="mt-2 text-xs text-[#756e65]">Vence: {formatDate(row.expires_at as string | null)}</p></td><td className="whitespace-nowrap px-5 py-4 text-[#12110f]">{row.expected_immediate_amount_cop === null ? "—" : formatCopAmount(Number(row.expected_immediate_amount_cop))}<p className="mt-1 text-xs text-[#756e65]">Recurrente: {row.monthly_amount_after_cop === null ? "—" : formatCopAmount(Number(row.monthly_amount_after_cop))}</p></td><td className="max-w-xs px-5 py-4 text-xs leading-5 text-[#625c53]">{(row.last_error_message as string | null) ?? (row.last_error_code as string | null) ?? "Sin errores registrados"}</td></tr>) : <EmptyRow columns={6}>Aún no hay operaciones de Billing.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "subscriptions") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Quimly</th><th className="px-5 py-3">Capacidad</th><th className="px-5 py-3">Monto esperado</th><th className="px-5 py-3">Próximo cobro</th><th className="px-5 py-3">Último pago</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => { const expected = calculatePlanMonthlyTotalCop({ planType: normalizePlanType(row.plan_type as string), siteCount: Number(row.max_active_locations), baseMonthlyPriceCop: Number(row.base_monthly_price_cop), additionalSiteMonthlyPriceCop: Number(row.additional_site_monthly_price_cop), includedActiveSites: Number(row.included_active_sites) }); return <tr key={String(row.id)}><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4"><StatusBadge value={row.status as string} />{row.payment_attention_required ? <p className="mt-2 text-xs font-semibold text-rose-700">Requiere atención</p> : null}</td><td className="px-5 py-4 text-[#12110f]">{Number(row.max_active_locations)} sedes<p className="mt-1 text-xs text-[#756e65]">{formatLabel(row.plan_type as string)}</p></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-[#12110f]">{formatCopAmount(expected)}</td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.current_period_ends_at as string | null)}</td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.last_successful_payment_at as string | null)}</td></tr>; }) : <EmptyRow columns={6}>Aún no hay suscripciones.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "providers") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Preapproval Mercado Pago</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Monto recurrente</th><th className="px-5 py-3">Próximo cobro</th><th className="px-5 py-3">Cierre</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4"><p className="font-mono text-xs text-[#12110f]">{String(row.provider_subscription_id)}</p><p className="mt-1 font-mono text-[0.68rem] text-[#756e65]">{String(row.external_reference)}</p></td><td className="px-5 py-4"><StatusBadge value={row.provider_status as string} /></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-[#12110f]">{formatCopAmount(Number(row.recurring_amount_cop))}</td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.next_payment_at as string | null)}</td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.ended_at as string | null)}</td></tr>) : <EmptyRow columns={6}>Aún no hay preapprovals de Mercado Pago.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "webhooks") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Recibido</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Evento</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Firma / entorno</th><th className="px-5 py-3">Detalle</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.received_at as string)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string | null)}</td><td className="px-5 py-4"><p className="font-semibold text-[#12110f]">{formatLabel(row.topic as string)}</p><p className="mt-1 font-mono text-[0.68rem] text-[#756e65]">{String(row.resource_id)}</p></td><td className="px-5 py-4"><StatusBadge value={row.processing_status as string} /><p className="mt-2 text-xs text-[#756e65]">Intentos: {Number(row.attempts)}</p></td><td className="px-5 py-4 text-xs text-[#625c53]">{row.signature_valid ? "Firma válida" : "Firma inválida"}<br />{row.live_mode === null ? "Modo no informado" : row.live_mode ? "Producción" : "Sandbox"}</td><td className="max-w-xs px-5 py-4 text-xs leading-5 text-[#625c53]">{(row.last_error as string | null) ?? "Procesado sin error"}</td></tr>) : <EmptyRow columns={6}>Aún no hay webhooks registrados.</EmptyRow>}</tbody></table></TableShell>;
  }

  if (tab === "changes") {
    return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Solicitado</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Cambio</th><th className="px-5 py-3">Capacidad</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Efectivo</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.created_at as string)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{formatLabel(row.change_type as string)}</td><td className="whitespace-nowrap px-5 py-4 text-[#12110f]">{Number(row.current_max_active_locations)} → {Number(row.requested_max_active_locations)} sedes</td><td className="px-5 py-4"><StatusBadge value={row.status as string} /></td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.effective_at as string)}</td></tr>) : <EmptyRow columns={6}>Aún no hay cambios de capacidad.</EmptyRow>}</tbody></table></TableShell>;
  }

  return <TableShell><table className="min-w-full text-left text-sm"><thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.12em] text-[#655f57]"><tr><th className="px-5 py-3">Inicio</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Alcance</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Resultado</th><th className="px-5 py-3">Error</th></tr></thead><tbody className="divide-y divide-[#12110f]/8 bg-white">{rows.length ? rows.map((row) => <tr key={String(row.id)}><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">{formatDate(row.started_at as string)}</td><td className="px-5 py-4 font-semibold text-[#12110f]">{companyLabel(companies, row.company_id as string | null)}</td><td className="px-5 py-4 text-[#12110f]">{formatLabel(row.mode as string)}<p className="mt-1 font-mono text-[0.68rem] text-[#756e65]">{String(row.scope_key)}</p></td><td className="px-5 py-4"><StatusBadge value={row.status as string} /></td><td className="whitespace-nowrap px-5 py-4 text-[#625c53]">Revisados: {Number(row.scanned_count)}<br />Sincronizados: {Number(row.synchronized_count)}<br />Desajustes: {Number(row.mismatch_count)}</td><td className="max-w-xs px-5 py-4 text-xs leading-5 text-[#625c53]">{(row.error_message as string | null) ?? "—"}</td></tr>) : <EmptyRow columns={6}>Todavía no hay ejecuciones de conciliación registradas.</EmptyRow>}</tbody></table></TableShell>;
}

export default async function BillingOwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; page?: string | string[] }>;
}) {
  await requireRole(["owner"]);

  const params = await searchParams;
  const tab = getTab(params.tab);
  const page = getPage(params.page);
  const [overview, table] = await Promise.all([getBillingOverview(), getTabData(tab, page)]);
  const attentionTotal = overview.attention.length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe7_0%,#ebe4d7_100%)] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#2a7f86] hover:text-[#12110f]">← Volver al dashboard</Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="w-fit rounded-full bg-[#12110f] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[#7ad9dd]">Owner · solo lectura</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#12110f] sm:text-4xl">Salud de pagos y conciliación</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d574f] sm:text-base">Visibilidad operativa de Mercado Pago y Billing. Esta vista no modifica cobros, suscripciones ni capacidades.</p>
            </div>
            <p className="rounded-[1rem] bg-[#f4efe7] px-4 py-3 text-xs leading-5 text-[#625c53]">Los listados están paginados en grupos de {pageSize}; puedes recorrer todo el histórico sin cargarlo completo de una vez.</p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2a7f86]">Pagos aprobados</p><p className="mt-3 text-3xl font-semibold text-[#12110f]">{overview.approvedPayments}</p></article>
          <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2a7f86]">Reversiones</p><p className="mt-3 text-3xl font-semibold text-[#12110f]">{overview.paymentReversals}</p><p className="mt-2 text-xs text-[#625c53]">Refunds y chargebacks</p></article>
          <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2a7f86]">Webhooks fallidos</p><p className="mt-3 text-3xl font-semibold text-[#12110f]">{overview.failedWebhooks}</p></article>
          <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2a7f86]">Operaciones vencidas</p><p className="mt-3 text-3xl font-semibold text-[#12110f]">{overview.staleIntents}</p><p className="mt-2 text-xs text-[#625c53]">Compensaciones: {overview.compensationIntents}</p></article>
          <article className={`rounded-[1.5rem] border p-5 ${attentionTotal ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2a7f86]">A revisar ahora</p><p className="mt-3 text-3xl font-semibold text-[#12110f]">{attentionTotal}</p><p className="mt-2 text-xs text-[#625c53]">Fallos de conciliación: {overview.failedReconciliations}</p></article>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-[#12110f]/10 bg-white shadow-[0_20px_60px_rgba(18,17,15,0.08)]">
          <div className="border-b border-[#12110f]/8 px-6 py-6 sm:px-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Atención financiera</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Desajustes que requieren revisión manual</h2><p className="mt-2 text-sm leading-6 text-[#625c53]">Solo se muestran señales concretas: compensaciones, operaciones expiradas sin cierre, webhooks fallidos, reversiones y diferencias entre Quimly y Mercado Pago.</p></div>
          <div className="divide-y divide-[#12110f]/8">{overview.attention.length ? overview.attention.map((item) => <article key={item.id} className="grid gap-2 px-6 py-4 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.2fr)_auto] sm:items-center sm:px-8"><div><p className="font-semibold text-[#12110f]">{item.category}</p><p className="mt-1 text-xs text-[#756e65]">{companyLabel(overview.attentionCompanies, item.companyId)}</p></div><p className="text-sm leading-6 text-[#625c53]">{item.detail}</p><p className="text-xs text-[#756e65]">{formatDate(item.createdAt)}</p></article>) : <p className="px-6 py-8 text-sm leading-6 text-emerald-800 sm:px-8">No hay desajustes detectados con las reglas actuales.</p>}</div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Histórico completo</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">{tabs.find(([key]) => key === tab)?.[1]}</h2></div><nav className="flex flex-wrap gap-2">{tabs.map(([key, label]) => <Link key={key} href={paginationHref(key, 1)} className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] ${tab === key ? "bg-[#12110f] text-white" : "border border-[#12110f]/12 bg-[#fcfbf8] text-[#625c53] hover:bg-[#f0e9de]"}`}>{label}</Link>)}</nav></div>
          <BillingTable tab={tab} rows={table.rows as Record<string, unknown>[]} companies={table.companies} />
          <Pagination tab={tab} page={page} total={table.total} />
        </section>
      </div>
    </main>
  );
}
