import {
  additionalSitePriceCop,
  calculatePlanMonthlyTotalCop,
  getDefaultBaseMonthlyPriceCop,
  includedSitesInBasePlan,
  type PlanType,
} from "@/lib/billing";

export type BillingPriceSnapshot = {
  planType: PlanType;
  baseMonthlyPriceCop: number;
  additionalSiteMonthlyPriceCop: number;
  includedActiveSites: number;
};

export type CapacityPriceQuote = BillingPriceSnapshot & {
  maxActiveLocations: number;
  monthlyTotalCop: number;
};

export type UpgradeProrationQuote = {
  previousMonthlyTotalCop: number;
  nextMonthlyTotalCop: number;
  monthlyDeltaCop: number;
  proratedAmountCop: number;
  periodStartedAt: string;
  periodEndsAt: string;
  calculatedAt: string;
  formulaVersion: 1;
};

function normalizeCurrencyAmount(value: number, fallback: number) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function requirePositiveCapacity(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} debe ser un número entero mayor o igual a 1.`);
  }
}

export function createBillingPriceSnapshot({
  planType,
  baseMonthlyPriceCop,
  additionalSiteMonthlyPriceCop,
  includedActiveSites,
}: Partial<BillingPriceSnapshot> & Pick<BillingPriceSnapshot, "planType">): BillingPriceSnapshot {
  const normalizedIncludedActiveSites = typeof includedActiveSites === "number" && Number.isInteger(includedActiveSites) && includedActiveSites >= 1
    ? includedActiveSites
    : includedSitesInBasePlan;

  return {
    planType,
    baseMonthlyPriceCop: normalizeCurrencyAmount(
      baseMonthlyPriceCop ?? getDefaultBaseMonthlyPriceCop(planType),
      getDefaultBaseMonthlyPriceCop(planType),
    ),
    additionalSiteMonthlyPriceCop: normalizeCurrencyAmount(
      additionalSiteMonthlyPriceCop ?? additionalSitePriceCop,
      additionalSitePriceCop,
    ),
    includedActiveSites: normalizedIncludedActiveSites,
  };
}

export function quoteCapacity({
  price,
  maxActiveLocations,
}: {
  price: BillingPriceSnapshot;
  maxActiveLocations: number;
}): CapacityPriceQuote {
  requirePositiveCapacity(maxActiveLocations, "La capacidad contratada");

  if (maxActiveLocations < price.includedActiveSites) {
    throw new Error("La capacidad contratada no puede ser menor que las sedes incluidas en el plan.");
  }

  return {
    ...price,
    maxActiveLocations,
    monthlyTotalCop: calculatePlanMonthlyTotalCop({
      planType: price.planType,
      siteCount: maxActiveLocations,
      baseMonthlyPriceCop: price.baseMonthlyPriceCop,
      additionalSiteMonthlyPriceCop: price.additionalSiteMonthlyPriceCop,
      includedActiveSites: price.includedActiveSites,
    }),
  };
}

export function quoteUpgradeProration({
  currentQuote,
  requestedQuote,
  periodStartedAt,
  periodEndsAt,
  now = new Date(),
}: {
  currentQuote: CapacityPriceQuote;
  requestedQuote: CapacityPriceQuote;
  periodStartedAt: string;
  periodEndsAt: string;
  now?: Date;
}): UpgradeProrationQuote {
  if (requestedQuote.maxActiveLocations <= currentQuote.maxActiveLocations) {
    throw new Error("Un upgrade debe aumentar la capacidad contratada.");
  }

  const start = new Date(periodStartedAt);
  const end = new Date(periodEndsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("El periodo de facturación no es válido para calcular el prorrateo.");
  }

  const monthlyDeltaCop = requestedQuote.monthlyTotalCop - currentQuote.monthlyTotalCop;
  const totalPeriodMilliseconds = end.getTime() - start.getTime();
  const remainingPeriodMilliseconds = Math.max(0, end.getTime() - now.getTime());
  const proratedAmountCop = Math.ceil((monthlyDeltaCop * remainingPeriodMilliseconds) / totalPeriodMilliseconds);

  return {
    previousMonthlyTotalCop: currentQuote.monthlyTotalCop,
    nextMonthlyTotalCop: requestedQuote.monthlyTotalCop,
    monthlyDeltaCop,
    proratedAmountCop,
    periodStartedAt: start.toISOString(),
    periodEndsAt: end.toISOString(),
    calculatedAt: now.toISOString(),
    formulaVersion: 1,
  };
}
