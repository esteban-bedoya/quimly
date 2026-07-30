import { timingSafeEqual } from "node:crypto";

import { runScheduledWhatsAppNotifications } from "@/lib/notifications/scheduled-whatsapp-notifications.service.server";
import { logServerError } from "@/lib/server/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hasValidCronSecret(request: Request) {
  const secret = process.env.WHATSAPP_NOTIFICATIONS_CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";

  if (!secret || !providedSecret) {
    return false;
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(providedSecret);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runScheduledWhatsAppNotifications();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    logServerError("whatsapp.scheduled_notifications_cron_failed", error);
    return Response.json({ error: "No fue posible ejecutar las notificaciones programadas." }, { status: 500 });
  }
}
