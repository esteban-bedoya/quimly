"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";

import { updateCompanyPaymentMethod, type AdminActionState } from "@/app/dashboard/actions";

type MercadoPagoCardFormData = {
  token?: string;
};

type MercadoPagoCardFormController = {
  getCardFormData(): MercadoPagoCardFormData;
  unmount?(): void;
};

type MercadoPagoBrowserSdk = {
  cardForm(configuration: Record<string, unknown>): MercadoPagoCardFormController;
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoBrowserSdk;
  }
}

const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY?.trim() ?? "";
const inputClassName =
  "min-h-11 w-full rounded-xl border border-[#d9dfe0] bg-white px-3 text-sm text-[#12110f] outline-none transition focus:border-[#48aeb8]";
const secureFieldClassName =
  "min-h-11 w-full rounded-xl border border-[#d9dfe0] bg-white px-3 py-2 transition focus-within:border-[#48aeb8]";

export function MercadoPagoPaymentMethodForm({
  companySlug,
  monthlyAmountCop,
  onCompleted,
  onCancel,
}: {
  companySlug: string;
  monthlyAmountCop: number;
  onCompleted: (state: AdminActionState) => void;
  onCancel: () => void;
}) {
  const [isSdkReady, setIsSdkReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.MercadoPago),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const cardFormRef = useRef<MercadoPagoCardFormController | null>(null);

  useEffect(() => {
    if (!isSdkReady || !mercadoPagoPublicKey || !window.MercadoPago || cardFormRef.current) {
      return;
    }

    const mercadoPago = new window.MercadoPago(mercadoPagoPublicKey, { locale: "es-CO" });
    const cardForm = mercadoPago.cardForm({
      amount: String(Math.max(monthlyAmountCop, 1)),
      iframe: true,
      form: {
        id: "quimly-payment-method-form",
        cardNumber: {
          id: "quimly-payment-method-card-number",
          placeholder: "Número de tarjeta",
        },
        expirationDate: {
          id: "quimly-payment-method-expiration",
          placeholder: "MM/AA",
        },
        securityCode: {
          id: "quimly-payment-method-security-code",
          placeholder: "CVV",
        },
        cardholderName: {
          id: "quimly-payment-method-cardholder-name",
          placeholder: "Nombre del titular",
        },
        issuer: {
          id: "quimly-payment-method-issuer",
          placeholder: "Banco emisor",
        },
        installments: {
          id: "quimly-payment-method-installments",
          placeholder: "Cuotas",
        },
        identificationType: {
          id: "quimly-payment-method-identification-type",
          placeholder: "Tipo de documento",
        },
        identificationNumber: {
          id: "quimly-payment-method-identification-number",
          placeholder: "Número de documento",
        },
        cardholderEmail: {
          id: "quimly-payment-method-email",
          placeholder: "Correo electrónico",
        },
      },
      callbacks: {
        onFormMounted: (error?: unknown) => {
          if (error) {
            setFormError("Mercado Pago no pudo cargar el formulario seguro.");
          }
        },
        onSubmit: (event: Event) => {
          event.preventDefault();
          const cardToken = cardForm.getCardFormData().token?.trim();

          if (!cardToken) {
            setFormError("Revisa los datos de la tarjeta antes de continuar.");
            return;
          }

          setFormError(null);
          startUpdateTransition(async () => {
            const state = await updateCompanyPaymentMethod({ companySlug, cardToken });

            if (state.error) {
              setFormError(state.error);
              return;
            }

            onCompleted(state);
          });
        },
      },
    });

    cardFormRef.current = cardForm;

    return () => {
      cardForm.unmount?.();
      cardFormRef.current = null;
    };
  }, [companySlug, isSdkReady, monthlyAmountCop, onCompleted]);

  if (!mercadoPagoPublicKey) {
    return (
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-[#8a2d1f]">
          Falta configurar NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY para mostrar el formulario seguro.
        </p>
        <button type="button" onClick={onCancel} className={inputClassName}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        strategy="afterInteractive"
        onLoad={() => setIsSdkReady(true)}
        onError={() => setFormError("No fue posible cargar MercadoPago.js.")}
      />

      <div>
        <p className="text-sm font-semibold text-[#12110f]">Nueva tarjeta</p>
        <p className="mt-1 text-sm leading-6 text-[#5e6770]">
          Los datos sensibles se capturan dentro de campos seguros de Mercado Pago. Quimly recibe únicamente un token temporal.
        </p>
      </div>

      <form id="quimly-payment-method-form" className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
          Número de tarjeta
          <div id="quimly-payment-method-card-number" className={secureFieldClassName} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
            Vencimiento
            <div id="quimly-payment-method-expiration" className={secureFieldClassName} />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
            Código de seguridad
            <div id="quimly-payment-method-security-code" className={secureFieldClassName} />
          </label>
        </div>

        <label htmlFor="quimly-payment-method-cardholder-name" className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
          Titular
          <input id="quimly-payment-method-cardholder-name" className={inputClassName} autoComplete="cc-name" />
        </label>

        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
          <label htmlFor="quimly-payment-method-identification-type" className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
            Documento
            <select id="quimly-payment-method-identification-type" className={inputClassName} />
          </label>
          <label htmlFor="quimly-payment-method-identification-number" className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
            Número
            <input id="quimly-payment-method-identification-number" className={inputClassName} inputMode="numeric" />
          </label>
        </div>

        <label htmlFor="quimly-payment-method-email" className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f777d]">
          Correo del titular
          <input id="quimly-payment-method-email" className={inputClassName} type="email" autoComplete="email" />
        </label>

        <select id="quimly-payment-method-issuer" className="hidden" aria-hidden="true" tabIndex={-1} />
        <select id="quimly-payment-method-installments" className="hidden" aria-hidden="true" tabIndex={-1} />

        {formError ? <p role="alert" className="text-sm leading-6 text-[#8a2d1f]">{formError}</p> : null}

        <button
          id="quimly-payment-method-submit"
          type="submit"
          disabled={!isSdkReady || isUpdating}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isUpdating ? "Actualizando..." : "Guardar nueva tarjeta"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isUpdating}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#d9dfe0] bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] disabled:opacity-55"
        >
          Volver
        </button>
      </form>
    </div>
  );
}
