"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { markWhatsAppConversationRead } from "@/app/dashboard/whatsapp/actions";

export function WhatsAppConversationReadMarker({
  conversationId,
  readThrough,
}: {
  conversationId: string;
  readThrough: string;
}) {
  const router = useRouter();
  const didMarkRead = useRef(false);

  useEffect(() => {
    if (didMarkRead.current) {
      return;
    }

    didMarkRead.current = true;
    let active = true;

    void markWhatsAppConversationRead(conversationId, readThrough).then((result) => {
      if (active && result.success) {
        router.refresh();
      }
    });

    return () => {
      active = false;
    };
  }, [conversationId, readThrough, router]);

  return null;
}
