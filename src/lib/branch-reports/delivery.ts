import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BranchReportDocumentBundle } from "@/lib/branch-reports/types";
import { logServerError, logServerInfo } from "@/lib/server/logging";

export const GENERATED_REPORTS_BUCKET_NAME = "generated-reports";

export const branchReportDeliveryLimits = {
  documentInputMaxBytes: 30 * 1024 * 1024,
  generatedPdfMaxBytes: 35 * 1024 * 1024,
  signedUrlExpiresSeconds: 60 * 60,
  temporaryRetentionMs: 24 * 60 * 60 * 1000,
} as const;

export type GeneratedBranchReportType = "form-reports" | "sanitary-records" | "document-history";

export type GeneratedBranchReportFile = {
  success: true;
  url: string;
  downloadUrl: string;
  filename: string;
  expiresAt: string;
  sizeBytes: number;
};

export class BranchReportDeliveryError extends Error {
  status: number;
  category: string;
  userMessage: string;

  constructor({
    message,
    userMessage,
    status = 500,
    category,
  }: {
    message: string;
    userMessage: string;
    status?: number;
    category: string;
  }) {
    super(message);
    this.name = "BranchReportDeliveryError";
    this.status = status;
    this.category = category;
    this.userMessage = userMessage;
  }
}

export function getBinarySizeBytes(binary: Buffer | Uint8Array) {
  return binary.byteLength;
}

export function getDocumentInputStats(bundles: BranchReportDocumentBundle[]) {
  const filesById = new Map<string, number>();

  for (const bundle of bundles) {
    for (const entry of bundle.entries) {
      filesById.set(entry.file.id, entry.file.fileSizeBytes);
    }
  }

  return {
    fileCount: filesById.size,
    sizeBytes: Array.from(filesById.values()).reduce((total, sizeBytes) => total + Math.max(0, sizeBytes || 0), 0),
  };
}

export function assertDocumentInputSizeAllowed(sizeBytes: number) {
  if (sizeBytes <= branchReportDeliveryLimits.documentInputMaxBytes) {
    return;
  }

  throw new BranchReportDeliveryError({
    message: "Document input size limit exceeded.",
    userMessage: "Los documentos seleccionados superan el tamaño permitido. Selecciona menos categorías o un periodo más corto.",
    status: 413,
    category: "input_size_limit",
  });
}

export function assertGeneratedPdfSizeAllowed(sizeBytes: number) {
  if (sizeBytes <= branchReportDeliveryLimits.generatedPdfMaxBytes) {
    return;
  }

  throw new BranchReportDeliveryError({
    message: "Generated PDF size limit exceeded.",
    userMessage: "El PDF generado es demasiado grande. Selecciona menos categorías o un periodo más corto e intenta nuevamente.",
    status: 413,
    category: "output_size_limit",
  });
}

function createGeneratedReportPath({
  companyId,
  branchId,
  reportType,
}: {
  companyId: string;
  branchId: string;
  reportType: GeneratedBranchReportType;
}) {
  return `${companyId}/${branchId}/${reportType}/${randomUUID()}.pdf`;
}

export async function uploadGeneratedBranchReport({
  supabase,
  companyId,
  branchId,
  reportType,
  pdf,
  filename,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  companyId: string;
  branchId: string;
  reportType: GeneratedBranchReportType;
  pdf: Buffer | Uint8Array;
  filename: string;
  now?: Date;
}): Promise<GeneratedBranchReportFile> {
  const path = createGeneratedReportPath({ companyId, branchId, reportType });
  const bucket = supabase.storage.from(GENERATED_REPORTS_BUCKET_NAME);
  const { error: uploadError } = await bucket.upload(path, pdf, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    throw new BranchReportDeliveryError({
      message: uploadError.message,
      userMessage: "No fue posible preparar el PDF. Intenta nuevamente.",
      category: "storage_upload_failed",
    });
  }

  const [{ data: openData, error: openError }, { data: downloadData, error: downloadError }] = await Promise.all([
    bucket.createSignedUrl(path, branchReportDeliveryLimits.signedUrlExpiresSeconds),
    bucket.createSignedUrl(path, branchReportDeliveryLimits.signedUrlExpiresSeconds, {
      download: filename,
    }),
  ]);

  if (openError || !openData?.signedUrl || downloadError || !downloadData?.signedUrl) {
    let cleanupError: unknown = null;

    try {
      const { error: removeError } = await bucket.remove([path]);
      cleanupError = removeError;
    } catch (error) {
      cleanupError = error;
    }

    if (cleanupError) {
      logServerError("[branch-report] signed-url-cleanup.failed", cleanupError, {
        reportType,
        companyId,
        branchId,
        category: "signed_url_cleanup_failed",
      });
    }

    throw new BranchReportDeliveryError({
      message: openError?.message ?? downloadError?.message ?? "Signed URL was not returned.",
      userMessage: "No fue posible preparar el enlace del PDF. Intenta nuevamente.",
      category: "signed_url_failed",
    });
  }

  return {
    success: true,
    url: openData.signedUrl,
    downloadUrl: downloadData.signedUrl,
    filename,
    expiresAt: new Date(now.getTime() + branchReportDeliveryLimits.signedUrlExpiresSeconds * 1000).toISOString(),
    sizeBytes: getBinarySizeBytes(pdf),
  };
}

export async function cleanupOldGeneratedBranchReports({
  supabase,
  companyId,
  branchId,
  reportType,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  companyId: string;
  branchId: string;
  reportType: GeneratedBranchReportType;
  now?: Date;
}) {
  const prefix = `${companyId}/${branchId}/${reportType}`;
  const bucket = supabase.storage.from(GENERATED_REPORTS_BUCKET_NAME);
  const { data, error } = await bucket.list(prefix, {
    limit: 1000,
    sortBy: { column: "created_at", order: "asc" },
  });

  if (error) {
    throw error;
  }

  const cutoffTime = now.getTime() - branchReportDeliveryLimits.temporaryRetentionMs;
  const oldPaths = (data ?? []).flatMap((item) => {
    const record = item as unknown as Record<string, unknown>;
    const createdAt = typeof record.created_at === "string" ? record.created_at : "";
    const updatedAt = typeof record.updated_at === "string" ? record.updated_at : "";
    const time = Date.parse(createdAt || updatedAt);

    if (!item.name || Number.isNaN(time) || time >= cutoffTime) {
      return [];
    }

    return [`${prefix}/${item.name}`];
  });

  if (!oldPaths.length) {
    return 0;
  }

  const { error: removeError } = await bucket.remove(oldPaths);

  if (removeError) {
    throw removeError;
  }

  return oldPaths.length;
}

export async function cleanupOldGeneratedBranchReportsBestEffort({
  supabase,
  companyId,
  branchId,
  reportType,
}: {
  supabase: SupabaseClient;
  companyId: string;
  branchId: string;
  reportType: GeneratedBranchReportType;
}) {
  try {
    const removedCount = await cleanupOldGeneratedBranchReports({
      supabase,
      companyId,
      branchId,
      reportType,
    });

    if (removedCount > 0) {
      logServerInfo("[branch-report] cleanup.done", {
        reportType,
        companyId,
        branchId,
        removedCount,
      });
    }
  } catch (error) {
    logServerError("[branch-report] cleanup.failed", error, {
      reportType,
      companyId,
      branchId,
    });
  }
}
