"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { OperationalRecordStatusDot } from "@/components/ui/operational-record-status-dot";
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
  showMonthYearSelect?: boolean;
  minYear?: number;
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

type CalendarSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const weekdayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const emptyCompletedDateKeys: string[] = [];
const hour12Options = [12, ...Array.from({ length: 11 }, (_, index) => index + 1)];
const meridiemOptions = ["AM", "PM"] as const;
const monthYearSelectYearLookback = 50;

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

function getSelectableYearOptions(
  minParts: DateParts | null,
  maxParts: DateParts | null,
  fallbackParts: DateParts,
  minYear?: number,
) {
  const firstYear = Math.max(
    minYear ?? Number.NEGATIVE_INFINITY,
    minParts?.year ?? (maxParts?.year ?? fallbackParts.year) - monthYearSelectYearLookback,
  );
  const lastYear = maxParts?.year ?? fallbackParts.year;
  const yearCount = Math.max(1, lastYear - firstYear + 1);

  return Array.from({ length: yearCount }, (_, index) => firstYear + index);
}

function getSelectableMonthKeyForYear(
  year: number,
  preferredMonthIndex: number,
  minDateKey: number,
  maxDateKey: number,
) {
  const orderedMonthIndexes = [
    preferredMonthIndex,
    ...Array.from({ length: 12 }, (_, monthIndex) => monthIndex).filter((monthIndex) => monthIndex !== preferredMonthIndex),
  ];

  const selectableMonthIndex = orderedMonthIndexes.find((monthIndex) =>
    hasSelectableDayInMonth(getMonthKey({ year, monthIndex }), minDateKey, maxDateKey),
  );

  return typeof selectableMonthIndex === "number" ? getMonthKey({ year, monthIndex: selectableMonthIndex }) : null;
}

function getHour24(hour12: number, meridiem: (typeof meridiemOptions)[number]) {
  if (meridiem === "AM") {
    return hour12 === 12 ? 0 : hour12;
  }

  return hour12 === 12 ? 12 : hour12 + 12;
}

