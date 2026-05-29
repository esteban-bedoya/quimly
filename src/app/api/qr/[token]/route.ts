import { NextResponse } from "next/server";

import { createPublicFormUrl } from "@/lib/operational-forms";
import { createQrSvg } from "@/lib/qr/svg";
import { logServerError, logServerInfo } from "@/lib/server/logging";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const publicUrl = createPublicFormUrl(new URL(request.url).origin, token);

    logServerInfo("qr.svg.generate.start", {
      tokenLength: token.length,
      publicUrlLength: publicUrl.length,
    });

    const svg = createQrSvg(publicUrl);

    return new NextResponse(svg, {
      headers: {
        "Content-Disposition": `inline; filename="quimly-qr-${token}.svg"`,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("qr.svg.generate.failed", error);
    return NextResponse.json({ error: "No fue posible generar el QR." }, { status: 500 });
  }
}
