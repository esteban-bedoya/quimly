import { NextResponse } from "next/server";

import { requireBranchAccess } from "@/lib/auth/authorization";
import {
  getHistoryDocumentCategory,
  isHistoryDocumentCategoryId,
  type HistoryDocumentCategoryId,
} from "@/lib/branch-reports/config";
import {
  formatDateForDisplay,
  getHistoryPresetRange,
  type HistoryPeriodPreset,
  validateDateRange,
} from "@/lib/branch-reports/dates";
import {
  buildHistoricalDocumentBundle,
  loadBranchDocumentSource,
} from "@/lib/branch-reports/data";
import { createHistoricalDocumentPdf } from "@/lib/branch-reports/pdf";
import { attachBundlePdfs } from "@/lib/branch-reports/storage";
import { logServerError } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";

function isHistoryPeriodPreset(value: string): value is HistoryPeriodPreset {
  return value === "last6months" || value === "last12months" || value === "all" || value === "custom";
}

function resolveHistoryRange(searchParams: URLSearchParams) {
  const presetValue = searchParams.get("period") ?? "all";
  const preset = isHistoryPeriodPreset(presetValue) ? presetValue : "all";

  if (preset === "all") {
    return { ok: true as const, range: null, label: "Todo el historial" };
  }

  const range = preset === "custom"
    ? {
        from: searchParams.get("from") ?? "",
        to: searchParams.get("to") ?? "",
      }
    : getHistoryPresetRange(preset);
  const validation = validateDateRange(range.from, range.to);

  if (!validation.ok) {
    return { ok: false as const, error: validation.error };
  }

  return {
    ok: true as const,
    range: { from: validation.from, to: validation.to },
    label: `${formatDateForDisplay(validation.from)} - ${formatDateForDisplay(validation.to)}`,
  };
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
    const categoryId = url.searchParams.get("category") ?? "";

    if (!isHistoryDocumentCategoryId(categoryId)) {
      return jsonError("Selecciona una categoría válida.", 400);
    }

    const rangeResult = resolveHistoryRange(url.searchParams);

    if (!rangeResult.ok) {
      return jsonError(rangeResult.error, 400);
    }

    const source = await loadBranchDocumentSource(supabase, branch);
    const bundle = buildHistoricalDocumentBundle(
      source,
      categoryId as HistoryDocumentCategoryId,
      rangeResult.range,
    );

    if (!bundle.entries.length) {
      return jsonError("No se encontraron archivos históricos para el periodo seleccionado.", 404);
    }

    const category = getHistoryDocumentCategory(categoryId as HistoryDocumentCategoryId);
    const attachedBundle = await attachBundlePdfs({
      supabase,
      branchId: branch.id,
      bundle,
    });
    const pdf = await createHistoricalDocumentPdf({
      companyName: company.name,
      branchName: branch.name,
      generatedAt: new Date().toISOString(),
      categoryTitle: category.title,
      periodLabel: rangeResult.label,
      bundle: attachedBundle,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quimly-historial-${categoryId}-${branch.slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("branch.reports.document_history_pdf.failed", error);
    return jsonError("Uno de los archivos no pudo ser procesado. Revisa los documentos e intenta nuevamente.", 500);
  }
}
