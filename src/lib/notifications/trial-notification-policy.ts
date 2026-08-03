export function shouldSendTrialMidpoint({ midpointDate, now, today, trialEndsAt }: {
  midpointDate: string;
  now: Date;
  today: string;
  trialEndsAt: Date;
}) {
  return midpointDate <= today && now < trialEndsAt;
}

export function shouldSendTrialExpired({ now, trialEndsAt }: { now: Date; trialEndsAt: Date }) {
  return now >= trialEndsAt;
}

/**
 * A midpoint reminder can remain queued while the trial changes state. Check
 * again immediately before each send or retry, rather than trusting its age.
 */
export function shouldDispatchQueuedTrialMidpoint({ now, subscriptionStatus, planType, trialEndsAt }: {
  now: Date;
  subscriptionStatus: string;
  planType: string;
  trialEndsAt: Date;
}) {
  return subscriptionStatus === "trial" && planType === "operational" && now < trialEndsAt;
}

/**
 * An expiry notice is relevant only while the subscription remains in trial.
 * If the customer upgrades before a queued retry, suppress the obsolete alert.
 */
export function shouldDispatchQueuedTrialExpired({ now, subscriptionStatus, planType, trialEndsAt }: {
  now: Date;
  subscriptionStatus: string;
  planType: string;
  trialEndsAt: Date;
}) {
  return subscriptionStatus === "trial" && planType === "operational" && now >= trialEndsAt;
}
