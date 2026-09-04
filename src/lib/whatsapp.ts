const WHATSAPP_NUMBER = "573045456754";
const WHATSAPP_MESSAGE =
  "¡Hola, Quimly! Me interesa su sistema para gestionar el cumplimiento INVIMA en mi restaurante. ¿Me podrían contar cómo sería el proceso de implementación?";

export function getQuimlyWhatsAppUrl(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const QUIMLY_WHATSAPP_URL = getQuimlyWhatsAppUrl(WHATSAPP_MESSAGE);
