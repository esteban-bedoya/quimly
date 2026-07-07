import {
  getCountries,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
  type E164Number,
} from "libphonenumber-js";

export type E164PhoneNumber = E164Number;
export type PhoneCountryCode = CountryCode;

export const DEFAULT_PHONE_COUNTRY: PhoneCountryCode = "CO";

const supportedPhoneCountries = new Set<string>(getCountries());

export function normalizePhoneCountry(country: string | null | undefined): PhoneCountryCode {
  const normalizedCountry = country?.trim().toUpperCase();

  if (normalizedCountry && supportedPhoneCountries.has(normalizedCountry) && isSupportedCountry(normalizedCountry)) {
    return normalizedCountry;
  }

  return DEFAULT_PHONE_COUNTRY;
}

function stripTwilioWhatsAppPrefix(value: string) {
  const trimmedValue = value.trim();
  const twilioPrefix = "whatsapp:";

  return trimmedValue.toLowerCase().startsWith(twilioPrefix)
    ? trimmedValue.slice(twilioPrefix.length).trim()
    : trimmedValue;
}

export function normalizePhoneNumber(value: string, country?: string | null): E164PhoneNumber | null {
  const trimmedValue = stripTwilioWhatsAppPrefix(value);

  if (!trimmedValue) {
    return null;
  }

  const phoneNumber = parsePhoneNumberFromString(
    trimmedValue,
    country ? normalizePhoneCountry(country) : undefined,
  );

  if (!phoneNumber?.isValid()) {
    return null;
  }

  return phoneNumber.number;
}

export function normalizeInternationalPhoneInput({
  phone,
  country,
  nationalNumber,
}: {
  phone?: string | null;
  country?: string | null;
  nationalNumber?: string | null;
}) {
  const normalizedNationalNumber = nationalNumber?.trim();

  if (normalizedNationalNumber) {
    return normalizePhoneNumber(normalizedNationalNumber, normalizePhoneCountry(country));
  }

  return phone ? normalizePhoneNumber(phone) : null;
}

export function isE164PhoneNumber(value: string): value is E164PhoneNumber {
  return normalizePhoneNumber(value) === value;
}

export function formatPhoneNumberForDisplay(value: string) {
  const phone = normalizePhoneNumber(value);
  return phone ? parsePhoneNumberFromString(phone)?.formatInternational() ?? phone : value;
}

export function normalizeOptionalEmail(value: string) {
  const normalizedEmail = value.trim().toLowerCase();
  return normalizedEmail || null;
}

export function formatPhoneForWhatsApp(value: string) {
  const phone = normalizePhoneNumber(value);
  return phone ? `whatsapp:${phone}` : null;
}
