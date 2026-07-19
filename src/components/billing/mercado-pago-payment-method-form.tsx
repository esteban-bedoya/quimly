"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { updateCompanyPaymentMethod, type AdminActionState } from "@/app/dashboard/actions";
import { MercadoPagoInfoCard } from "@/components/billing/mercado-pago-info-card";

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
const fieldLabelClassName = "text-[0.72rem] font-medium tracking-[0.01em] text-[#657078]";
const inputClassName =
  "h-11 w-full rounded-[0.9rem] border border-[#dce4e7] bg-[#fbfcfc] px-4 text-sm text-[#12110f] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(18,17,15,0.025)] transition duration-200 placeholder:text-[#9aa4a9] hover:border-[#c6d4d8] focus:border-[#3fa8b4] focus:bg-white focus:shadow-[0_0_0_4px_rgba(72,199,210,0.14),0_8px_20px_rgba(18,17,15,0.055)]";
const secureFieldClassName =
  "h-11 w-full overflow-hidden rounded-[0.9rem] border border-[#dce4e7] bg-[#fbfcfc] px-4 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(18,17,15,0.025)] transition duration-200 hover:border-[#c6d4d8] focus-within:border-[#3fa8b4] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(72,199,210,0.14),0_8px_20px_rgba(18,17,15,0.055)] [&>iframe]:!block [&>iframe]:!h-full [&>iframe]:!w-full";
