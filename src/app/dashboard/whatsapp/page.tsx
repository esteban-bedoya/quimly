import Link from "next/link";

import { WhatsAppConversationReadMarker } from "@/components/dashboard/whatsapp-conversation-read-marker";
import { WhatsAppReplyForm } from "@/components/dashboard/whatsapp-inbox-forms";
import { WhatsAppInboxSync } from "@/components/dashboard/whatsapp-inbox-sync";
import { formatPhoneNumberForDisplay } from "@/lib/phone";
import { getOwnerWhatsAppInboxData, type WhatsAppMessageSummary } from "@/lib/whatsapp-inbox/service.server";

export const dynamic = "force-dynamic";

type WhatsAppPageProps = {
  searchParams: Promise<{ conversation?: string | string[] }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function conversationStatusLabel(status: "open" | "closed") {
  return status === "open" ? "Activa" : "Cerrada";
}

function messageStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();

  const labels: Record<string, string> = {
    accepted: "Aceptado",
    queued: "En cola",
    sending: "Enviando",
    sent: "Enviado",
    delivered: "Entregado",
    read: "Leído",
    received: "Recibido",
    failed: "Falló",
    undelivered: "No entregado",
  };

  return labels[normalized] ?? status;
}

function messageOriginLabel(message: WhatsAppMessageSummary) {
  if (message.direction === "inbound") {
    return "Cliente";
  }

  const labels: Record<string, string> = {
    document_expiry_reminder: "Vencimiento documental",
    weekly_operational_summary: "Resumen semanal",
    trial_welcome: "Bienvenida a prueba",
    trial_midpoint: "Mitad de prueba",
    trial_expired: "Prueba finalizada",
    founder_benefit_assigned: "Beneficio Founder",
    acknowledgement: "Acuse automático",
    manual: "Respuesta manual",
    template_test: "Prueba de plantilla",
    scheduled: "Mensaje automático",
  };

  return message.origin ? labels[message.origin] ?? "Mensaje automático" : "Mensaje enviado por Quimly";
}

function messageText(message: WhatsAppMessageSummary) {
  if (message.body.trim()) {
    return message.body;
  }

  return message.numMedia > 0 ? `Mensaje multimedia (${message.numMedia})` : "Mensaje sin texto";
}

