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

export type ProviderOneTimeCheckoutRequest = {
  intentId: string;
  externalReference: string;
  companyId: string;
  payerEmail: string | null;
  description: string;
  amountCop: number;
  returnUrl: string;
  expiresAt: string;
};

export type ProviderOneTimeCheckout = {
  providerCheckoutId: string;
  checkoutUrl: string;
};

export type ProviderPayment = {
  providerPaymentId: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  externalReference: string | null;
  providerSubscriptionId: string | null;
  amountCop: number;
  refundedAmountCop: number;
  currency: string;
  paymentMethodType: string | null;
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
  approvedAt: string | null;
  liveMode: boolean | null;
};

export type ProviderRefund = {
  providerRefundId: string;
  providerPaymentId: string;
  amountCop: number;
  providerStatus: string;
};

export type ProviderAuthorizedPayment = {
  providerInvoiceId: string;
  providerSubscriptionId: string;
  externalReference: string | null;
  providerStatus: string;
  summarizedStatus: string | null;
  amountCop: number;
  currency: string;
  debitAt: string | null;
  retryAttempt: number;
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
  providerPaymentId: string | null;
  providerPaymentStatus: string | null;
  providerPaymentStatusDetail: string | null;
};

export type ProviderSubscription = {
  providerSubscriptionId: string;
  externalReference: string | null;
  providerStatus: string;
  recurringAmountCop: number;
  currency: string;
  providerVersion: number | null;
  providerUpdatedAt: string | null;
  nextPaymentAt: string | null;
};

export type BillingProvider = {
  readonly name: BillingProviderName;
  createSubscriptionCheckout(request: ProviderSubscriptionCheckoutRequest): Promise<ProviderSubscriptionCheckout>;
  createOneTimeCheckout(request: ProviderOneTimeCheckoutRequest): Promise<ProviderOneTimeCheckout>;
  updateSubscriptionAmount(providerSubscriptionId: string, recurringAmountCop: number): Promise<ProviderSubscription>;
  updateSubscriptionPaymentMethod(
    providerSubscriptionId: string,
    cardToken: string,
  ): Promise<ProviderSubscription>;
  updateSubscriptionStatus(
    providerSubscriptionId: string,
    status: "paused" | "canceled",
  ): Promise<ProviderSubscription>;
  refundPayment(providerPaymentId: string, idempotencyKey: string): Promise<ProviderRefund>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  getAuthorizedPayment(providerInvoiceId: string): Promise<ProviderAuthorizedPayment>;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
};
