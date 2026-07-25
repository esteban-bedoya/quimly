"use client";

import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { DEFAULT_PHONE_COUNTRY, normalizePhoneCountry } from "@/lib/phone";

type CountryOption = {
  code: CountryCode;
  callingCode: string;
  flag: string;
  name: string;
  searchText: string;
};

type InternationalPhoneFieldProps = {
  id: string;
  label?: string;
  name?: string;
  countryName?: string;
  nationalName?: string;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  controlClassName?: string;
  errorClassName?: string;
};

const defaultControlClassName =
  "min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35";

const maxE164Digits = 15;
const maxFormattingCharacters = 8;
const countryMenuWidth = 304;
const countryMenuMargin = 16;
const countryMenuOffset = 8;

function countryToFlag(country: CountryCode) {
  const baseCodePoint = 127397;

  return String.fromCodePoint(
    ...Array.from(country).map((character) => baseCodePoint + character.charCodeAt(0)),
  );
}

function createCountryOptions() {
  const regionNames =
    typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["es"], { type: "region" }) : null;

  return getCountries()
    .map((country) => {
      const name = regionNames?.of(country) ?? country;
      const callingCode = getCountryCallingCode(country);
      const flag = countryToFlag(country);

      return {
        code: country,
        callingCode,
        flag,
        name,
        searchText: `${name} ${country} +${callingCode}`.toLowerCase(),
      } satisfies CountryOption;
    })
    .sort((firstCountry, secondCountry) => firstCountry.name.localeCompare(secondCountry.name, "es"));
}

function getInitialPhoneState(defaultValue: string | undefined) {
  const parsedPhone = defaultValue ? parsePhoneNumberFromString(defaultValue) : undefined;
  const country = parsedPhone?.country ?? DEFAULT_PHONE_COUNTRY;

  return {
    country,
    nationalNumber: parsedPhone?.formatNational() ?? "",
  };
}

function formatNationalInput(value: string, country: CountryCode) {
  return new AsYouType(country).input(value);
}

function parseInputPhone(value: string, country: CountryCode) {
  return parsePhoneNumberFromString(value, country);
}

function getMaxPhoneInputLength(country: CountryCode) {
  const callingCodeLength = getCountryCallingCode(country).length;
  const maxNationalDigits = Math.max(4, maxE164Digits - callingCodeLength);

  return maxNationalDigits + maxFormattingCharacters;
}

