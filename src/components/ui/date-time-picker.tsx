"use client";

import { useMemo, useState } from "react";

import { formatDateKeyFromParts } from "@/lib/operational-record-dates";

type DateTimePickerProps = {
  completedDateKeys?: string[];
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
};

type DatePickerProps = {
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

type DateParts = {
  year: number;
  monthIndex: number;
  day: number;
};

type DateTimeParts = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
};

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const weekdayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const emptyCompletedDateKeys: string[] = [];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateTimeValue(value: string): DateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, monthIndex, day, hour, minute);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return { year, monthIndex, day, hour, minute };
}

function parseDateValue(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, monthIndex, day };
}

function formatDateTimeValue(parts: DateTimeParts) {
  return `${parts.year}-${pad(parts.monthIndex + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatDateValue(parts: DateParts) {
  return `${parts.year}-${pad(parts.monthIndex + 1)}-${pad(parts.day)}`;
}

function formatHourLabel(hour: number) {
  const hour12 = hour % 12 || 12;
  const meridiem = hour >= 12 ? "PM" : "AM";

  return `${pad(hour12)} ${meridiem}`;
}

function formatTimeLabel(parts: Pick<DateTimeParts, "hour">) {
  const hour12 = parts.hour % 12 || 12;
  const meridiem = parts.hour >= 12 ? "PM" : "AM";

  return `${pad(hour12)} ${meridiem}`;
}

function formatDisplayValue(parts: DateTimeParts) {
  return `${pad(parts.day)} ${monthLabels[parts.monthIndex]} ${parts.year} - ${formatTimeLabel(parts)}`;
}

function getDateKey(parts: Pick<DateTimeParts, "year" | "monthIndex" | "day">) {
  return parts.year * 10_000 + (parts.monthIndex + 1) * 100 + parts.day;
}

function getMonthKey(parts: Pick<DateTimeParts, "year" | "monthIndex">) {
  return parts.year * 12 + parts.monthIndex;
}

function getDatePartsFromDate(date: Date) {
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
  };
}

function getMonthPartsFromKey(monthKey: number) {
  return {
    year: Math.floor(monthKey / 12),
    monthIndex: monthKey % 12,
  };
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDateTimeValue(value: string, min: string, max: string) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function clampDateValue(value: string, min?: string, max?: string) {
  if (min && value < min) {
    return min;
  }

  if (max && value > max) {
    return max;
  }

  return value;
}

function buildCalendarCells(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const leadingEmptyCells = (firstDay.getDay() + 6) % 7;
  const cells: Array<Date | null> = Array.from({ length: leadingEmptyCells }, () => null);
  const daysInMonth = getDaysInMonth(year, monthIndex);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function hasSelectableDayInMonth(monthKey: number, minDateKey: number, maxDateKey: number) {
  const { year, monthIndex } = getMonthPartsFromKey(monthKey);
  const firstDateKey = getDateKey({ year, monthIndex, day: 1 });
  const lastDateKey = getDateKey({ year, monthIndex, day: getDaysInMonth(year, monthIndex) });

  return lastDateKey >= minDateKey && firstDateKey <= maxDateKey;
}

function getHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => hour);
}

export function DatePicker({ value, min, max, onChange, compact = false }: DatePickerProps) {
  const todayParts = {
    year: new Date().getFullYear(),
    monthIndex: new Date().getMonth(),
    day: new Date().getDate(),
  };
  const minParts = parseDateValue(min ?? "");
  const maxParts = parseDateValue(max ?? "");
  const valueParts = parseDateValue(value);
  const selectedParts = valueParts ?? maxParts ?? todayParts;
  const selectedDateKey = valueParts ? getDateKey(valueParts) : null;
  const minDateKey = minParts ? getDateKey(minParts) : Number.NEGATIVE_INFINITY;
  const maxDateKey = maxParts ? getDateKey(maxParts) : Number.POSITIVE_INFINITY;
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => getMonthKey(selectedParts));
  const visibleMonth = getMonthPartsFromKey(visibleMonthKey);
  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonth.year, visibleMonth.monthIndex),
    [visibleMonth.monthIndex, visibleMonth.year],
  );
  const canShowPreviousMonth = hasSelectableDayInMonth(visibleMonthKey - 1, minDateKey, maxDateKey);
  const canShowNextMonth = hasSelectableDayInMonth(visibleMonthKey + 1, minDateKey, maxDateKey);

  function isDayDisabled(date: Date) {
    const dateKey = getDateKey(getDatePartsFromDate(date));
    return dateKey < minDateKey || dateKey > maxDateKey;
  }

  function selectDate(date: Date) {
    if (isDayDisabled(date)) {
      return;
    }

    onChange(clampDateValue(formatDateValue(getDatePartsFromDate(date)), min, max));
  }

  return (
    <div
      className={[
        "grid border border-neutral-200 bg-white text-neutral-950 shadow-[0_24px_80px_rgba(17,24,22,0.18)]",
        compact ? "gap-3 rounded-2xl p-2.5" : "gap-4 rounded-3xl p-3",
      ].join(" ")}
    >
      <div className={`flex items-center justify-between gap-3 ${compact ? "min-h-9" : "min-h-11"}`}>
        <button
          type="button"
          disabled={!canShowPreviousMonth}
          onClick={() => setVisibleMonthKey((currentMonthKey) => currentMonthKey - 1)}
          className={[
            "grid place-items-center border border-neutral-200 bg-white font-black text-neutral-950 transition active:scale-[0.96] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300",
            compact ? "h-8 w-8 rounded-xl text-base" : "h-10 w-10 rounded-2xl text-lg",
          ].join(" ")}
          aria-label="Mes anterior"
        >
          {"<"}
        </button>
        <p
          className={[
            "text-center font-black uppercase tracking-[0.12em] text-neutral-950",
            compact ? "text-xs" : "text-sm",
          ].join(" ")}
        >
          {monthLabels[visibleMonth.monthIndex]} {visibleMonth.year}
        </p>
        <button
          type="button"
          disabled={!canShowNextMonth}
          onClick={() => setVisibleMonthKey((currentMonthKey) => currentMonthKey + 1)}
          className={[
            "grid place-items-center border border-neutral-200 bg-white font-black text-neutral-950 transition active:scale-[0.96] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300",
            compact ? "h-8 w-8 rounded-xl text-base" : "h-10 w-10 rounded-2xl text-lg",
          ].join(" ")}
          aria-label="Mes siguiente"
        >
          {">"}
        </button>
      </div>

      <div className={`grid grid-cols-7 ${compact ? "gap-0.5" : "gap-1"}`}>
        {weekdayLabels.map((weekdayLabel) => (
          <span
            key={weekdayLabel}
            className={[
              "text-center font-black uppercase tracking-[0.08em] text-neutral-500",
              compact ? "py-0.5 text-[9px]" : "py-1 text-[10px]",
            ].join(" ")}
          >
            {weekdayLabel}
          </span>
        ))}

        {calendarCells.map((date, index) => {
          if (!date) {
            return <span key={`empty-${index}`} className="aspect-square" aria-hidden="true" />;
          }

          const dayParts = getDatePartsFromDate(date);
          const dateKey = getDateKey(dayParts);
          const isSelected = dateKey === selectedDateKey;
          const isDisabled = isDayDisabled(date);

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isDisabled}
              onClick={() => selectDate(date)}
              className={[
                "flex aspect-square items-center justify-center border font-black transition active:scale-[0.94]",
                compact ? "rounded-xl text-xs" : "rounded-2xl text-sm",
                isSelected
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : isDisabled
                    ? "cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-300 line-through"
                    : "border-neutral-200 bg-white text-neutral-950 hover:border-neutral-950 active:bg-neutral-100",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              {dayParts.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateTimePicker({
  completedDateKeys = emptyCompletedDateKeys,
  value,
  min,
  max,
  onChange,
}: DateTimePickerProps) {
  const minParts = parseDateTimeValue(min);
  const maxParts = parseDateTimeValue(max);
  const fallbackParts = maxParts ?? parseDateTimeValue(value) ?? {
    year: new Date().getFullYear(),
    monthIndex: new Date().getMonth(),
    day: new Date().getDate(),
    hour: new Date().getHours(),
    minute: 0,
  };
  const selectedParts = { ...(parseDateTimeValue(value) ?? fallbackParts), minute: 0 };
  const selectedDateKey = getDateKey(selectedParts);
  const minDateKey = minParts ? getDateKey(minParts) : Number.NEGATIVE_INFINITY;
  const maxDateKey = maxParts ? getDateKey(maxParts) : Number.POSITIVE_INFINITY;
  const completedDateKeySet = useMemo(() => new Set(completedDateKeys), [completedDateKeys]);
  const hourOptions = useMemo(() => getHourOptions(), []);
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => getMonthKey(selectedParts));
  const visibleMonth = getMonthPartsFromKey(visibleMonthKey);
  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonth.year, visibleMonth.monthIndex),
    [visibleMonth.monthIndex, visibleMonth.year],
  );
  const canShowPreviousMonth = hasSelectableDayInMonth(visibleMonthKey - 1, minDateKey, maxDateKey);
  const canShowNextMonth = hasSelectableDayInMonth(visibleMonthKey + 1, minDateKey, maxDateKey);

  function isDayDisabled(date: Date) {
    const dateKey = getDateKey(getDatePartsFromDate(date));
    return dateKey < minDateKey || dateKey > maxDateKey;
  }

  function isHourDisabled(hour: number) {
    const startOfHour = formatDateTimeValue({ ...selectedParts, hour, minute: 0 });
    const endOfHour = formatDateTimeValue({ ...selectedParts, hour, minute: 59 });

    return endOfHour < min || startOfHour > max;
  }

  function selectDate(date: Date) {
    if (isDayDisabled(date)) {
      return;
    }

    const nextValue = formatDateTimeValue({
      ...selectedParts,
      ...getDatePartsFromDate(date),
      minute: 0,
    });

    onChange(clampDateTimeValue(nextValue, min, max));
  }

  function selectHour(hour: number) {
    const nextValue = formatDateTimeValue({ ...selectedParts, hour, minute: 0 });
    onChange(clampDateTimeValue(nextValue, min, max));
  }

  return (
    <div className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-3 text-neutral-950">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <button
          type="button"
          disabled={!canShowPreviousMonth}
          onClick={() => setVisibleMonthKey((currentMonthKey) => currentMonthKey - 1)}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-neutral-200 bg-white text-lg font-black text-neutral-950 transition active:scale-[0.96] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
          aria-label="Mes anterior"
        >
          {"<"}
        </button>
        <p className="text-center text-sm font-black uppercase tracking-[0.12em] text-neutral-950">
          {monthLabels[visibleMonth.monthIndex]} {visibleMonth.year}
        </p>
        <button
          type="button"
          disabled={!canShowNextMonth}
          onClick={() => setVisibleMonthKey((currentMonthKey) => currentMonthKey + 1)}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-neutral-200 bg-white text-lg font-black text-neutral-950 transition active:scale-[0.96] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
          aria-label="Mes siguiente"
        >
          {">"}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((weekdayLabel) => (
          <span key={weekdayLabel} className="py-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-neutral-500">
            {weekdayLabel}
          </span>
        ))}

        {calendarCells.map((date, index) => {
          if (!date) {
            return <span key={`empty-${index}`} className="aspect-square" aria-hidden="true" />;
          }

          const dayParts = getDatePartsFromDate(date);
          const dateKey = getDateKey(dayParts);
          const recordDateKey = formatDateKeyFromParts(dayParts);
          const isSelected = dateKey === selectedDateKey;
          const isDisabled = isDayDisabled(date);
          const recordStatus = isDisabled ? null : completedDateKeySet.has(recordDateKey) ? "completed" : "pending";

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isDisabled}
              onClick={() => selectDate(date)}
              className={[
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-black transition active:scale-[0.94]",
                isSelected
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : isDisabled
                    ? "cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-300 line-through"
                    : "border-neutral-200 bg-white text-neutral-950 hover:border-neutral-950 active:bg-neutral-100",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              <span>{dayParts.day}</span>
              {recordStatus ? (
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    recordStatus === "completed" ? "bg-green-500" : "animate-pulse bg-red-500",
                  ].join(" ")}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-neutral-500">Hora</span>
          <select
            value={selectedParts.hour}
            onChange={(event) => selectHour(Number(event.target.value))}
            className="min-h-12 rounded-2xl border border-neutral-300 bg-white px-3 text-base font-black text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 active:scale-[0.99]"
          >
            {hourOptions.map((hour) => (
              <option key={hour} value={hour} disabled={isHourDisabled(hour)}>
                {formatHourLabel(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-center font-mono text-sm font-black text-neutral-950">
        {formatDisplayValue(selectedParts)}
      </p>
    </div>
  );
}
