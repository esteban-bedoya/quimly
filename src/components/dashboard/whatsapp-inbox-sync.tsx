"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TransientFeedbackToast } from "@/components/ui/transient-feedback-toast";
import type { WhatsAppInboxSyncEvent, WhatsAppInboxSyncState } from "@/types/whatsapp-inbox";

type InboxToast = {
  title: string;
  detail: string;
};

function canPollInbox() {
  return document.visibilityState === "visible" && navigator.onLine;
}

function getInboundToast(events: WhatsAppInboxSyncEvent[]): InboxToast | null {
  const inboundEvents = events.filter((event) => event.type === "inbound_message");

  if (!inboundEvents.length) {
    return null;
  }

  const latestEvent = inboundEvents.at(-1)!;
  const contact = latestEvent.contactName?.trim() || latestEvent.contactPhone || "un cliente";

  if (inboundEvents.length > 1) {
    return {
      title: `${inboundEvents.length} mensajes nuevos`,
      detail: `El más reciente es de ${contact}.`,
    };
  }

  return {
    title: latestEvent.isNewConversation ? "Nueva conversación de WhatsApp" : "Nuevo mensaje de WhatsApp",
    detail: latestEvent.messagePreview?.trim() || `Mensaje recibido de ${contact}.`,
  };
}

function playInboundNotificationSound(audioContext: AudioContext | null) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startedAt = audioContext.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, startedAt);
  oscillator.frequency.setValueAtTime(1_100, startedAt + 0.1);
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.22);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startedAt);
  oscillator.stop(startedAt + 0.24);
}

export function WhatsAppInboxSync({ initialEventId }: { initialEventId: number }) {
  const router = useRouter();
  const latestEventId = useRef(initialEventId);
  const firstPoll = useRef(true);
  const isRequestInFlight = useRef(false);
  const hasReportedPollingFailure = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const [toast, setToast] = useState<InboxToast | null>(null);

  useEffect(() => {
    latestEventId.current = Math.max(latestEventId.current, initialEventId);
  }, [initialEventId]);

  const unlockAudio = useCallback(() => {
    if (!("AudioContext" in window)) {
      return;
    }

    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    void audioContext.current.resume().catch(() => undefined);
  }, []);

  const poll = useCallback(async () => {
    if (!canPollInbox() || isRequestInFlight.current) {
      return;
    }

    isRequestInFlight.current = true;
    const reportPollingFailure = (error: unknown) => {
      if (!hasReportedPollingFailure.current) {
        console.error("No fue posible sincronizar la bandeja de WhatsApp.", error);
        hasReportedPollingFailure.current = true;
      }
    };

    try {
      const response = await fetch(`/api/dashboard/whatsapp/sync?after=${latestEventId.current}`, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        reportPollingFailure(new Error(`El endpoint de sincronización respondió ${response.status}.`));
        return;
      }

      const result = (await response.json()) as WhatsAppInboxSyncState;

      if (!Array.isArray(result.events) || !Number.isSafeInteger(result.latestEventId)) {
        reportPollingFailure(new Error("El endpoint de sincronización devolvió una respuesta inválida."));
        return;
      }

      hasReportedPollingFailure.current = false;

      const isFirstPoll = firstPoll.current;
      firstPoll.current = false;

      if (!result.events.length) {
        return;
      }

      latestEventId.current = Math.max(latestEventId.current, result.latestEventId);

      if (!isFirstPoll) {
        const nextToast = getInboundToast(result.events);

        if (nextToast) {
          setToast(nextToast);
          playInboundNotificationSound(audioContext.current);
        }
      }

      router.refresh();
    } catch (error) {
      reportPollingFailure(error);
    } finally {
      isRequestInFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    let intervalId: number | undefined;

    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const startPolling = () => {
      stopPolling();

      if (!canPollInbox()) {
        return;
      }

      void poll();
      intervalId = window.setInterval(() => {
        void poll();
      }, 1_000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    window.addEventListener("focus", startPolling);
    window.addEventListener("online", startPolling);
    window.addEventListener("offline", stopPolling);
    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling();

    return () => {
      stopPolling();
      window.removeEventListener("focus", startPolling);
      window.removeEventListener("online", startPolling);
      window.removeEventListener("offline", stopPolling);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void audioContext.current?.close();
      audioContext.current = null;
    };
  }, [poll, unlockAudio]);

  if (!toast) {
    return null;
  }

  return (
    <TransientFeedbackToast
      title={toast.title}
      message={toast.detail}
      onDismiss={() => setToast(null)}
    />
  );
}
