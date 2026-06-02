import { NextResponse } from "next/server";

import { requireBranchAccess } from "@/lib/auth/authorization";
import {
  isOperationalFormType,
  operationalFormTypes,
  type OperationalFormType,
} from "@/lib/operational-forms";
import { createBranchOperationalFormsPdf } from "@/lib/qr/pdf";
import { logServerError } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

type BranchQrRow = {
  form_type: string;
  token: string;
  is_active: boolean;
};

type ActiveOperationalForm = {
  formType: OperationalFormType;
  token: string;
};

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; branchSlug: string }> },
) {
  try {
    const { companySlug, branchSlug } = await params;
    const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
    const supabase = await getSupabaseRlsClient();

    if (!supabase) {
      throw new Error("Supabase RLS client is not configured.");
    }

    const { data, error } = await supabase
      .from("branch_form_qr_codes")
      .select("form_type, token, is_active")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("form_type", { ascending: true })
      .returns<BranchQrRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    const activeForms: ActiveOperationalForm[] =
      data
        ?.flatMap((row) => {
          if (!row.is_active || !isOperationalFormType(row.form_type)) {
            return [];
          }

          return [{ formType: row.form_type, token: row.token }];
        })
        .sort(
          (left, right) =>
            operationalFormTypes.indexOf(left.formType) - operationalFormTypes.indexOf(right.formType),
        ) ?? [];

    if (!activeForms.length) {
      return NextResponse.json(
        { error: "Esta sede no tiene formularios operativos activos para descargar." },
        { status: 404 },
      );
    }

    const pdf = createBranchOperationalFormsPdf({
      origin: new URL(request.url).origin,
      companyName: company.name,
      branchName: branch.name,
      forms: activeForms,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quimly-formularios-operarios-${branch.slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("branch.operational_forms_pdf.failed", error);
    return NextResponse.json({ error: "No fue posible generar el PDF." }, { status: 500 });
  }
}
