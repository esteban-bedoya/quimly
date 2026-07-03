export function normalizePhoneNumber(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("whatsapp:+")) {
    return trimmedValue.replace("whatsapp:", "");
  }

  if (trimmedValue.startsWith("+")) {
    return trimmedValue;
  }

  const digitsOnly = trimmedValue.replace(/\D/g, "");

  if (digitsOnly.length === 10) {
    return `+57${digitsOnly}`;
  }

  if (digitsOnly.startsWith("57")) {
    return `+${digitsOnly}`;
  }

  return null;
}

export function normalizeOptionalEmail(value: string) {
  const normalizedEmail = value.trim().toLowerCase();
  return normalizedEmail || null;
}

export function formatPhoneForWhatsApp(value: string) {
  const phone = normalizePhoneNumber(value);
  return phone ? `whatsapp:${phone}` : null;
}
