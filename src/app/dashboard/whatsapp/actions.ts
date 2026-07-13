"use server";

import {
  getSafeWhatsAppActionError,
  sendOwnerWhatsAppReply,
} from "@/lib/whatsapp-inbox/service.server";

export type WhatsAppInboxActionState = {
  error?: string;
  success?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function sendWhatsAppReply(
  _previousState: WhatsAppInboxActionState | undefined,
  formData: FormData,
): Promise<WhatsAppInboxActionState> {
  try {
    await sendOwnerWhatsAppReply({
      conversationId: readString(formData, "conversationId").trim(),
      body: readString(formData, "body"),
    });

    return { success: "Mensaje enviado a WhatsApp." };
  } catch (error) {
    return { error: getSafeWhatsAppActionError(error, "No fue posible enviar el mensaje de WhatsApp.") };
  }
}
