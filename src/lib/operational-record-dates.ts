type DateKeyParts = {
  year: number;
  monthIndex: number;
  day: number;
};

export type OperationalRecordDateStatus = "missing" | "complete";

const defaultOperationalRecordTimeZone = "America/Bogota";
const dayInMilliseconds = 24 * 60 * 60 * 1000;

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

function getDateTimePartsInTimeZone(date: Date, timeZone = defaultOperationalRecordTimeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((currentParts, part) => {
    if (part.type !== "literal") {
      currentParts[part.type] = part.value;
    }

    return currentParts;
  }, {});

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

export function formatOperationalRecordDateKey(date: Date, timeZone = defaultOperationalRecordTimeZone) {
  const parts = getDateTimePartsInTimeZone(date, timeZone);

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

function formatOperationalRecordDateTimeLocalValue(date: Date, timeZone = defaultOperationalRecordTimeZone) {
  const parts = getDateTimePartsInTimeZone(date, timeZone);

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(parts.hour)}:${padDatePart(parts.minute)}`;
}

function floorToHour(date: Date) {
  const nextDate = new Date(date);
  nextDate.setMinutes(0, 0, 0);
  return nextDate;
}

function ceilToHour(date: Date) {
  const nextDate = floorToHour(date);

  if (date.getMinutes() > 0 || date.getSeconds() > 0 || date.getMilliseconds() > 0) {
    nextDate.setHours(nextDate.getHours() + 1);
  }

  return nextDate;
}

export function getOperationalRecordDateLimits(
  maxPastDays = 5,
  now = new Date(),
  timeZone = defaultOperationalRecordTimeZone,
) {
  const minDate = new Date(now.getTime() - maxPastDays * dayInMilliseconds);

  return {
    min: formatOperationalRecordDateTimeLocalValue(ceilToHour(minDate), timeZone),
    max: formatOperationalRecordDateTimeLocalValue(floorToHour(now), timeZone),
  };
}

function getDateKeyFromLocalDateTime(value: string) {
  const dateKeyMatch = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2})?$/.exec(value);

  if (dateKeyMatch) {
    return dateKeyMatch[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatLocalDateKey(date);
}

export function getOperationalRecordDateStatus({
  completedDateKeys,
  max,
  min,
}: {
  completedDateKeys: string[];
  max: string;
  min: string;
}): OperationalRecordDateStatus {
  const minKey = getDateKeyFromLocalDateTime(min);
  const maxKey = getDateKeyFromLocalDateTime(max);

  if (!minKey || !maxKey || minKey > maxKey) {
    return "missing";
  }

  const completedDateKeySet = new Set(completedDateKeys);
  const currentDate = new Date(`${minKey}T00:00`);
  const lastDate = new Date(`${maxKey}T00:00`);

  while (currentDate <= lastDate) {
    const dateKey = formatLocalDateKey(currentDate);

    if (!completedDateKeySet.has(dateKey)) {
      return "missing";
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return "complete";
}