export default async function WhatsAppDashboardPage({ searchParams }: WhatsAppPageProps) {
  const params = await searchParams;
  const selectedConversationId = typeof params.conversation === "string" ? params.conversation : null;
  const inbox = await getOwnerWhatsAppInboxData(selectedConversationId);
  const selectedConversation = inbox.selectedConversation;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe7_0%,#ebe4d7_100%)] px-5 py-6 sm:px-8 lg:px-10">
      <WhatsAppInboxSync initialEventId={inbox.latestEventId} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="w-fit rounded-full bg-[#12110f] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[#7ad9dd]">
                Owner · WhatsApp
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#12110f]">Bandeja de WhatsApp</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#565149] sm:text-base">
                Bandeja interna del WhatsApp Business de Quimly. Todo contacto nuevo genera una conversación y las respuestas salen por Twilio sin exponer credenciales al navegador.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-[#12110f]/14 bg-[#f3eee6] px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#eae2d4]"
            >
              Volver al dashboard
            </Link>
          </div>
        </section>

        <section className="grid min-h-[42rem] overflow-hidden rounded-[2rem] border border-[#12110f]/10 bg-white shadow-[0_20px_60px_rgba(18,17,15,0.08)] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="border-b border-[#12110f]/8 bg-[#fcfbf8] lg:border-r lg:border-b-0">
            <div className="border-b border-[#12110f]/8 px-5 py-5 sm:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Conversaciones</p>
              <p className="mt-1 text-sm text-[#686159]">
                {inbox.conversations.length} recientes · {inbox.unreadConversationCount} no leídas
              </p>
            </div>
            <div className="max-h-[32rem] divide-y divide-[#12110f]/8 overflow-y-auto lg:max-h-[46rem]">
              {inbox.conversations.length ? (
                inbox.conversations.map((conversation) => {
                  const isSelected = conversation.id === selectedConversation?.id;
                  const contactLabel = conversation.contactName || formatPhoneNumberForDisplay(conversation.contactPhone);

                  return (
                    <Link
                      key={conversation.id}
                      href={`/dashboard/whatsapp?conversation=${conversation.id}`}
                      className={`block px-5 py-4 transition sm:px-6 ${
                        isSelected ? "bg-[#e8f5f5]" : "hover:bg-[#f4efe7]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#12110f]">{contactLabel}</p>
                          {conversation.contactName ? (
                            <p className="mt-0.5 text-xs text-[#6b655d]">{formatPhoneNumberForDisplay(conversation.contactPhone)}</p>
                          ) : null}
                        </div>
                        <time className="shrink-0 text-[0.68rem] text-[#756e65]" dateTime={conversation.lastMessageAt}>
                          {formatDate(conversation.lastMessageAt)}
                        </time>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#5d574f]">
                        {conversation.lastMessagePreview || "Mensaje sin texto"}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-[#2a7f86]">WhatsApp Quimly</span>
                        <div className="flex items-center gap-2">
                          {conversation.isUnread ? (
                            <span className="rounded-full bg-[#fff0be] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[#805600]">
                              Nuevo
                            </span>
                          ) : null}
                          <span className="rounded-full bg-[#dff3e6] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[#265b38]">
                            {conversationStatusLabel(conversation.status)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="px-5 py-10 text-sm leading-7 text-[#6b655d] sm:px-6">
                  Todavía no hay conversaciones. El primer mensaje válido recibido por Twilio creará el contacto y la conversación automáticamente.
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-[34rem] flex-col">
            {selectedConversation ? (
              <>
                {selectedConversation.isUnread && selectedConversation.lastInboundAt ? (
                  <WhatsAppConversationReadMarker
                    key={selectedConversation.id}
                    conversationId={selectedConversation.id}
                    readThrough={selectedConversation.lastInboundAt}
                  />
                ) : null}
                <header className="border-b border-[#12110f]/8 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#12110f]">
                        {selectedConversation.contactName || formatPhoneNumberForDisplay(selectedConversation.contactPhone)}
                      </h2>
                      <p className="mt-1 text-sm text-[#625c53]">{formatPhoneNumberForDisplay(selectedConversation.contactPhone)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-semibold text-[#12110f]">WhatsApp interno Quimly</p>
                      <p className="mt-1 text-xs text-[#756e65]">{conversationStatusLabel(selectedConversation.status)}</p>
                    </div>
                  </div>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#fcfbf8_100%)] p-5 sm:p-6">
                  {inbox.messages.length ? (
                    inbox.messages.map((message) => {
                      const isOutbound = message.direction === "outbound";

                      return (
                        <article key={message.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[88%] rounded-[1.35rem] px-4 py-3 sm:max-w-[74%] ${
                              isOutbound
                                ? "rounded-br-md bg-[#12110f] text-white"
                                : "rounded-bl-md border border-[#12110f]/10 bg-white text-[#12110f]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{messageText(message)}</p>
                            <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] ${isOutbound ? "text-white/65" : "text-[#756e65]"}`}>
                              <time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time>
                              <span>·</span>
                              <span>{messageOriginLabel(message)}</span>
                              <span>·</span>
                              <span>{messageStatusLabel(message.twilioStatus)}</span>
                              {message.errorCode ? <span>· Error {message.errorCode}</span> : null}
                            </div>
                            {message.errorMessage ? (
                              <p className={`mt-2 text-xs leading-5 ${isOutbound ? "text-[#ffc9bc]" : "text-[#a04a3d]"}`}>
                                {message.errorMessage}
                              </p>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="py-12 text-center text-sm text-[#6b655d]">Esta conversación aún no tiene mensajes visibles.</p>
                  )}
                </div>
                <WhatsAppReplyForm conversationId={selectedConversation.id} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Bandeja</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Selecciona una conversación</h2>
                  <p className="mt-3 text-sm leading-7 text-[#625c53]">El historial y el formulario de respuesta aparecerán aquí.</p>
                </div>
              </div>
            )}
          </section>
        </section>

        <section className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Canal interno</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">WhatsApp Senders detectados</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#625c53]">
            Quimly registra automáticamente el número destinatario de cada webhook firmado. No requiere asociarlo a una empresa ni configurar contactos previamente.
          </p>

          <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-[#12110f]/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f4efe7] text-xs uppercase tracking-[0.14em] text-[#655f57]">
                <tr>
                  <th className="px-5 py-3">Sender</th>
                  <th className="px-5 py-3">Uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12110f]/8 bg-white">
                {inbox.channels.length ? (
                  inbox.channels.map((channel) => (
                    <tr key={channel.id}>
                      <td className="px-5 py-4 font-semibold text-[#12110f]">{formatPhoneNumberForDisplay(channel.whatsappPhone)}</td>
                      <td className="px-5 py-4 text-[#5d574f]">Canal interno de Quimly</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-[#6b655d]">
                      El sender aparecerá automáticamente al recibir el primer mensaje firmado por Twilio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
