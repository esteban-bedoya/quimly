import type { BillingPriceSnapshot } from "@/lib/billing/pricing";

export type BillingProviderName = "mercado_pago";

export type ProviderSubscriptionCheckoutRequest = {
  intentId: string;
  externalReference: string;
  companyId: string;
  payerEmail: string | null;
  price: BillingPriceSnapshot & {
    maxActiveLocations: number;
    monthlyTotalCop: number;
  };
  returnUrl: string;
};

export type ProviderSubscriptionCheckout = {
  providerSubscriptionId: string;
  checkoutUrl: string;
  providerStatus: string;
  providerCustomerId: string | null;
  providerPayerId: string | null;
  payerEmail: string | null;
  providerVersion: number | null;
  providerUpdatedAt: string | null;
  nextPaymentAt: string | null;
};

export type ProviderPayment = {
  providerPaymentId: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  externalReference: string | null;
  providerSubscriptionId: string | null;
  amountCop: number;
  currency: string;
  paymentMethodType: string | null;
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
  approvedAt: string | null;
  liveMode: boolean | null;
};

export type BillingProvider = {
  readonly name: BillingProviderName;
  createSubscriptionCheckout(request: ProviderSubscriptionCheckoutRequest): Promise<ProviderSubscriptionCheckout>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
};
