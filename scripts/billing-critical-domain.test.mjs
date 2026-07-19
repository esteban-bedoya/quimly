import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoScheduledDowngrade,
  decideLateApprovedResolution,
  getApprovedRenewalProjection,
  getCancellationProjection,
  getProtectedCancellationEffectiveAt,
  getRecurringPaymentFailureProjection,
  getUpgradeReversalCapacity,
  isAbandonedActivationCheckoutForFounder,
  isCurrentPaymentEntitlement,
  isPaymentReversal,
  isUpgradePaymentHistorical,
  shouldApplyRecurringPaymentAfterCancellation,
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

test("cancelación conserva acceso hasta finalizar el periodo pagado", () => {
  const scheduled = getCancellationProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-08-12T12:00:00.000Z",
    cancellationAt: "2026-07-20T12:00:00.000Z",
    now: new Date("2026-07-20T12:00:00.000Z"),
  });

  assert.deepEqual(scheduled, {
    status: "active",
    effectiveAt: "2026-08-12T12:00:00.000Z",
  });

  const due = getCancellationProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-08-12T12:00:00.000Z",
    cancellationAt: "2026-07-20T12:00:00.000Z",
    now: new Date("2026-08-12T12:00:00.000Z"),
  });

  assert.equal(due.status, "cancelled");
  assert.equal(shouldApplyRecurringPaymentAfterCancellation({
    currentStatus: "cancelled",
    paymentStatus: "approved",
    cancellationRequested: true,
  }), true);
  assert.equal(shouldApplyRecurringPaymentAfterCancellation({
    currentStatus: "cancelled",
    paymentStatus: "rejected",
    cancellationRequested: true,
  }), false);
});

test("cancelación solicitada y luego renovación aprobada extiende la fecha efectiva", () => {
  const projection = getApprovedRenewalProjection({
    currentPeriodStartedAt: "2026-07-12T00:00:00.000Z",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: true,
    cancellationEffectiveAt: "2026-08-12T00:00:00.000Z",
    approvedPeriodStartedAt: "2026-08-12T00:00:00.000Z",
    approvedPeriodEndsAt: "2026-09-12T00:00:00.000Z",
  });

  assert.deepEqual(projection, {
    status: "active",
    currentPeriodStartedAt: "2026-08-12T00:00:00.000Z",
    currentPeriodEndsAt: "2026-09-12T00:00:00.000Z",
    cancellationEffectiveAt: "2026-09-12T00:00:00.000Z",
  });
});

test("renovación aprobada y luego cancelación confirmada conserva el periodo mayor", () => {
  assert.equal(getProtectedCancellationEffectiveAt({
    requestedEffectiveAt: "2026-08-12T00:00:00.000Z",
    currentPeriodEndsAt: "2026-09-12T00:00:00.000Z",
    existingCancellationEffectiveAt: null,
  }), "2026-09-12T00:00:00.000Z");
});

test("cron finalizado y webhook aprobado tardío reactiva hasta el periodo pagado", () => {
  assert.equal(shouldApplyRecurringPaymentAfterCancellation({
    currentStatus: "cancelled",
    paymentStatus: "approved",
    cancellationRequested: true,
  }), true);

  const projection = getApprovedRenewalProjection({
    currentPeriodStartedAt: "2026-07-12T00:00:00.000Z",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: true,
    cancellationEffectiveAt: "2026-08-12T00:00:00.000Z",
    approvedPeriodStartedAt: "2026-08-12T00:00:00.000Z",
    approvedPeriodEndsAt: "2026-09-12T00:00:00.000Z",
  });

  assert.equal(projection.status, "active");
  assert.equal(projection.currentPeriodEndsAt, "2026-09-12T00:00:00.000Z");
  assert.equal(projection.cancellationEffectiveAt, "2026-09-12T00:00:00.000Z");
});

test("una aprobación histórica nunca reduce un periodo vigente más largo", () => {
  const projection = getApprovedRenewalProjection({
    currentPeriodStartedAt: "2026-09-12T00:00:00.000Z",
    currentPeriodEndsAt: "2026-10-12T00:00:00.000Z",
    cancellationRequested: true,
    cancellationEffectiveAt: "2026-10-12T00:00:00.000Z",
    approvedPeriodStartedAt: "2026-08-12T00:00:00.000Z",
    approvedPeriodEndsAt: "2026-09-12T00:00:00.000Z",
  });

  assert.equal(projection.currentPeriodStartedAt, "2026-09-12T00:00:00.000Z");
  assert.equal(projection.currentPeriodEndsAt, "2026-10-12T00:00:00.000Z");
  assert.equal(projection.cancellationEffectiveAt, "2026-10-12T00:00:00.000Z");
});

test("renovación rechazada conserva acceso mientras el periodo pagado siga vigente", () => {
  const projection = getRecurringPaymentFailureProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: false,
    cancellationEffectiveAt: null,
    now: new Date("2026-07-12T00:00:00.000Z"),
  });

  assert.deepEqual(projection, {
    status: "active",
    paymentAttentionRequired: true,
    paymentGraceEndsAt: "2026-08-12T00:00:00.000Z",
  });
});

test("renovación rechazada marca payment_issue cuando el periodo ya venció", () => {
  const projection = getRecurringPaymentFailureProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-07-11T23:59:59.000Z",
    cancellationRequested: false,
    cancellationEffectiveAt: null,
    now: new Date("2026-07-12T00:00:00.000Z"),
  });

  assert.deepEqual(projection, {
    status: "payment_issue",
    paymentAttentionRequired: true,
    paymentGraceEndsAt: null,
  });
});

test("cancelación solicitada conserva acceso ante renovación rechazada hasta la fecha efectiva", () => {
  const projection = getRecurringPaymentFailureProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: true,
    cancellationEffectiveAt: "2026-08-12T00:00:00.000Z",
    now: new Date("2026-07-12T00:00:00.000Z"),
  });

  assert.deepEqual(projection, {
    status: "active",
    paymentAttentionRequired: false,
    paymentGraceEndsAt: "2026-08-12T00:00:00.000Z",
  });
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

test("C2 aplica la aprobación de una reactivación solo si la suscripción sigue cancelada", () => {
  assert.equal(decideLateApprovedResolution({
    intentType: "recovery",
    intentStatus: "awaiting_payment",
    subscriptionStatus: "cancelled",
    providerSubscriptionEnded: false,
    stateStillMatches: true,
  }), "apply");

  assert.equal(decideLateApprovedResolution({
    intentType: "recovery",
    intentStatus: "compensation_required",
    subscriptionStatus: "active",
    providerSubscriptionEnded: false,
    stateStillMatches: true,
  }), "refund");
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
