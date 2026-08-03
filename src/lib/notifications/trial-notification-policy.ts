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
