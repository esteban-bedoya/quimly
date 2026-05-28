import { NextResponse } from "next/server";

import { createPublicFormUrl } from "@/lib/operational-forms";
import { createQrSvg } from "@/lib/qr/svg";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const publicUrl = createPublicFormUrl(new URL(request.url).origin, token);
  const svg = createQrSvg(publicUrl);

  return new NextResponse(svg, {
    headers: {
      "Content-Disposition": `inline; filename="quimly-qr-${token}.svg"`,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

