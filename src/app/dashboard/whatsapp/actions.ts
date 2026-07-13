"use server";

import {
  configureOwnerWhatsAppChannel,
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

export async function configureWhatsAppChannel(
  _previousState: WhatsAppInboxActionState | undefined,
  formData: FormData,
): Promise<WhatsAppInboxActionState> {
  try {
    await configureOwnerWhatsAppChannel({
      companyId: readString(formData, "companyId").trim(),
      phone: readString(formData, "whatsappPhone"),
      isActive: formData.get("isActive") === "on",
    });

    return { success: "Canal de WhatsApp guardado." };
  } catch (error) {
    return { error: getSafeWhatsAppActionError(error, "No fue posible guardar el canal de WhatsApp.") };
  }
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