function CalendarDropdown({
  label,
  value,
  options,
  isOpen,
  compact,
  className = "",
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  options: CalendarSelectOption[];
  isOpen: boolean;
  compact: boolean;
  className?: string;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={onToggle}
        className={[
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white font-black text-neutral-950 outline-none transition hover:border-[#b8dfe4] focus:border-[#2a7f86] focus:ring-2 focus:ring-[#b8dfe4]/50 active:scale-[0.99]",
          compact ? "h-8 px-2 text-[11px]" : "h-10 px-3 text-xs",
        ].join(" ")}
      >
        <span className="truncate uppercase tracking-[0.08em]">{selectedLabel}</span>
        <span className={`shrink-0 text-[10px] text-[#2a7f86] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
          v
        </span>
      </button>

      {isOpen ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_18px_45px_rgba(17,24,22,0.14)]"
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }

                  onSelect(option.value);
                }}
                className={[
                  "flex min-h-8 w-full items-center justify-center rounded-lg px-2 text-[11px] font-black uppercase tracking-[0.08em] transition",
                  isSelected
                    ? "border border-[#b8dfe4] bg-[#f7fcfc] text-[#2a7f86]"
                    : option.disabled
                      ? "cursor-not-allowed text-neutral-300 line-through"
                      : "text-neutral-950 hover:bg-[#eefafb] hover:text-[#2a7f86]",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function DatePicker({
  value,
  min,
  max,
  onChange,
  compact = false,
  showMonthYearSelect = false,
  minYear,
}: DatePickerProps) {
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
  const [openMonthYearSelect, setOpenMonthYearSelect] = useState<"month" | "year" | null>(null);
  const visibleMonth = getMonthPartsFromKey(visibleMonthKey);
  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonth.year, visibleMonth.monthIndex),
    [visibleMonth.monthIndex, visibleMonth.year],
  );
  const canShowPreviousMonth = hasSelectableDayInMonth(visibleMonthKey - 1, minDateKey, maxDateKey);
  const canShowNextMonth = hasSelectableDayInMonth(visibleMonthKey + 1, minDateKey, maxDateKey);
  const selectableYearOptions = getSelectableYearOptions(minParts, maxParts, selectedParts, minYear);
  const selectableMonthOptions = monthLabels.map((monthLabel, monthIndex) => ({
    value: String(monthIndex),
    label: monthLabel,
    disabled: !hasSelectableDayInMonth(getMonthKey({ year: visibleMonth.year, monthIndex }), minDateKey, maxDateKey),
  }));
  const selectableYearDropdownOptions = [...selectableYearOptions].reverse().map((year) => ({
    value: String(year),
    label: String(year),
  }));

  function isDayDisabled(date: Date) {
    const dateKey = getDateKey(getDatePartsFromDate(date));
    return dateKey < minDateKey || dateKey > maxDateKey;
  }

  function selectDate(date: Date) {
    if (isDayDisabled(date)) {
      return;
    }

    onChange(clampDateValue(formatDateValue(getDatePartsFromDate(date)), min, max));
    setOpenMonthYearSelect(null);
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
          onClick={() => {
            setVisibleMonthKey((currentMonthKey) => currentMonthKey - 1);
            setOpenMonthYearSelect(null);
          }}
          className={[
            "grid place-items-center border border-neutral-200 bg-white font-black text-neutral-950 transition active:scale-[0.96] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300",
            compact ? "h-8 w-8 rounded-xl text-base" : "h-10 w-10 rounded-2xl text-lg",
          ].join(" ")}
          aria-label="Mes anterior"
        >
          {"<"}
        </button>
        {showMonthYearSelect ? (
          <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-2">
            <CalendarDropdown
              label="Seleccionar mes"
              value={String(visibleMonth.monthIndex)}
              options={selectableMonthOptions}
              isOpen={openMonthYearSelect === "month"}
              compact={compact}
              onToggle={() => setOpenMonthYearSelect((currentValue) => (currentValue === "month" ? null : "month"))}
              onSelect={(nextMonthIndex) => {
                setVisibleMonthKey(getMonthKey({ year: visibleMonth.year, monthIndex: Number(nextMonthIndex) }));
                setOpenMonthYearSelect(null);
              }}
            />
            <CalendarDropdown
              label="Seleccionar año"
              value={String(visibleMonth.year)}
              options={selectableYearDropdownOptions}
              isOpen={openMonthYearSelect === "year"}
              compact={compact}
              className="w-[5.5rem]"
              onToggle={() => setOpenMonthYearSelect((currentValue) => (currentValue === "year" ? null : "year"))}
              onSelect={(nextYear) => {
                const nextMonthKey = getSelectableMonthKeyForYear(
                  Number(nextYear),
                  visibleMonth.monthIndex,
                  minDateKey,
                  maxDateKey,
                );

                if (nextMonthKey !== null) {
                  setVisibleMonthKey(nextMonthKey);
                }
                setOpenMonthYearSelect(null);
              }}
            />
          </div>
        ) : (
          <p
            className={[
              "text-center font-black uppercase tracking-[0.12em] text-neutral-950",
              compact ? "text-xs" : "text-sm",
            ].join(" ")}
          >
            {monthLabels[visibleMonth.monthIndex]} {visibleMonth.year}
          </p>
        )}
        <button
          type="button"
          disabled={!canShowNextMonth}
          onClick={() => {
            setVisibleMonthKey((currentMonthKey) => currentMonthKey + 1);
            setOpenMonthYearSelect(null);
          }}
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

function TimeDropdown({
  selectedHour,
  isHourDisabled,
  onSelectHour,
}: {
  selectedHour: number;
  isHourDisabled: (hour: number) => boolean;
  onSelectHour: (hour: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);
  const timeOptions = useMemo(
    () =>
      meridiemOptions.flatMap((meridiem) =>
        hour12Options.map((hour12) => ({
          hour: getHour24(hour12, meridiem),
          label: `${String(hour12).padStart(2, "0")} ${meridiem}`,
        })),
      ),
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const listElement = listRef.current;
    const selectedOptionElement = selectedOptionRef.current;

    if (listElement && selectedOptionElement) {
      listElement.scrollTop =
        selectedOptionElement.offsetTop - (listElement.clientHeight - selectedOptionElement.clientHeight) / 2;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, selectedHour]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-neutral-300 bg-white px-3 text-base font-black text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 active:scale-[0.99]"
      >
        <span>{formatHourLabel(selectedHour)}</span>
        <span className={`text-sm transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
          ^
        </span>
      </button>

      {isOpen ? (
        <div
          ref={listRef}
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_18px_48px_rgba(17,24,22,0.16)]"
          role="listbox"
          aria-label="Hora"
        >
          {timeOptions.map(({ hour, label }) => {
            const isSelected = hour === selectedHour;
            const isDisabled = isHourDisabled(hour);

            return (
              <button
                key={hour}
                ref={isSelected ? selectedOptionRef : null}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) {
                    return;
                  }

                  onSelectHour(hour);
                  setIsOpen(false);
                }}
                className={[
                  "flex min-h-10 w-full items-center justify-center rounded-xl text-sm font-black transition",
                  isSelected
                    ? "bg-neutral-200 text-neutral-950 ring-1 ring-neutral-300"
                    : isDisabled
                      ? "cursor-not-allowed text-neutral-300 line-through"
                      : "text-neutral-950 hover:bg-neutral-100",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
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
          const recordStatus = isDisabled ? null : completedDateKeySet.has(recordDateKey) ? "complete" : "missing";

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
                <OperationalRecordStatusDot status={recordStatus} size="sm" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-neutral-500">Hora</span>
          <TimeDropdown selectedHour={selectedParts.hour} isHourDisabled={isHourDisabled} onSelectHour={selectHour} />
        </label>
      </div>

      <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-center font-mono text-sm font-black text-neutral-950">
        {formatDisplayValue(selectedParts)}
      </p>
    </div>
  );
}
