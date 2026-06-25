import { NextResponse } from "next/server";

import { requireBranchAccess } from "@/lib/auth/authorization";
import {
  getCurrentDocumentCategoryLabel,
  isCurrentDocumentCategoryId,
  type CurrentDocumentCategoryId,
} from "@/lib/branch-reports/config";
import {
  buildCurrentDocumentBundles,
  loadBranchDocumentSource,
} from "@/lib/branch-reports/data";
import { createSanitaryDossierPdf } from "@/lib/branch-reports/pdf";
import { attachBundlePdfs } from "@/lib/branch-reports/storage";
import { logServerError } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

export const dynamic = "force-dynamic";

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
  try {
    const { companySlug, branchSlug } = await params;
    const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
    const supabase = await getSupabaseRlsClient();

    if (!supabase) {
      return jsonError("No fue posible generar el PDF. Intenta nuevamente.", 500);
    }

    const url = new URL(_request.url);
    const selectedCategories = parseCategories(url.searchParams);

    if (!selectedCategories.length) {
      return jsonError("Selecciona al menos una categoría.", 400);
    }

    const source = await loadBranchDocumentSource(supabase, branch);
    const bundles = buildCurrentDocumentBundles(source, selectedCategories as CurrentDocumentCategoryId[]);
    const availableBundles = bundles.filter((bundle) => bundle.entries.length > 0);
    const missingCategoryLabels = bundles
      .filter((bundle) => bundle.entries.length === 0)
      .map((bundle) => getCurrentDocumentCategoryLabel(bundle.id as CurrentDocumentCategoryId));

    if (!availableBundles.length) {
      return jsonError("No hay archivos disponibles para las categorías seleccionadas.", 404, {
        missingCategories: missingCategoryLabels,
      });
    }

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

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quimly-expediente-sanitario-${branch.slug}.pdf"`,
        "Cache-Control": "no-store",
        "X-Quimly-Missing-Categories": encodeURIComponent(JSON.stringify(missingCategoryLabels)),
      },
    });
  } catch (error) {
    logServerError("branch.reports.sanitary_dossier_pdf.failed", error);
    return jsonError("Uno de los archivos no pudo ser procesado. Revisa los documentos e intenta nuevamente.", 500);
  }
}
