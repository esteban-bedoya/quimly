import { NextResponse } from "next/server";

import { getCompanyAccountCapabilities, requireBranchAccess } from "@/lib/auth/authorization";
import {
  getCurrentDocumentCategoryLabel,
  isCurrentDocumentCategoryId,
  type CurrentDocumentCategoryId,
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
  buildCurrentDocumentBundles,
  loadBranchDocumentSource,
} from "@/lib/branch-reports/data";
import { createSanitaryDossierPdf } from "@/lib/branch-reports/pdf";
import { attachBundlePdfs } from "@/lib/branch-reports/storage";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseCategories(searchParams: URLSearchParams) {
  const rawValues = [
    ...searchParams.getAll("category"),
    ...(searchParams.get("categories")?.split(",") ?? []),
  ].map((value) => value.trim());

  return rawValues.filter(isCurrentDocumentCategoryId);
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companySlug: string; branchSlug: string }> },
) {
  const reportType = "sanitary-records";
  const totalStart = Date.now();
  let companyId: string | undefined;
  let branchId: string | undefined;
  let inputFileCount = 0;
  let inputSizeBytes = 0;
  let queryDurationMs = 0;
  let generationDurationMs = 0;
  let uploadDurationMs = 0;
  let finalSizeBytes = 0;

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

    const url = new URL(_request.url);
    const selectedCategories = parseCategories(url.searchParams);

    if (!selectedCategories.length) {
      return jsonError("Selecciona al menos una categoría.", 400);
    }

    const queryStart = Date.now();
    const source = await loadBranchDocumentSource(supabase, branch);
    const bundles = buildCurrentDocumentBundles(source, selectedCategories as CurrentDocumentCategoryId[]);
    const availableBundles = bundles.filter((bundle) => bundle.entries.length > 0);
    const missingCategoryLabels = bundles
      .filter((bundle) => bundle.entries.length === 0)
      .map((bundle) => getCurrentDocumentCategoryLabel(bundle.id as CurrentDocumentCategoryId));
    queryDurationMs = Date.now() - queryStart;

    if (!availableBundles.length) {
      return jsonError("No hay archivos disponibles para las categorías seleccionadas.", 404, {
        missingCategories: missingCategoryLabels,
      });
    }

    const inputStats = getDocumentInputStats(availableBundles);
    inputFileCount = inputStats.fileCount;
    inputSizeBytes = inputStats.sizeBytes;
    assertDocumentInputSizeAllowed(inputSizeBytes);

    const generationStart = Date.now();
    const attachedBundles = await Promise.all(
      availableBundles.map((bundle) =>
        attachBundlePdfs({
          supabase,
          branchId: branch.id,
          bundle,
        }),
      ),
    );
    const pdf = await createSanitaryDossierPdf({
      companyName: company.name,
      branchName: branch.name,
      generatedAt: new Date().toISOString(),
      bundles: attachedBundles,
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
      filename: formatBranchReportFilename("documentos_sanitarios", branch.name),
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
      inputFileCount,
      inputSizeBytes,
      finalSizeBytes,
      queryDurationMs,
      generationDurationMs,
      uploadDurationMs,
      totalDurationMs: Date.now() - totalStart,
      result: "success",
      missingCategoryCount: missingCategoryLabels.length,
    });

    return NextResponse.json(
      {
        ...file,
        missingCategories: missingCategoryLabels,
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
