import { NextResponse } from "next/server";

import { createPublicFormUrl, isOperationalFormType, operationalFormLabels } from "@/lib/operational-forms";
import { createPrintableQrSvg } from "@/lib/qr/svg";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

type PublicOperationalFormPayload = {
  form_type: string;
  branch_name: string;
  company_name: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = getSupabasePublicClient();

    if (!supabase) {
      throw new Error("Supabase public client is not configured.");
    }

    const publicUrl = createPublicFormUrl(new URL(request.url).origin, token);

    logServerInfo("qr.svg.generate.start", {
      tokenLength: token.length,
      publicUrlLength: publicUrl.length,
    });

    const { data, error } = await supabase.rpc("get_public_operational_form", {
      p_token: token,
    });

    if (error) {
      throw new Error(error.message);
    }

    const payload = data as PublicOperationalFormPayload | null;

    if (!payload || !isOperationalFormType(payload.form_type)) {
      return NextResponse.json({ error: "No fue posible encontrar este QR." }, { status: 404 });
    }

    const svg = createPrintableQrSvg({
      value: publicUrl,
      branchName: payload.branch_name,
      companyName: payload.company_name,
      formTitle: operationalFormLabels[payload.form_type].title,
    });

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
