import { NextResponse } from "next/server";

import { requireBranchAccess } from "@/lib/auth/authorization";
import {
  getDateRangeUtcBounds,
  formatDateForDisplay,
  MAX_CUSTOM_REPORT_RANGE_MONTHS,
  validateDateRange,
} from "@/lib/branch-reports/dates";
import {
  BranchReportDeliveryError,
  assertGeneratedPdfSizeAllowed,
  cleanupOldGeneratedBranchReportsBestEffort,
  getBinarySizeBytes,
  uploadGeneratedBranchReport,
} from "@/lib/branch-reports/delivery";
import {
  getTotalOperationalRecords,
  loadOperationalReportSections,
} from "@/lib/branch-reports/data";
import { createOperationalFormsReportPdf } from "@/lib/branch-reports/pdf";
import { isOperationalFormType, operationalFormLabels, operationalFormTypes, type OperationalFormType } from "@/lib/operational-forms";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function formatFormLabel(formType: OperationalFormType) {
  const title = operationalFormLabels[formType].title;
  return title.charAt(0) + title.slice(1).toLocaleLowerCase("es-CO");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; branchSlug: string }> },
) {
  const reportType = "form-reports";
  const totalStart = Date.now();
  let companyId: string | undefined;
  let branchId: string | undefined;
  let recordCount = 0;
  let queryDurationMs = 0;
  let generationDurationMs = 0;
  let uploadDurationMs = 0;
  let finalSizeBytes = 0;

  try {
    const { companySlug, branchSlug } = await params;
    const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
    companyId = company.id;
    branchId = branch.id;
    const supabase = await getSupabaseRlsClient();

    if (!supabase) {
      return jsonError("No fue posible generar el PDF. Intenta nuevamente.", 500);
    }

    const url = new URL(request.url);
    const selectedFormTypes = parseFormTypes(url.searchParams);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const validation = validateDateRange(from, to, undefined, { maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS });

    if (!selectedFormTypes.length) {
      return jsonError("Selecciona al menos un formulario.", 400);
    }

    if (!validation.ok) {
      return jsonError(validation.error, 400);
    }

    const { fromIso, toIso } = getDateRangeUtcBounds(validation.from, validation.to);
    const queryStart = Date.now();
    const sections = await loadOperationalReportSections({
      supabase,
      branch,
      formTypes: selectedFormTypes as OperationalFormType[],
      fromIso,
      toIso,
    });
    queryDurationMs = Date.now() - queryStart;
    recordCount = getTotalOperationalRecords(sections);
    const includedSections = sections.filter((section) => section.records.length > 0);
    const missingSections = sections.filter((section) => section.records.length === 0);

    if (!recordCount) {
      return jsonError("No se encontraron registros para el periodo seleccionado.", 404);
    }

    const periodLabel = `${formatDateForDisplay(validation.from)} - ${formatDateForDisplay(validation.to)}`;
    const generationStart = Date.now();
    const pdf = await createOperationalFormsReportPdf({
      companyName: company.name,
      branchName: branch.name,
      periodLabel,
      generatedAt: new Date().toISOString(),
      sections: includedSections,
    });
    generationDurationMs = Date.now() - generationStart;
    finalSizeBytes = getBinarySizeBytes(pdf);
    assertGeneratedPdfSizeAllowed(finalSizeBytes);

    const uploadStart = Date.now();
    const file = await uploadGeneratedBranchReport({
      supabase,
      companyId: company.id,
      branchId: branch.id,
      reportType,
      pdf,
      filename: `quimly-reporte-formularios-${branch.slug}-${validation.from}-${validation.to}.pdf`,
    });
    uploadDurationMs = Date.now() - uploadStart;

    await cleanupOldGeneratedBranchReportsBestEffort({
      supabase,
      companyId: company.id,
      branchId: branch.id,
      reportType,
    });

    logServerInfo("[branch-report] generation.done", {
      reportType,
      companyId: company.id,
      branchId: branch.id,
      recordCount,
      finalSizeBytes,
      queryDurationMs,
      generationDurationMs,
      uploadDurationMs,
      totalDurationMs: Date.now() - totalStart,
      result: "success",
    });

    return NextResponse.json(
      {
        ...file,
        formReportSummary: {
          selectedFormCount: selectedFormTypes.length,
          includedFormCount: includedSections.length,
          missingForms: missingSections.map((section) => formatFormLabel(section.formType as OperationalFormType)),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const deliveryError = error instanceof BranchReportDeliveryError ? error : null;
    logServerError("[branch-report] generation.failed", error, {
      reportType,
      companyId,
      branchId,
      recordCount,
      finalSizeBytes,
      queryDurationMs,
      generationDurationMs,
      uploadDurationMs,
      totalDurationMs: Date.now() - totalStart,
      result: "error",
      errorCategory: deliveryError?.category ?? "unexpected",
    });
    return jsonError(deliveryError?.userMessage ?? "No fue posible generar el PDF. Intenta nuevamente.", deliveryError?.status ?? 500);
  }
}