const secondaryButtonClassName =
  "ui-pill-button-secondary w-full disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55";

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path strokeLinecap="round" d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path strokeLinecap="round" d="M12 14v2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

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
  const [isCardFormReady, setIsCardFormReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const cardFormRef = useRef<MercadoPagoCardFormController | null>(null);
  const isCardFormMountedRef = useRef(false);
  const isFormActiveRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const unmountTimerRef = useRef<number | null>(null);
  const disposeWhenMountedRef = useRef(false);

  const updatePaymentMethod = useCallback((cardToken: string) => {
    isSubmittingRef.current = true;
    setFormError(null);
    startUpdateTransition(async () => {
      try {
        const state = await updateCompanyPaymentMethod({ companySlug, cardToken });

        if (!isFormActiveRef.current) {
          return;
        }

        if (state.error) {
          setFormError(state.error);
          return;
        }

        onCompleted(state);
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }, [companySlug, onCompleted]);

  const unmountCardForm = useCallback(() => {
    const activeCardForm = cardFormRef.current;

    if (!activeCardForm || !isCardFormMountedRef.current) {
      return;
    }

    try {
      activeCardForm.unmount?.();
    } catch {
      // The SDK can complete an interrupted mount after React has cleaned up the component.
    }

    isCardFormMountedRef.current = false;
    if (isFormActiveRef.current) {
      setIsCardFormReady(false);
    }
    if (cardFormRef.current === activeCardForm) {
      cardFormRef.current = null;
    }
  }, []);

  const scheduleCardFormUnmount = useCallback(() => {
    isFormActiveRef.current = false;
    disposeWhenMountedRef.current = true;
    setIsCardFormReady(false);

    unmountTimerRef.current = window.setTimeout(() => {
      unmountTimerRef.current = null;
      unmountCardForm();
    }, 0);
  }, [unmountCardForm]);

  useEffect(() => {
    if (!isSdkReady || !mercadoPagoPublicKey || !window.MercadoPago) {
      return;
    }

    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    isFormActiveRef.current = true;
    disposeWhenMountedRef.current = false;

    if (cardFormRef.current) {
      return scheduleCardFormUnmount;
    }

    setIsCardFormReady(false);
    isCardFormMountedRef.current = false;

    const mercadoPago = new window.MercadoPago(mercadoPagoPublicKey, { locale: "es-CO" });
    let cardForm: MercadoPagoCardFormController;

    try {
      cardForm = mercadoPago.cardForm({
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
              isCardFormMountedRef.current = false;
              if (isFormActiveRef.current) {
                setIsCardFormReady(false);
                setFormError("Mercado Pago no pudo cargar el formulario seguro.");
              }
              return;
            }

            isCardFormMountedRef.current = true;

            if (disposeWhenMountedRef.current) {
              unmountCardForm();
              return;
            }

            setFormError(null);
          },
          onReady: () => {
            if (!isFormActiveRef.current || disposeWhenMountedRef.current) {
              return;
            }

            setIsCardFormReady(true);
          },
          onSubmit: (event: Event) => {
            event.preventDefault();

            if (isSubmittingRef.current || !isFormActiveRef.current || !isCardFormMountedRef.current) {
              return;
            }

            const activeCardForm = cardFormRef.current;
            let cardToken: string | undefined;

            try {
              cardToken = activeCardForm?.getCardFormData().token?.trim();
            } catch {
              setFormError("El formulario seguro se reinició. Espera un momento e inténtalo de nuevo.");
              return;
            }

            if (!cardToken) {
              setFormError("Revisa los datos de la tarjeta antes de continuar.");
              return;
            }

            updatePaymentMethod(cardToken);
          },
          onError: () => {
            if (isFormActiveRef.current) {
              setFormError("Mercado Pago no pudo validar los datos de la tarjeta. Revísalos e inténtalo de nuevo.");
            }
          },
          onFormUnmounted: () => {
            isCardFormMountedRef.current = false;
            if (isFormActiveRef.current) {
              setIsCardFormReady(false);
            }
          },
        },
      });
    } catch {
      window.setTimeout(() => {
        if (isFormActiveRef.current) {
          setFormError("Mercado Pago no pudo cargar el formulario seguro. Intenta nuevamente.");
        }
      }, 0);
      return;
    }

    cardFormRef.current = cardForm;

    return scheduleCardFormUnmount;
  }, [isSdkReady, monthlyAmountCop, scheduleCardFormUnmount, unmountCardForm, updatePaymentMethod]);

  if (!mercadoPagoPublicKey) {
    return (
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-[#8a2d1f]">
          Falta configurar NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY para mostrar el formulario seguro.
        </p>
        <button type="button" onClick={onCancel} className={secondaryButtonClassName}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        strategy="afterInteractive"
        onLoad={() => setIsSdkReady(true)}
        onError={() => {
          isCardFormMountedRef.current = false;
          setIsCardFormReady(false);
          setFormError("No fue posible cargar MercadoPago.js.");
        }}
      />

      <MercadoPagoInfoCard title="Nueva tarjeta" />

      <form
        id="quimly-payment-method-form"
        className="grid gap-4"
        aria-busy={isUpdating}
        noValidate
      >
        <label className="grid gap-1.5">
          <span className={fieldLabelClassName}>Número de tarjeta</span>
          <div id="quimly-payment-method-card-number" className={secureFieldClassName} />
        </label>

        <div className="grid grid-cols-2 gap-3.5">
          <label className="grid gap-1.5">
            <span className={fieldLabelClassName}>Vencimiento</span>
            <div id="quimly-payment-method-expiration" className={secureFieldClassName} />
          </label>
          <label className="grid gap-1.5">
            <span className={fieldLabelClassName}>Código de seguridad</span>
            <div id="quimly-payment-method-security-code" className={secureFieldClassName} />
          </label>
        </div>

        <label htmlFor="quimly-payment-method-cardholder-name" className="grid gap-1.5">
          <span className={fieldLabelClassName}>Nombre del titular</span>
          <input id="quimly-payment-method-cardholder-name" className={inputClassName} autoComplete="cc-name" />
        </label>

        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3.5">
          <label htmlFor="quimly-payment-method-identification-type" className="grid gap-1.5">
            <span className={fieldLabelClassName}>Tipo de documento</span>
            <div className="relative">
              <select
                id="quimly-payment-method-identification-type"
                className={`${inputClassName} appearance-none pr-10`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#718087]">
                <ChevronDownIcon />
              </span>
            </div>
          </label>
          <label htmlFor="quimly-payment-method-identification-number" className="grid gap-1.5">
            <span className={fieldLabelClassName}>Número de documento</span>
            <input id="quimly-payment-method-identification-number" className={inputClassName} inputMode="numeric" />
          </label>
        </div>

        <label htmlFor="quimly-payment-method-email" className="grid gap-1.5">
          <span className={fieldLabelClassName}>Correo electrónico del titular</span>
          <input id="quimly-payment-method-email" className={inputClassName} type="email" autoComplete="email" />
        </label>

        <select id="quimly-payment-method-issuer" className="hidden" aria-hidden="true" tabIndex={-1} />
        <select id="quimly-payment-method-installments" className="hidden" aria-hidden="true" tabIndex={-1} />

        {formError ? (
          <p role="alert" className="rounded-xl border border-[#f0d2cb] bg-[#fff7f5] px-3.5 py-3 text-sm leading-5 text-[#8a2d1f]">
            {formError}
          </p>
        ) : null}

        <button
          id="quimly-payment-method-submit"
          type="submit"
          disabled={!isSdkReady || !isCardFormReady || isUpdating}
          className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-[#12110f] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(18,17,15,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#2a2824] hover:shadow-[0_14px_28px_rgba(18,17,15,0.2)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          <LockIcon />
          {isUpdating ? "Actualizando..." : "Guardar nueva tarjeta"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isUpdating}
          className={secondaryButtonClassName}
        >
          Cancelar
        </button>
      </form>
    </div>
  );
}
