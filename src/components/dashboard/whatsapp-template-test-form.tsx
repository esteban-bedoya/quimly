"use client";

import { useState, type FormEvent } from "react";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; sid: string; status: string | null }
  | { kind: "error"; details: string };

function formatErrorDetails(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const response = body as { error?: unknown; twilioError?: unknown };
  const message = typeof response.error === "string" ? response.error : fallback;

  if (!response.twilioError) {
    return message;
  }

  return `${message}\n\n${JSON.stringify(response.twilioError, null, 2)}`;
}

export function WhatsAppTemplateTestForm() {
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const phone = String(formData.get("phone") ?? "").trim();
    const variableOne = String(formData.get("variableOne") ?? "").trim();

    setState({ kind: "loading" });

    try {
      const response = await fetch("/api/test/whatsapp-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          variables: { "1": variableOne },
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          kind: "error",
          details: formatErrorDetails(body, `La solicitud falló con HTTP ${response.status}.`),
        });
        return;
      }

      const result = body as { sid?: unknown; status?: unknown } | null;

      if (typeof result?.sid !== "string") {
        setState({
          kind: "error",
          details: "La respuesta de Twilio no incluyó un Message SID.",
        });
        return;
      }

      setState({
        kind: "success",
        sid: result.sid,
        status: typeof result.status === "string" ? result.status : null,
      });
    } catch (error) {
      setState({
        kind: "error",
        details: error instanceof Error ? error.message : "No fue posible comunicarse con el endpoint de prueba.",
      });
    }
  }

  const isLoading = state.kind === "loading";

  return (
    <section className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Herramientas de desarrollo</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
          Prueba de plantilla WhatsApp
        </h2>
        <p className="mt-3 text-sm leading-7 text-[#5b564f]">
          Envía la plantilla aprobada configurada en Twilio a un número con opt-in. Este envío es real.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid max-w-2xl gap-4">
        <div className="space-y-2">
          <label htmlFor="whatsapp-template-test-phone" className="block text-sm font-medium text-[#12110f]">
            Número destino
          </label>
          <input
            id="whatsapp-template-test-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+573001234567"
            required
            disabled={isLoading}
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-[#fcfbf8] px-4 py-3 text-sm text-[#12110f] outline-none transition placeholder:text-[#8f877d] focus:border-[#12110f]/35 disabled:cursor-not-allowed disabled:opacity-65"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="whatsapp-template-test-variable-one" className="block text-sm font-medium text-[#12110f]">
            Valor de {'{{1}}'}
          </label>
          <input
            id="whatsapp-template-test-variable-one"
            name="variableOne"
            type="text"
            placeholder="Cliente prueba"
            required
            disabled={isLoading}
            className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-[#fcfbf8] px-4 py-3 text-sm text-[#12110f] outline-none transition placeholder:text-[#8f877d] focus:border-[#12110f]/35 disabled:cursor-not-allowed disabled:opacity-65"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#12110f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d1b18] disabled:cursor-not-allowed disabled:opacity-70 sm:w-fit"
        >
          {isLoading ? "Enviando plantilla..." : "Enviar plantilla de prueba"}
        </button>
      </form>

      <div className="mt-5 max-w-2xl" aria-live="polite">
        {state.kind === "success" ? (
          <div className="rounded-2xl border border-[#5da87b]/24 bg-[#eefaf2] px-4 py-3 text-sm text-[#1d6e3f]">
            <p className="font-semibold">Twilio aceptó el envío.</p>
            <p className="mt-1">Message SID: <code className="font-semibold">{state.sid}</code></p>
            {state.status ? <p className="mt-1">Estado inicial: {state.status}</p> : null}
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className="rounded-2xl border border-[#c66b5c]/22 bg-[#fff1ee] px-4 py-3 text-sm text-[#8a2d1f]">
            <p className="font-semibold">No fue posible enviar la plantilla.</p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#6e261b]">
              {state.details}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
