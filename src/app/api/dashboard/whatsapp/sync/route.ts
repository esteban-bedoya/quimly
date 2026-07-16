import { logServerError } from "@/lib/server/logging";
import { getOwnerWhatsAppInboxSyncState } from "@/lib/whatsapp-inbox/service.server";

export const dynamic = "force-dynamic";

function getAfterEventId(request: Request) {
  const value = new URL(request.url).searchParams.get("after") ?? "0";
  const eventId = Number.parseInt(value, 10);

  return Number.isSafeInteger(eventId) && eventId >= 0 ? eventId : 0;
}

function isNextRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT;")
  );
}

export async function GET(request: Request) {
  try {
    const state = await getOwnerWhatsAppInboxSyncState(getAfterEventId(request));

    return Response.json(state, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    logServerError("whatsapp.inbox_sync_failed", error);

    return Response.json(
      { error: "No fue posible sincronizar la bandeja de WhatsApp." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
