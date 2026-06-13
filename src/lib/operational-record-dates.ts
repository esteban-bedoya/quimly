type DateKeyParts = {
  year: number;
  monthIndex: number;
  day: number;
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateKeyFromParts({ year, monthIndex, day }: DateKeyParts) {
  return `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(day)}`;
}

export function formatLocalDateKey(date: Date) {
  return formatDateKeyFromParts({
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
  });
}

function getDateKeyFromLocalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatLocalDateKey(date);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function getPendingRecordDateKeys({
  completedDateKeys,
  max,
  min,
}: {
  completedDateKeys: string[];
  max: string;
  min: string;
}) {
  const minKey = getDateKeyFromLocalDateTime(min);
  const maxKey = getDateKeyFromLocalDateTime(max);

  if (!minKey || !maxKey || minKey > maxKey) {
    return [];
  }

  const completedDateKeySet = new Set(completedDateKeys);
  const pendingDateKeys: string[] = [];
  const currentDate = new Date(`${minKey}T00:00`);
  const lastDate = new Date(`${maxKey}T00:00`);

  while (currentDate <= lastDate) {
    const dateKey = formatLocalDateKey(currentDate);

    if (!completedDateKeySet.has(dateKey)) {
      pendingDateKeys.push(dateKey);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return pendingDateKeys;
}

export function hasPendingRecordDates(input: {
  completedDateKeys: string[];
  max: string;
  min: string;
}) {
  return getPendingRecordDateKeys(input).length > 0;
}

export function getRecentWindowStartDate(daysBack: number) {
  return addDays(new Date(), -daysBack);
}
