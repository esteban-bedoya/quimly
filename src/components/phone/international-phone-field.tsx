"use client";

import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { useEffect, useMemo, useRef, useState } from "react";

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
  defaultValue?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  controlClassName?: string;
  errorClassName?: string;
};

const defaultControlClassName =
  "min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35";

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

export function InternationalPhoneField({
  id,
  label = "Número de celular",
  name = "phone",
  countryName = "phoneCountry",
  nationalName = "phoneNational",
  defaultValue,
  required = true,
  className = "",
  labelClassName = "block text-sm font-medium text-[#12110f]",
  controlClassName = defaultControlClassName,
  errorClassName = "text-xs leading-5 text-[#8a2d1f]",
}: InternationalPhoneFieldProps) {
  const options = useMemo(() => createCountryOptions(), []);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(() => getInitialPhoneState(defaultValue).country);
  const [nationalNumber, setNationalNumber] = useState(() => getInitialPhoneState(defaultValue).nationalNumber);
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [wasTouched, setWasTouched] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((option) => option.code === selectedCountry) ?? options[0];
  const parsedPhone = parseInputPhone(nationalNumber, selectedCountry);
  const isValidPhone = Boolean(parsedPhone?.isValid());
  const e164Phone = isValidPhone ? parsedPhone?.number ?? "" : "";
  const shouldShowError = wasTouched && nationalNumber.trim().length > 0 && !isValidPhone;

  const filteredOptions = useMemo(() => {
    const normalizedSearch = countrySearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) => option.searchText.includes(normalizedSearch));
  }, [countrySearch, options]);

  useEffect(() => {
    if (!isCountryMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsCountryMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isCountryMenuOpen]);

  function handleCountryChange(country: CountryCode) {
    setSelectedCountry(country);
    setNationalNumber((currentValue) => formatNationalInput(currentValue, country));
    setIsCountryMenuOpen(false);
    setCountrySearch("");
  }

  function handleNationalNumberChange(value: string) {
    setWasTouched(true);

    const formattedValue = formatNationalInput(value, selectedCountry);
    const parsedValue = parseInputPhone(formattedValue, selectedCountry);

    if (parsedValue?.country) {
      setSelectedCountry(normalizePhoneCountry(parsedValue.country));
    }

    setNationalNumber(formattedValue);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>

      <input type="hidden" name={name} value={e164Phone} />
      <input type="hidden" name={countryName} value={selectedCountry} />

      <div className="grid gap-2 sm:grid-cols-[minmax(7.5rem,9rem)_1fr]">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-expanded={isCountryMenuOpen}
            aria-label={`${label}: país`}
            onClick={() => setIsCountryMenuOpen((currentValue) => !currentValue)}
            className={`${controlClassName} inline-flex items-center justify-center gap-3 text-left`}
          >
            <span aria-hidden="true" className="shrink-0 text-base">
              {selectedOption.flag}
            </span>
            <span className="shrink-0 font-semibold text-[#2a7f86]">+{selectedOption.callingCode}</span>
          </button>

          {isCountryMenuOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-[#12110f]/12 bg-white p-2 shadow-[0_18px_44px_rgba(18,17,15,0.18)]">
              <input
                type="search"
                value={countrySearch}
                onChange={(event) => setCountrySearch(event.target.value)}
                placeholder="Buscar país"
                className="mb-2 min-h-10 w-full rounded-xl border border-[#12110f]/12 bg-[#fbfaf7] px-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
              />

              <div className="max-h-64 overflow-y-auto">
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
          ) : null}
        </div>

        <input
          id={id}
          name={nationalName}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onBlur={() => setWasTouched(true)}
          onChange={(event) => handleNationalNumberChange(event.target.value)}
          placeholder="Número nacional"
          required={required}
          aria-invalid={shouldShowError}
          className={controlClassName}
        />
      </div>

      {shouldShowError ? (
        <p className={errorClassName} role="alert">
          Ingresa un número válido para el país seleccionado.
        </p>
      ) : null}
    </div>
  );
}
