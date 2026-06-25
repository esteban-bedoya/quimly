import { NextResponse } from "next/server";

import { requireBranchAccess } from "@/lib/auth/authorization";
import { getDateRangeUtcBounds, formatDateForDisplay, validateDateRange } from "@/lib/branch-reports/dates";
import {
  getTotalOperationalRecords,
  loadOperationalReportSections,
} from "@/lib/branch-reports/data";
import { createOperationalFormsReportPdf } from "@/lib/branch-reports/pdf";
import { isOperationalFormType, operationalFormTypes, type OperationalFormType } from "@/lib/operational-forms";
import { logServerError } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";

function parseFormTypes(searchParams: URLSearchParams) {
  const rawValues = [
    ...searchParams.getAll("form"),
    ...(searchParams.get("forms")?.split(",") ?? []),
  ].map((value) => value.trim());
  const formTypes = rawValues.filter(isOperationalFormType);
  const uniqueFormTypes = operationalFormTypes.filter((formType) => formTypes.includes(formType));

  return uniqueFormTypes;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; branchSlug: string }> },
) {
  try {
    const { companySlug, branchSlug } = await params;
    const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
    const supabase = await getSupabaseRlsClient();

    if (!supabase) {
      return jsonError("No fue posible generar el PDF. Intenta nuevamente.", 500);
    }

    const url = new URL(request.url);
    const selectedFormTypes = parseFormTypes(url.searchParams);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const validation = validateDateRange(from, to);

    if (!selectedFormTypes.length) {
      return jsonError("Selecciona al menos un formulario.", 400);
    }

    if (!validation.ok) {
      return jsonError(validation.error, 400);
    }

    const { fromIso, toIso } = getDateRangeUtcBounds(validation.from, validation.to);
    const sections = await loadOperationalReportSections({
      supabase,
      branch,
      formTypes: selectedFormTypes as OperationalFormType[],
      fromIso,
      toIso,
    });

    if (!getTotalOperationalRecords(sections)) {
      return jsonError("No se encontraron registros para el periodo seleccionado.", 404);
    }

    const periodLabel = `${formatDateForDisplay(validation.from)} - ${formatDateForDisplay(validation.to)}`;
    const pdf = await createOperationalFormsReportPdf({
      companyName: company.name,
      branchName: branch.name,
      periodLabel,
      generatedAt: new Date().toISOString(),
      sections,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quimly-reporte-formularios-${branch.slug}-${validation.from}-${validation.to}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("branch.reports.forms_pdf.failed", error);
    return jsonError("No fue posible generar el PDF. Intenta nuevamente.", 500);
  }
}
