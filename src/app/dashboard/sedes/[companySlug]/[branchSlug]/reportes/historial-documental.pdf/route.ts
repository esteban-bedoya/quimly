import { NextResponse } from "next/server";

import { getCompanyAccountCapabilities, requireBranchAccess } from "@/lib/auth/authorization";
import {
  isHistoryDocumentCategoryId,
  type HistoryDocumentCategoryId,
} from "@/lib/branch-reports/config";
import {
  BranchReportDeliveryError,
  assertDocumentInputSizeAllowed,
  assertGeneratedPdfSizeAllowed,
  cleanupOldGeneratedBranchReportsBestEffort,
  formatBranchReportFilename,
  getBinarySizeBytes,
  getDocumentInputStats,
  uploadGeneratedBranchReport,
} from "@/lib/branch-reports/delivery";
import {
  formatDateForDisplay,
  getHistoryPresetRange,
  MAX_CUSTOM_REPORT_RANGE_MONTHS,
  type HistoryPeriodPreset,
  validateDateRange,
} from "@/lib/branch-reports/dates";
import {
  buildHistoricalDocumentBundle,
  loadBranchDocumentSource,
} from "@/lib/branch-reports/data";
import { createHistoricalDocumentPdf } from "@/lib/branch-reports/pdf";
import { attachBundlePdfs } from "@/lib/branch-reports/storage";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isHistoryPeriodPreset(value: string): value is HistoryPeriodPreset {
  return value === "last6months" || value === "last12months" || value === "custom";
}

function resolveHistoryRange(searchParams: URLSearchParams) {
  const presetValue = searchParams.get("period") ?? "last6months";

  if (!isHistoryPeriodPreset(presetValue)) {
    return { ok: false as const, error: "Selecciona un periodo válido." };
  }

  const range = presetValue === "custom"
    ? {
        from: searchParams.get("from") ?? "",
        to: searchParams.get("to") ?? "",
      }
    : getHistoryPresetRange(presetValue);
  const validation = validateDateRange(range.from, range.to, undefined, { maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS });

  if (!validation.ok) {
    return { ok: false as const, error: validation.error };
  }

  return {
    ok: true as const,
    range: { from: validation.from, to: validation.to },
    label: `${formatDateForDisplay(validation.from)} · ${formatDateForDisplay(validation.to)}`,
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; branchSlug: string }> },
) {
  const reportType = "document-history";
  const totalStart = Date.now();
  let companyId: string | undefined;
  let branchId: string | undefined;
  let inputFileCount = 0;
  let inputSizeBytes = 0;
  let queryDurationMs = 0;
  let generationDurationMs = 0;
  let uploadDurationMs = 0;
  let finalSizeBytes = 0;
  let historyCategory: string | undefined;

  try {
    const { companySlug, branchSlug } = await params;
    const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
    const accountCapabilities = await getCompanyAccountCapabilities(company.id);

    if (!accountCapabilities.canDownloadReports) {
      return jsonError("Tu cuenta no puede descargar reportes en este momento.", 403);
    }

    companyId = company.id;
    branchId = branch.id;
    const supabase = await getSupabaseRlsClient();

    if (!supabase) {
      return jsonError("No fue posible generar el PDF. Intenta nuevamente.", 500);
    }

    const url = new URL(request.url);
    const categoryId = url.searchParams.get("category") ?? "";

    if (!isHistoryDocumentCategoryId(categoryId)) {
      return jsonError("Selecciona una categoría válida.", 400);
    }
    historyCategory = categoryId;

    const rangeResult = resolveHistoryRange(url.searchParams);

    if (!rangeResult.ok) {
      return jsonError(rangeResult.error, 400);
    }

    const queryStart = Date.now();
    const source = await loadBranchDocumentSource(supabase, branch);
    const bundle = buildHistoricalDocumentBundle(
      source,
      categoryId as HistoryDocumentCategoryId,
      rangeResult.range,
    );
    queryDurationMs = Date.now() - queryStart;

    if (!bundle.entries.length) {
      return jsonError("No se encontraron archivos históricos para el periodo seleccionado.", 404);
    }

    const inputStats = getDocumentInputStats([bundle]);
    inputFileCount = inputStats.fileCount;
    inputSizeBytes = inputStats.sizeBytes;
    assertDocumentInputSizeAllowed(inputSizeBytes);

    const generationStart = Date.now();
    const attachedBundle = await attachBundlePdfs({
      supabase,
      branchId: branch.id,
      bundle,
    });
    const pdf = await createHistoricalDocumentPdf({
      companyName: company.name,
      branchName: branch.name,
      generatedAt: new Date().toISOString(),
      periodLabel: rangeResult.label,
      bundle: attachedBundle,
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
      filename: formatBranchReportFilename("historial_documental", branch.name),
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
      historyCategory: categoryId,
      inputFileCount,
      inputSizeBytes,
      finalSizeBytes,
      queryDurationMs,
      generationDurationMs,
      uploadDurationMs,
      totalDurationMs: Date.now() - totalStart,
      result: "success",
    });

    return NextResponse.json(file, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const deliveryError = error instanceof BranchReportDeliveryError ? error : null;
    logServerError("[branch-report] generation.failed", error, {
      reportType,
      companyId,
      branchId,
      historyCategory,
      inputFileCount,
      inputSizeBytes,
      finalSizeBytes,
      queryDurationMs,
      generationDurationMs,
      uploadDurationMs,
      totalDurationMs: Date.now() - totalStart,
      result: "error",
      errorCategory: deliveryError?.category ?? "unexpected",
    });
    return jsonError(
      deliveryError?.userMessage ?? "Uno de los archivos no pudo ser procesado. Revisa los documentos e intenta nuevamente.",
      deliveryError?.status ?? 500,
    );
  }
}
