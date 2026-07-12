import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoScheduledDowngrade,
  decideLateApprovedResolution,
  getUpgradeReversalCapacity,
  isAbandonedActivationCheckoutForFounder,
  isCurrentPaymentEntitlement,
  isPaymentReversal,
  isUpgradePaymentHistorical,
} from "../src/lib/billing/financial-policy.ts";
import {
  additionalSitePriceCop,
  calculatePlanMonthlyTotalCop,
  founderPlanBasePriceCop,
  operationalPlanBasePriceCop,
} from "../src/lib/billing.ts";

test("pricing mantiene base por plan y cobra 9.900 por sede adicional", () => {
  assert.equal(founderPlanBasePriceCop, 19900);
  assert.equal(operationalPlanBasePriceCop, 24900);
  assert.equal(additionalSitePriceCop, 9900);
  assert.equal(calculatePlanMonthlyTotalCop({ planType: "founder", siteCount: 1 }), 19900);
  assert.equal(calculatePlanMonthlyTotalCop({ planType: "operational", siteCount: 1 }), 24900);
  assert.equal(calculatePlanMonthlyTotalCop({ planType: "operational", siteCount: 2 }), 34800);
  assert.equal(calculatePlanMonthlyTotalCop({ planType: "founder", siteCount: 3 }), 39700);
});

test("Founder permite cerrar solo un checkout de activación vencido, pending y sin pago", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");
  const baseCase = {
    intentType: "activation",
    intentStatus: "awaiting_customer",
    expiresAt: "2026-07-12T11:59:59.000Z",
    providerStatus: "pending",
    hasChargeablePayment: false,
    now,
  };

  assert.equal(isAbandonedActivationCheckoutForFounder(baseCase), true);
  assert.equal(isAbandonedActivationCheckoutForFounder({ ...baseCase, expiresAt: "2026-07-12T12:01:00.000Z" }), false);
  assert.equal(isAbandonedActivationCheckoutForFounder({ ...baseCase, providerStatus: "authorized" }), false);
  assert.equal(isAbandonedActivationCheckoutForFounder({ ...baseCase, hasChargeablePayment: true }), false);
  assert.equal(isAbandonedActivationCheckoutForFounder({ ...baseCase, intentStatus: "awaiting_payment" }), false);
});

test("C1/C2 aplica una aprobación mientras la activación todavía es resoluble", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "activation",
    intentStatus: "awaiting_payment",
    subscriptionStatus: "trial",
    providerSubscriptionEnded: false,
    stateStillMatches: true,
  }), "apply");
});

test("C1/C2 devuelve una aprobación que llegó para un preapproval ya terminado", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "activation",
    intentStatus: "failed",
    subscriptionStatus: "trial",
    providerSubscriptionEnded: true,
    stateStillMatches: true,
  }), "refund");
});

test("C2 recupera una activación legacy terminal cuando el mandato sigue abierto", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "activation",
    intentStatus: "compensation_required",
    subscriptionStatus: "trial",
    providerSubscriptionEnded: false,
    stateStillMatches: true,
  }), "apply");
});

test("C1/C2 devuelve el pago cuando el cierre transaccional del intento ya fue reservado", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "activation",
    intentStatus: "awaiting_payment",
    subscriptionStatus: "trial",
    providerSubscriptionEnded: false,
    stateStillMatches: false,
  }), "refund");
});

test("C2 no vuelve a aplicar un intent exitoso", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "activation",
    intentStatus: "succeeded",
    subscriptionStatus: "active",
    providerSubscriptionEnded: false,
    stateStillMatches: false,
  }), "already_applied");
});

test("C3 identifica refunds, chargebacks y refunds parciales", () => {
  assert.equal(isPaymentReversal("refunded", 0), true);
  assert.equal(isPaymentReversal("charged_back", 0), true);
  assert.equal(isPaymentReversal("approved", 5000), true);
  assert.equal(isPaymentReversal("approved", 0), false);
});

test("C3 solo revierte acceso actual cuando el pago financia el periodo vigente", () => {
  const approvedAt = "2026-07-01T00:00:00.000Z";
  assert.equal(isCurrentPaymentEntitlement({
    paymentApprovedAt: approvedAt,
    currentPeriodStartedAt: approvedAt,
    lastSuccessfulPaymentAt: approvedAt,
  }), true);
  assert.equal(isCurrentPaymentEntitlement({
    paymentApprovedAt: "2026-06-01T00:00:00.000Z",
    currentPeriodStartedAt: approvedAt,
    lastSuccessfulPaymentAt: approvedAt,
  }), false);
});

test("C3 retira únicamente la capacidad financiada por el upgrade", () => {
  assert.equal(getUpgradeReversalCapacity({
    currentCapacity: 7,
    previousCapacity: 2,
    requestedCapacity: 5,
    includedCapacity: 1,
  }), 4);
});

test("C3 conserva capacidad actual cuando una renovación posterior ya la financió", () => {
  assert.equal(isUpgradePaymentHistorical({
    currentPeriodStartedAt: "2026-08-01T00:00:00.000Z",
    upgradePeriodEndsAt: "2026-08-01T00:00:00.000Z",
  }), true);
});

test("C4 bloquea upgrades mientras exista un downgrade programado", () => {
  assert.throws(() => assertNoScheduledDowngrade(true), /Cancela primero/);
  assert.doesNotThrow(() => assertNoScheduledDowngrade(false));
});
