import assert from "node:assert/strict";
import test from "node:test";

import { shouldDispatchQueuedTrialExpired, shouldDispatchQueuedTrialMidpoint, shouldSendTrialExpired, shouldSendTrialMidpoint } from "../src/lib/notifications/trial-notification-policy.ts";

test("permite recuperar la mitad de prueba mientras la prueba sigue vigente", () => {
  const now = new Date("2026-08-03T14:00:00.000Z");
  const trialEndsAt = new Date("2026-08-05T23:00:00.000Z");

  assert.equal(shouldSendTrialMidpoint({ midpointDate: "2026-08-01", now, today: "2026-08-03", trialEndsAt }), true);
  assert.equal(shouldSendTrialExpired({ now, trialEndsAt }), false);
});

test("no recupera la mitad de prueba después de finalizar", () => {
  const now = new Date("2026-08-03T14:00:00.000Z");
  const trialEndsAt = new Date("2026-08-02T23:00:00.000Z");

  assert.equal(shouldSendTrialMidpoint({ midpointDate: "2026-07-30", now, today: "2026-08-03", trialEndsAt }), false);
  assert.equal(shouldSendTrialExpired({ now, trialEndsAt }), true);
});

test("la finalización solo se envía cuando termina la prueba", () => {
  const trialEndsAt = new Date("2026-08-03T15:00:00.000Z");

  assert.equal(shouldSendTrialExpired({ now: new Date("2026-08-03T14:59:59.999Z"), trialEndsAt }), false);
  assert.equal(shouldSendTrialExpired({ now: trialEndsAt, trialEndsAt }), true);
});

test("cancela un reintento de mitad de prueba si la prueba venció o cambió de estado", () => {
  const now = new Date("2026-08-03T14:00:00.000Z");

  assert.equal(shouldDispatchQueuedTrialMidpoint({ now, subscriptionStatus: "trial", planType: "operational", trialEndsAt: new Date("2026-08-02T23:00:00.000Z") }), false);
  assert.equal(shouldDispatchQueuedTrialMidpoint({ now, subscriptionStatus: "active", planType: "operational", trialEndsAt: new Date("2026-08-05T23:00:00.000Z") }), false);
  assert.equal(shouldDispatchQueuedTrialMidpoint({ now, subscriptionStatus: "trial", planType: "founder", trialEndsAt: new Date("2026-08-05T23:00:00.000Z") }), false);
  assert.equal(shouldDispatchQueuedTrialMidpoint({ now, subscriptionStatus: "trial", planType: "operational", trialEndsAt: new Date("2026-08-05T23:00:00.000Z") }), true);
});

test("cancela un reintento de prueba finalizada si el restaurante ya activó un plan", () => {
  const now = new Date("2026-08-03T14:00:00.000Z");
  const trialEndsAt = new Date("2026-08-02T23:00:00.000Z");

  assert.equal(shouldDispatchQueuedTrialExpired({ now, subscriptionStatus: "active", planType: "operational", trialEndsAt }), false);
  assert.equal(shouldDispatchQueuedTrialExpired({ now, subscriptionStatus: "trial", planType: "founder", trialEndsAt }), false);
  assert.equal(shouldDispatchQueuedTrialExpired({ now, subscriptionStatus: "trial", planType: "operational", trialEndsAt }), true);
});
