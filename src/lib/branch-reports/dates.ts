export type DateRangeValidationResult =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

export type ReportPeriodPreset = "last7" | "last30" | "last3months" | "custom";
export type HistoryPeriodPreset = "last6months" | "last12months" | "custom";

type DateRangeValidationOptions = {
  maxMonths?: number;
};

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_CUSTOM_REPORT_RANGE_MONTHS = 12;
export const MAX_CUSTOM_REPORT_RANGE_MESSAGE = "Selecciona un rango de hasta 12 meses.";
export const MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE = "El rango seleccionado supera el máximo de 12 meses.";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateValue(value: string) {
  if (!DATE_VALUE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatUtcDateValue(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDateValue(value: string) {
  return Boolean(parseDateValue(value));
}

export function getTodayDateValue(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

export function addDaysToDateValue(value: string, days: number) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return value;
  }

  return formatUtcDateValue(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days)));
}

export function subtractMonthsFromDateValue(value: string, months: number) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return value;
  }

  const targetMonthIndex = parsed.month - 1 - months;
  const lastDayInTargetMonth = new Date(Date.UTC(parsed.year, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(parsed.day, lastDayInTargetMonth);

  return formatUtcDateValue(new Date(Date.UTC(parsed.year, targetMonthIndex, targetDay)));
}

export function addMonthsToDateValue(value: string, months: number) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return value;
  }

  const targetMonthIndex = parsed.month - 1 + months;
  const lastDayInTargetMonth = new Date(Date.UTC(parsed.year, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(parsed.day, lastDayInTargetMonth);

  return formatUtcDateValue(new Date(Date.UTC(parsed.year, targetMonthIndex, targetDay)));
}

export function getReportPresetRange(preset: Exclude<ReportPeriodPreset, "custom">, today = getTodayDateValue()) {
  if (preset === "last7") {
    return { from: addDaysToDateValue(today, -6), to: today };
  }

  if (preset === "last30") {
    return { from: addDaysToDateValue(today, -29), to: today };
  }

  return { from: subtractMonthsFromDateValue(today, 3), to: today };
}

export function getHistoryPresetRange(
  preset: Exclude<HistoryPeriodPreset, "custom">,
  today = getTodayDateValue(),
) {
  return {
    from: subtractMonthsFromDateValue(today, preset === "last6months" ? 6 : 12),
    to: today,
  };
}

export function validateDateRange(
  from: string,
  to: string,
  today = getTodayDateValue(),
  options: DateRangeValidationOptions = {},
): DateRangeValidationResult {
  if (!isDateValue(from) || !isDateValue(to)) {
    return { ok: false, error: "Selecciona fechas válidas." };
  }

  if (from > to) {
    return { ok: false, error: "La fecha inicial no puede ser posterior a la fecha final." };
  }

  if (from > today || to > today) {
    return { ok: false, error: "No se puede elegir una fecha posterior a la fecha actual." };
  }

  if (options.maxMonths && to > addMonthsToDateValue(from, options.maxMonths)) {
    return { ok: false, error: MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE };
  }

  return { ok: true, from, to };
}

export function getDateRangeUtcBounds(from: string, to: string) {
  return {
    fromIso: new Date(`${from}T00:00:00.000-05:00`).toISOString(),
    toIso: new Date(`${to}T23:59:59.999-05:00`).toISOString(),
  };
}

export function formatDateForDisplay(value: string) {
  if (!isDateValue(value)) {
    return value || "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${value}T12:00:00.000-05:00`));
}

export function formatNumericDateForDisplay(value: string) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return value || "Sin fecha";
  }

  return `${pad(parsed.day)}/${pad(parsed.month)}/${parsed.year}`;
}

export function formatDateTimeForDisplay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatCompactDateTimeForDisplay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "Sin fecha";
  }

  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const day = getDateTimePart(parts, "day");
  const month = getDateTimePart(parts, "month").replace(/\.$/, "");
  const year = getDateTimePart(parts, "year");
  const hour = getDateTimePart(parts, "hour");
  const minute = getDateTimePart(parts, "minute");
  const dayPeriod = getDateTimePart(parts, "dayPeriod").replace(/[\u00a0\u202f]/g, " ").trim();
  const time = dayPeriod ? `${hour}:${minute} ${dayPeriod}` : `${hour}:${minute}`;

  return `${day} ${month} ${year} · ${time}`;
}
