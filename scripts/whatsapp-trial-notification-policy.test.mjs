import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendTrialExpired, shouldSendTrialMidpoint } from "../src/lib/notifications/trial-notification-policy.ts";

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
