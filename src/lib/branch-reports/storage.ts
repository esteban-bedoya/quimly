import type { SupabaseClient } from "@supabase/supabase-js";

import type { BranchReportDocumentBundle, BranchReportDocumentEntry } from "@/lib/branch-reports/types";
import type { PdfDocumentBundleWithFiles, PdfFileAttachment } from "@/lib/branch-reports/pdf";

const STORAGE_BUCKET_NAME = "branch-documents";

function getStoragePathFromUrl(fileUrl: string) {
  const publicMarker = "/object/public/branch-documents/";
  const authenticatedMarker = "/object/authenticated/branch-documents/";
  const publicMarkerIndex = fileUrl.indexOf(publicMarker);

  if (publicMarkerIndex >= 0) {
    return decodeURIComponent(fileUrl.slice(publicMarkerIndex + publicMarker.length).split("?")[0] ?? "");
  }

  const authenticatedMarkerIndex = fileUrl.indexOf(authenticatedMarker);

  if (authenticatedMarkerIndex >= 0) {
    return decodeURIComponent(fileUrl.slice(authenticatedMarkerIndex + authenticatedMarker.length).split("?")[0] ?? "");
  }

  try {
    const url = new URL(fileUrl);
    const bucketIndex = url.pathname.indexOf("/branch-documents/");

    if (bucketIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(bucketIndex + "/branch-documents/".length));
    }
  } catch {
    return null;
  }

  return null;
}

export async function downloadBranchDocumentPdf({
  supabase,
  branchId,
  fileUrl,
}: {
  supabase: SupabaseClient;
  branchId: string;
  fileUrl: string;
}) {
  const storagePath = getStoragePathFromUrl(fileUrl);

  if (!storagePath || !storagePath.startsWith(`${branchId}/`)) {
    throw new Error("El archivo no pertenece a esta sede.");
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "No fue posible leer el archivo.");
  }

  return new Uint8Array(await data.arrayBuffer());
}

async function attachEntryPdf({
  supabase,
  branchId,
  entry,
}: {
  supabase: SupabaseClient;
  branchId: string;
  entry: BranchReportDocumentEntry;
}): Promise<PdfFileAttachment> {
  return {
    entry,
    bytes: await downloadBranchDocumentPdf({
      supabase,
      branchId,
      fileUrl: entry.file.fileUrl,
    }),
  };
}

export async function attachBundlePdfs({
  supabase,
  branchId,
  bundle,
}: {
  supabase: SupabaseClient;
  branchId: string;
  bundle: BranchReportDocumentBundle;
}): Promise<PdfDocumentBundleWithFiles> {
  const attachmentCache = new Map<string, Promise<PdfFileAttachment>>();
  const attachCachedEntry = (entry: BranchReportDocumentEntry) => {
    const cachedAttachment = attachmentCache.get(entry.file.id);

    if (cachedAttachment) {
      return cachedAttachment;
    }

    const attachment = attachEntryPdf({
      supabase,
      branchId,
      entry,
    });

    attachmentCache.set(entry.file.id, attachment);
    return attachment;
  };

  const entries = await Promise.all(bundle.entries.map(attachCachedEntry));

  const groups = bundle.groups
    ? await Promise.all(
        bundle.groups.map(async (group) => ({
          title: group.title,
          entries: await Promise.all(group.entries.map(attachCachedEntry)),
        })),
      )
    : undefined;

  return {
    id: bundle.id,
    title: bundle.title,
    entries,
    groups,
  };
}
