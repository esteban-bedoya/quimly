"use server";

import {
  getSafeWhatsAppActionError,
  markOwnerWhatsAppConversationRead,
  sendOwnerWhatsAppReply,
} from "@/lib/whatsapp-inbox/service.server";
import { logServerError } from "@/lib/server/logging";

export type WhatsAppInboxActionState = {
  error?: string;
  success?: string;
};

export type WhatsAppConversationReadActionState = {
  error?: string;
  success?: true;
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

export async function markWhatsAppConversationRead(
  conversationId: string,
  readThrough: string,
): Promise<WhatsAppConversationReadActionState> {
  try {
    await markOwnerWhatsAppConversationRead({ conversationId, readThrough });
    return { success: true };
  } catch (error) {
    logServerError("whatsapp.conversation_read_failed", error, { conversationId });
    return { error: getSafeWhatsAppActionError(error, "No fue posible marcar la conversación como leída.") };
  }
}
