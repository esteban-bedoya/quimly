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
  canCancelSubscription,
  calculatePlanMonthlyTotalCop,
  founderPlanBasePriceCop,
  getAccountCapabilities,
  getBranchCreationBlockedMessage,
  getSubscriptionViewState,
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

test("pago pendiente conserva el acceso operativo hasta que venza la ventana de reintentos", () => {
  const capabilities = getAccountCapabilities({
    subscriptionViewState: "payment_issue",
    maxActiveLocations: 2,
    activeBranches: 1,
  });

  assert.equal(capabilities.canOperate, true);
  assert.equal(capabilities.canCreateRecords, true);
  assert.equal(capabilities.canCreateBranch, true);
});

test("el bloqueo al agregar sedes prioriza la causa y una acción resoluble", () => {
  const capacityLimit = getBranchCreationBlockedMessage({
    subscriptionViewState: "operational_active",
    accountCapabilities: getAccountCapabilities({
      subscriptionViewState: "operational_active",
      maxActiveLocations: 2,
      activeBranches: 2,
    }),
  });
  const capacityResolution = getBranchCreationBlockedMessage({
    subscriptionViewState: "operational_active",
    accountCapabilities: getAccountCapabilities({
      subscriptionViewState: "operational_active",
      maxActiveLocations: 1,
      activeBranches: 2,
    }),
  });

  assert.deepEqual(
    { summaryLabel: capacityLimit.summaryLabel, action: capacityLimit.action },
    { summaryLabel: "Aumentar capacidad", action: "open_plan_payments" },
  );
  assert.deepEqual(
    { summaryLabel: capacityResolution.summaryLabel, action: capacityResolution.action },
    { summaryLabel: "Elegir sedes activas", action: "resolve_capacity" },
  );
  assert.equal(
    capacityResolution.description,
    "Tu plan permite hasta 1 sede activa, pero actualmente tienes 2 sedes activas. Elige la sede que mantendrás activa antes de crear otra sede.",
  );
});

test("desactivar una sede libera un cupo y crear la última disponible vuelve a bloquear solo la siguiente creación", () => {
  const withFullCapacity = getAccountCapabilities({
    subscriptionViewState: "operational_active",
    maxActiveLocations: 1,
    activeBranches: 1,
  });
  const afterDeactivation = getAccountCapabilities({
    subscriptionViewState: "operational_active",
    maxActiveLocations: 1,
    activeBranches: 0,
  });
  const afterCreatingBranch = getAccountCapabilities({
    subscriptionViewState: "operational_active",
    maxActiveLocations: 1,
    activeBranches: 1,
  });

  assert.equal(withFullCapacity.canCreateBranch, false);
  assert.equal(afterDeactivation.canCreateBranch, true);
  assert.equal(afterCreatingBranch.canCreateBranch, false);
  assert.equal(
    getBranchCreationBlockedMessage({
      subscriptionViewState: "operational_active",
      accountCapabilities: afterCreatingBranch,
    }).summaryLabel,
    "Aumentar capacidad",
  );
});

test("pago pendiente y reducción programada muestran la acción que realmente desbloquea otra sede", () => {
  const paymentIssueAtCapacity = getBranchCreationBlockedMessage({
    subscriptionViewState: "payment_issue",
    accountCapabilities: getAccountCapabilities({
      subscriptionViewState: "payment_issue",
      maxActiveLocations: 2,
      activeBranches: 2,
    }),
  });
  const scheduledDowngradeAtCapacity = getBranchCreationBlockedMessage({
    subscriptionViewState: "operational_active",
    accountCapabilities: getAccountCapabilities({
      subscriptionViewState: "operational_active",
      maxActiveLocations: 2,
      activeBranches: 2,
    }),
    hasScheduledDowngrade: true,
  });

  assert.deepEqual(
    { summaryLabel: paymentIssueAtCapacity.summaryLabel, action: paymentIssueAtCapacity.action },
    { summaryLabel: "Actualizar método de pago", action: "open_plan_payments" },
  );
  assert.deepEqual(
    { summaryLabel: scheduledDowngradeAtCapacity.summaryLabel, action: scheduledDowngradeAtCapacity.action },
    { summaryLabel: "Gestionar reducción programada", action: "manage_scheduled_downgrade" },
  );
});

test("pago pendiente se suspende al vencer su ventana de reintentos", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  assert.equal(getSubscriptionViewState({
    status: "payment_issue",
    planType: "operational",
    trialEndsAt: null,
    paymentGraceEndsAt: "2026-07-30T12:00:01.000Z",
    now,
  }), "payment_issue");
  assert.equal(getSubscriptionViewState({
    status: "payment_issue",
    planType: "operational",
    trialEndsAt: null,
    paymentGraceEndsAt: "2026-07-30T12:00:00.000Z",
    now,
  }), "suspended");
});

test("cancelación está disponible para planes activos, pago pendiente y suspendidos", () => {
  assert.equal(canCancelSubscription("founder_active"), true);
  assert.equal(canCancelSubscription("operational_active"), true);
  assert.equal(canCancelSubscription("payment_issue"), true);
  assert.equal(canCancelSubscription("suspended"), true);
  assert.equal(canCancelSubscription("trial_active"), false);
  assert.equal(canCancelSubscription("trial_expired"), false);
  assert.equal(canCancelSubscription("cancelled"), false);
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
  }), false);
});

test("cancelar con pago pendiente o suspensión se hace efectivo de inmediato", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");

  for (const currentStatus of ["payment_issue", "suspended"]) {
    const projection = getCancellationProjection({
      currentStatus,
      currentPeriodEndsAt: "2026-08-12T12:00:00.000Z",
      cancellationAt: now.toISOString(),
      now,
    });

    assert.deepEqual(projection, {
      status: "cancelled",
      effectiveAt: now.toISOString(),
    });
  }
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

test("un webhook aprobado tardío no reactiva una suscripción ya cancelada", () => {
  assert.equal(shouldApplyRecurringPaymentAfterCancellation({
    currentStatus: "cancelled",
  }), false);
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

test("renovación rechazada abre una ventana de pago pendiente de diez días", () => {
  const projection = getRecurringPaymentFailureProjection({
    currentStatus: "active",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: false,
    cancellationEffectiveAt: null,
    debitAt: "2026-08-12T00:00:00.000Z",
    now: new Date("2026-07-12T00:00:00.000Z"),
  });

  assert.deepEqual(projection, {
    status: "payment_issue",
    paymentAttentionRequired: true,
    paymentGraceEndsAt: "2026-08-22T00:00:00.000Z",
  });
});

test("los reintentos posteriores no extienden la ventana de diez días", () => {
  const projection = getRecurringPaymentFailureProjection({
    currentStatus: "payment_issue",
    currentPeriodEndsAt: "2026-08-12T00:00:00.000Z",
    cancellationRequested: false,
    cancellationEffectiveAt: null,
    debitAt: "2026-08-15T00:00:00.000Z",
    existingPaymentGraceEndsAt: "2026-08-22T00:00:00.000Z",
    now: new Date("2026-08-15T00:00:00.000Z"),
  });

  assert.deepEqual(projection, {
    status: "payment_issue",
    paymentAttentionRequired: true,
    paymentGraceEndsAt: "2026-08-22T00:00:00.000Z",
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

test("C2 aplica la aprobación de una reactivación si la suscripción sigue cancelada o suspendida", () => {
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
    subscriptionStatus: "suspended",
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
