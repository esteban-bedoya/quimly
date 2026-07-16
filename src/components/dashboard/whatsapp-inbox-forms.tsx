"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import {
  sendWhatsAppReply,
  type WhatsAppInboxActionState,
} from "@/app/dashboard/whatsapp/actions";

function ActionFeedback({ state }: { state: WhatsAppInboxActionState | undefined }) {
  if (!state?.error && !state?.success) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={`rounded-2xl px-4 py-3 text-sm ${
        state.error
          ? "border border-[#c66b5c]/22 bg-[#fff1ee] text-[#8a2d1f]"
          : "border border-[#5da87b]/24 bg-[#eefaf2] text-[#1d6e3f]"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function WhatsAppReplyForm({ conversationId }: { conversationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(sendWhatsAppReply, undefined);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state?.success]);

  return (
    <form ref={formRef} action={formAction} className="border-t border-[#12110f]/8 bg-[#fcfbf8] p-4 sm:p-5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="whatsapp-reply" className="sr-only">
        Respuesta de WhatsApp
      </label>
      <textarea
        id="whatsapp-reply"
        name="body"
        required
        maxLength={4096}
        rows={3}
        placeholder="Escribe una respuesta…"
        className="w-full resize-y rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm leading-6 text-[#12110f] outline-none transition placeholder:text-[#8f877d] focus:border-[#12110f]/35"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[#6b655d]">Solo texto en este MVP. WhatsApp puede requerir plantilla fuera de la ventana de 24 horas.</p>
        <SubmitButton idleLabel="Enviar" pendingLabel="Enviando..." />
      </div>
      <div className="mt-3">
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
