const COLOMBIA_TIME_ZONE = "America/Bogota";

function colombiaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A weekly summary only includes a branch that existed during its reported period. */
export function shouldSendWeeklyOperationalSummaryToBranch({ branchCreatedAt, periodEnd }: {
  branchCreatedAt: Date;
  periodEnd: string;
}) {
  return colombiaDateKey(branchCreatedAt) <= periodEnd;
}