export function InternationalPhoneField({
  id,
  label = "Número de celular",
  name = "phone",
  countryName = "phoneCountry",
  nationalName = "phoneNational",
  placeholder = "Número nacional",
  defaultValue,
  value,
  onValueChange,
  required = true,
  disabled = false,
  className = "",
  labelClassName = "block text-sm font-medium text-[#12110f]",
  controlClassName = defaultControlClassName,
  errorClassName = "text-xs leading-5 text-[#8a2d1f]",
}: InternationalPhoneFieldProps) {
  const options = useMemo(() => createCountryOptions(), []);
  const initialPhoneValue = value ?? defaultValue;
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(() => getInitialPhoneState(initialPhoneValue).country);
  const [nationalNumber, setNationalNumber] = useState(() => getInitialPhoneState(initialPhoneValue).nationalNumber);
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [hasBlurred, setHasBlurred] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [countryMenuPosition, setCountryMenuPosition] = useState({ left: countryMenuMargin, top: countryMenuMargin });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const countryMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const countryButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find((option) => option.code === selectedCountry) ?? options[0];
  const parsedPhone = parseInputPhone(nationalNumber, selectedCountry);
  const isValidPhone = Boolean(parsedPhone?.isValid());
  const e164Phone = isValidPhone ? parsedPhone?.number ?? "" : "";
  const maxPhoneInputLength = getMaxPhoneInputLength(selectedCountry);
  const shouldShowError =
    (hasAttemptedSubmit || (hasBlurred && !isFocused)) && nationalNumber.trim().length > 0 && !isValidPhone;

  const filteredOptions = useMemo(() => {
    const normalizedSearch = countrySearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) => option.searchText.includes(normalizedSearch));
  }, [countrySearch, options]);

  useEffect(() => {
    if (value === undefined) {
      return;
    }

    const nextPhoneState = getInitialPhoneState(value);
    startTransition(() => {
      setSelectedCountry(nextPhoneState.country);
      setNationalNumber(nextPhoneState.nationalNumber);
    });
  }, [value]);

  useEffect(() => {
    if (!isValidPhone && nationalNumber.trim().length > 0) {
      return;
    }

    onValueChange?.(e164Phone);
  }, [e164Phone, isValidPhone, nationalNumber, onValueChange]);

  useEffect(() => {
    if (!isCountryMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!menuRef.current?.contains(target) && !countryMenuPanelRef.current?.contains(target)) {
        setIsCountryMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isCountryMenuOpen]);

  useEffect(() => {
    if (!isCountryMenuOpen) {
      return;
    }

    function syncCountryMenuPosition() {
      const buttonRect = countryButtonRef.current?.getBoundingClientRect();

      if (!buttonRect) {
        return;
      }

      const maxLeft = Math.max(countryMenuMargin, window.innerWidth - countryMenuWidth - countryMenuMargin);

      setCountryMenuPosition({
        left: Math.min(Math.max(buttonRect.left, countryMenuMargin), maxLeft),
        top: buttonRect.bottom + countryMenuOffset,
      });
    }

    syncCountryMenuPosition();
    window.addEventListener("resize", syncCountryMenuPosition);
    window.addEventListener("scroll", syncCountryMenuPosition, true);

    return () => {
      window.removeEventListener("resize", syncCountryMenuPosition);
      window.removeEventListener("scroll", syncCountryMenuPosition, true);
    };
  }, [isCountryMenuOpen]);

  useEffect(() => {
    const form = inputRef.current?.form;

    if (!form) {
      return;
    }

    function handleSubmit() {
      setHasAttemptedSubmit(true);
    }

    form.addEventListener("submit", handleSubmit);

    return () => {
      form.removeEventListener("submit", handleSubmit);
    };
  }, []);

  function handleCountryChange(country: CountryCode) {
    if (disabled) {
      return;
    }

    setSelectedCountry(country);
    setNationalNumber((currentValue) => formatNationalInput(currentValue, country));
    setIsCountryMenuOpen(false);
    setCountrySearch("");
  }

  function handleNationalNumberChange(value: string) {
    if (disabled) {
      return;
    }

    setHasAttemptedSubmit(false);

    const limitedValue = value.slice(0, maxPhoneInputLength);
    const formattedValue = formatNationalInput(limitedValue, selectedCountry).slice(0, maxPhoneInputLength);
    const parsedValue = parseInputPhone(formattedValue, selectedCountry);

    if (parsedValue?.country) {
      setSelectedCountry(normalizePhoneCountry(parsedValue.country));
    }

    setNationalNumber(formattedValue);
  }

  const countryMenuStyle = {
    "--country-menu-left": `${countryMenuPosition.left}px`,
    "--country-menu-top": `${countryMenuPosition.top}px`,
  } as CSSProperties;

  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>

      <input type="hidden" name={name} value={e164Phone} />
      <input type="hidden" name={countryName} value={selectedCountry} />

      <div className="grid grid-cols-[minmax(7rem,8rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)]">
        <div className="relative" ref={menuRef}>
          <button
            ref={countryButtonRef}
            type="button"
            aria-expanded={isCountryMenuOpen}
            aria-label={`${label}: país`}
            disabled={disabled}
            onClick={() => setIsCountryMenuOpen((currentValue) => !currentValue)}
            className={`${controlClassName} inline-flex min-w-0 items-center justify-center gap-3 text-left disabled:cursor-not-allowed disabled:bg-[#f7f8f9] disabled:text-[#5e6770]`}
          >
            <span aria-hidden="true" className="shrink-0 text-base">
              {selectedOption.flag}
            </span>
            <span className="shrink-0 font-semibold text-[#2a7f86]">+{selectedOption.callingCode}</span>
          </button>

          {isCountryMenuOpen && typeof document !== "undefined"
            ? createPortal(
                <>
              <div
                className="fixed inset-0 z-40 bg-[#12110f]/15 backdrop-blur-sm sm:hidden"
                onClick={() => setIsCountryMenuOpen(false)}
              />
              <div
                ref={countryMenuPanelRef}
                className="fixed left-1/2 top-1/2 z-50 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#12110f]/12 bg-white p-2 shadow-[0_18px_44px_rgba(18,17,15,0.18)] sm:left-[var(--country-menu-left)] sm:top-[var(--country-menu-top)] sm:w-[19rem] sm:translate-x-0 sm:translate-y-0"
                style={countryMenuStyle}
              >
                <input
                  type="search"
                  value={countrySearch}
                  onChange={(event) => setCountrySearch(event.target.value)}
                  placeholder="Buscar país"
                  className="mb-2 min-h-10 w-full rounded-xl border border-[#12110f]/12 bg-[#fbfaf7] px-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
                />

                <div className="max-h-[calc(100vh-15rem)] overflow-y-auto sm:max-h-64">
                  {filteredOptions.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => handleCountryChange(option.code)}
                      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        option.code === selectedCountry
                          ? "bg-[#e8f5f5] text-[#12110f]"
                          : "text-[#3d392f] hover:bg-[#f3eee6]"
                      }`}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="shrink-0 text-base">
                          {option.flag}
                        </span>
                        <span className="min-w-0 truncate">{option.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-[#2a7f86]">+{option.callingCode}</span>
                    </button>
                  ))}
                </div>
              </div>
                </>,
                document.body,
              )
            : null}
        </div>

        <input
          ref={inputRef}
          id={id}
          name={nationalName}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onBlur={() => {
            setHasBlurred(true);
            setIsFocused(false);
          }}
          onFocus={() => setIsFocused(true)}
          onChange={(event) => handleNationalNumberChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxPhoneInputLength}
          required={required}
          disabled={disabled}
          aria-invalid={shouldShowError}
          className={`${controlClassName} min-w-0 disabled:cursor-not-allowed disabled:bg-[#f7f8f9] disabled:text-[#5e6770]`}
        />
      </div>

      {shouldShowError ? (
        <p className={errorClassName} role="alert">
          Ingresa un número celular válido.
        </p>
      ) : null}
    </div>
  );
}
