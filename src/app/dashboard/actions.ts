"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { requireBranchAccess } from "@/lib/auth/authorization";
import { requireUserContext } from "@/lib/auth/user-context";
import { notificationService } from "@/lib/notifications/notification.service";
import { normalizeOptionalEmail, normalizePhoneNumber } from "@/lib/phone";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getMissingSupabaseAdminConfigKeys } from "@/lib/supabase/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type {
  AppRole,
  BranchChemicalProductSummary,
  BranchRefrigerationEquipmentType,
  BranchSanitaryDocumentFileSummary,
  BranchSanitaryDocumentKind,
  BranchStaffMemberSummary,
} from "@/types/auth";

export type AdminActionState = {
  error?: string;
  success?: string;
};

type PostgrestErrorLike = {
  code?: string;
  message: string;
};

type SanitaryDocumentActionState = AdminActionState & {
  file?: BranchSanitaryDocumentFileSummary;
  files?: BranchSanitaryDocumentFileSummary[];
  product?: BranchChemicalProductSummary;
  staffMember?: BranchStaffMemberSummary;
  id?: string;
};

export type CurrentUserProfileDetailsState = AdminActionState & {
  profile?: {
    fullName: string | null;
    email: string | null;
    phone: string;
    phoneVerified: boolean;
  };
};

type BranchSanitaryDocumentFileRow = {
  id: string;
  branch_id: string;
  company_id: string;
  document_kind: BranchSanitaryDocumentKind;
  chemical_product_id: string | null;
  staff_member_id: string | null;
  file_url: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  is_active: boolean;
  uploaded_at: string;
  updated_at: string;
};

type BranchChemicalProductRow = {
  id: string;
  branch_id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
};

type BranchStaffMemberRow = {
  id: string;
  branch_id: string;
  company_id: string;
  full_name: string;
  is_active: boolean;
  updated_at: string;
};

const sanitaryDocumentKinds = [
  "sanitation_plan",
  "chemical_technical_sheet",
  "chemical_safety_sheet",
  "pest_control_certificate",
  "water_tank_cleaning_certificate",
  "acu_final_disposal_certificate",
  "food_handling_course",
  "medical_fitness_exam",
] as const satisfies readonly BranchSanitaryDocumentKind[];

const SANITATION_PLAN_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const GENERAL_DOCUMENT_MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;
const MAX_DOCUMENT_SECTION_RECORDS = 40;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readRefrigerationEquipmentType(formData: FormData) {
  const value = readString(formData, "equipmentType");

  return value === "refrigerator" || value === "freezer" ? value : null;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readNumber(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function getStorageBucketName() {
  return "branch-documents";
}

function getFilePathFromUrl(fileUrl: string) {
  const marker = "/object/public/";
  const markerIndex = fileUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return fileUrl.slice(markerIndex + marker.length).split("?")[0] ?? null;
}

async function uploadBranchDocumentFile({
  branchId,
  file,
  supabaseClient,
}: {
  branchId: string;
  file: File;
  supabaseClient: SupabaseClient;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const safeBranchId = branchId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safeBranchId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(getStorageBucketName())
    .upload(fileName, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabaseClient.storage.from(getStorageBucketName()).getPublicUrl(fileName);
  return {
    fileUrl: data.publicUrl,
    filePath: fileName,
  };
}

async function deleteBranchDocumentFile(fileUrl: string | null, supabaseClient: SupabaseClient) {
  if (!fileUrl) {
    return;
  }

  const filePath = getFilePathFromUrl(fileUrl);
  if (!filePath) {
    return;
  }

  await supabaseClient.storage.from(getStorageBucketName()).remove([filePath]);
}

function formatDatabaseError(error: PostgrestErrorLike, fallback: string) {
  if (error.code === "23505") {
    if (error.message.includes("companies_slug")) {
      return "Ya existe una empresa con un nombre que genera el mismo identificador interno.";
    }

    if (error.message.includes("branches_company_id_slug")) {
      return "Ya existe una sede con un nombre equivalente dentro de esa empresa.";
    }

    if (
      error.message.includes("branch_refrigeration_equipment") ||
      error.message.includes("branch_sanitation_areas")
    ) {
      return "Ya existe una opción con ese nombre en este formulario.";
    }

    if (error.message.includes("branch_chemical_products_active_name_idx")) {
      return "Ya existe un producto químico activo con ese nombre. Puedes editar el registro existente o usar otro nombre.";
    }

    if (error.message.includes("branch_staff_members_active_name_idx")) {
      return "Ya existe un empleado activo con ese nombre. Puedes editar el registro existente o usar otro nombre.";
    }
  }

  return error.message || fallback;
}

function readSanitaryDocumentKind(formData: FormData, key = "documentKind") {
  const value = readString(formData, key);
  return sanitaryDocumentKinds.find((kind) => kind === value) ?? null;
}

function readMetadata(formData: FormData) {
  const rawMetadata = readString(formData, "metadata");

  if (!rawMetadata) {
    return {};
  }

  try {
    const parsedMetadata = JSON.parse(rawMetadata);
    return parsedMetadata && typeof parsedMetadata === "object" && !Array.isArray(parsedMetadata)
      ? (parsedMetadata as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getSanitaryDocumentMaxFileSize(documentKind: BranchSanitaryDocumentKind) {
  return documentKind === "sanitation_plan"
    ? SANITATION_PLAN_MAX_FILE_SIZE_BYTES
    : GENERAL_DOCUMENT_MAX_FILE_SIZE_BYTES;
}

function formatMegabytes(bytes: number) {
  return `${bytes / (1024 * 1024)} MB`;
}

function validateSanitaryPdfFile(file: File, documentKind: BranchSanitaryDocumentKind) {
  const maxSizeBytes = getSanitaryDocumentMaxFileSize(documentKind);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return "Solo se permiten archivos PDF.";
  }

  if (file.size > maxSizeBytes) {
    return `El PDF no puede superar ${formatMegabytes(maxSizeBytes)}.`;
  }

  return null;
}

function mapSanitaryDocumentFileRow(row: BranchSanitaryDocumentFileRow): BranchSanitaryDocumentFileSummary {
  return {
    id: row.id,
    branchId: row.branch_id,
    companyId: row.company_id,
    documentKind: row.document_kind,
    chemicalProductId: row.chemical_product_id,
    staffMemberId: row.staff_member_id,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    metadata: row.metadata,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
  };
}

function mapChemicalProductRow(row: BranchChemicalProductRow): BranchChemicalProductSummary {
  return {
    id: row.id,
    branchId: row.branch_id,
    companyId: row.company_id,
    name: row.name,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function mapStaffMemberRow(row: BranchStaffMemberRow): BranchStaffMemberSummary {
  return {
    id: row.id,
    branchId: row.branch_id,
    companyId: row.company_id,
    fullName: row.full_name,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function getSanitaryDocumentFileSelect() {
  return "id, branch_id, company_id, document_kind, chemical_product_id, staff_member_id, file_url, file_name, file_size_bytes, mime_type, metadata, expires_at, is_active, uploaded_at, updated_at";
}

function formatActionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function logAdminActionError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  logServerError(event, error, {
    source: "dashboard.actions",
    ...context,
  });
}

function getSupabaseAdminClientOrThrow(context: Record<string, unknown> = {}) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const missingConfigKeys = getMissingSupabaseAdminConfigKeys();
    logAdminActionError(
      "dashboard.supabase.admin_client_missing",
      new Error("Supabase Auth Admin no está configurado en el servidor."),
      {
        ...context,
        missingConfigKeys,
      },
    );
    throw new Error(
      missingConfigKeys.length
        ? `Supabase Auth Admin no está configurado en el servidor. Faltan: ${missingConfigKeys.join(", ")}.`
        : "Supabase Auth Admin no está configurado en el servidor.",
    );
  }

  return supabase;
}

async function sendWhatsAppOTP(phone: string) {
  await notificationService.sendOTP(phone);
}

async function verifyWhatsAppOTP(phone: string, code: string) {
  const verification = await notificationService.checkOTP(phone, code);
  return verification.approved;
}

async function getSupabaseRlsClientOrThrow(context: Record<string, unknown> = {}) {
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    logAdminActionError(
      "dashboard.supabase.rls_client_missing",
      new Error("Supabase no está configurado para la sesión autenticada."),
      context,
    );
    throw new Error("No fue posible validar tu sesión para actualizar esta opción.");
  }

  return supabase;
}

type BranchRouteTarget = {
  companySlug: string;
  branchSlug: string;
};

async function resolveBranchRouteTarget(branchId: string) {
  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "resolveBranchRouteTarget",
    branchId,
  });

  const { data, error } = await supabase
    .from("branches")
    .select("slug, company:companies!inner(slug)")
    .eq("id", branchId)
    .maybeSingle<{
      slug: string;
      company: { slug: string } | { slug: string }[] | null;
    }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const company = Array.isArray(data.company) ? data.company[0] ?? null : data.company;

  if (!company) {
    return null;
  }

  return {
    companySlug: company.slug,
    branchSlug: data.slug,
  } satisfies BranchRouteTarget;
}

async function requireOwnerAccess() {
  const context = await requireUserContext();

  if (context.profile.globalRole !== "owner") {
    throw new Error("Solo el owner puede realizar esta acción.");
  }

  return context;
}

async function requireOperatorAccess() {
  const context = await requireUserContext();

  if (context.profile.globalRole !== "owner" && context.profile.globalRole !== "super_admin") {
    throw new Error("No tienes permisos para realizar esta acción.");
  }

  return context;
}

export async function createCompany(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "createCompany" });

  const name = readString(formData, "name");

  if (!name) {
    return { error: "Debes indicar un nombre válido para la empresa." };
  }

  const { error } = await supabase.rpc("create_company_with_main_branch", {
    actor_user_id: context.profile.userId,
    company_name: name,
    main_branch_name: "Sede Principal",
  });

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible crear la empresa.") };
  }

  revalidatePath("/dashboard");
  return { success: `Empresa "${name}" creada correctamente con su sede principal.` };
}

export async function updateCurrentUserProfile(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await requireUserContext();
  const adminClient = getSupabaseAdminClientOrThrow({ operation: "updateCurrentUserProfile" });

  const fullName = readString(formData, "fullName");
  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const email = normalizeOptionalEmail(readString(formData, "email"));
  const phoneOtpCode = readString(formData, "phoneOtpCode");

  if (!fullName) {
    return { error: "Debes indicar tu nombre." };
  }

  if (!phone) {
    return { error: "Debes indicar un celular válido." };
  }

  const phoneChanged = phone !== context.profile.phone;

  if (phoneChanged) {
    if (!phoneOtpCode) {
      return { error: "Debes ingresar el código de WhatsApp para cambiar el celular." };
    }

    const approved = await verifyWhatsAppOTP(phone, phoneOtpCode);

    if (!approved) {
      return { error: "El código de WhatsApp no es válido o expiró." };
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(context.profile.userId, {
      phone,
      phone_confirm: true,
      user_metadata: {
        full_name: fullName,
        email,
      },
    });

    if (authError) {
      return { error: authError.message };
    }
  }

  const { error } = await adminClient
    .from("user_profiles")
    .update({
      full_name: fullName,
      email,
      phone,
      phone_verified: true,
    })
    .eq("user_id", context.profile.userId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible actualizar tu perfil.") };
  }

  revalidatePath("/dashboard");
  return { success: "Perfil actualizado correctamente." };
}

export async function sendCurrentUserPhoneChangeOTP(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireUserContext();
  const phone = normalizePhoneNumber(readString(formData, "phone"));

  if (!phone) {
    return { error: "Debes indicar un celular válido." };
  }

  try {
    await sendWhatsAppOTP(phone);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible enviar el código por WhatsApp.",
    };
  }

  return { success: "Código enviado por WhatsApp." };
}

export async function getCurrentUserProfileDetails(): Promise<CurrentUserProfileDetailsState> {
  const context = await requireUserContext();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "getCurrentUserProfileDetails" });

  const { data, error } = await supabase
    .from("user_profiles")
    .select("full_name, email, phone, phone_verified")
    .eq("user_id", context.profile.userId)
    .maybeSingle<{ full_name: string | null; email: string | null; phone: string; phone_verified: boolean }>();

  if (error || !data) {
    return {
      error: error?.message ?? "No fue posible cargar tu perfil.",
    };
  }

  if (!data.phone) {
    return {
      error: "Tu perfil no tiene celular configurado para autenticación.",
    };
  }

  return {
    profile: {
      fullName: data.full_name,
      email: data.email,
      phone: data.phone,
      phoneVerified: data.phone_verified,
    },
  };
}

export async function createCompanyBranch(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "createCompanyBranch" });

  const companyId = readString(formData, "companyId");
  const name = readString(formData, "name");

  if (!companyId || !name) {
    return { error: "Debes indicar empresa y nombre válidos para la sede." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("slug")
    .eq("id", companyId)
    .maybeSingle<{ slug: string }>();

  if (companyError || !company) {
    return { error: companyError?.message ?? "No fue posible encontrar la empresa seleccionada." };
  }

  const { data: createdBranch, error } = await supabase
    .from("branches")
    .insert({
      company_id: companyId,
      name,
      created_by: context.profile.userId,
      is_main: false,
    })
    .select("slug")
    .single<{ slug: string }>();

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible crear la sede.") };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/sedes/${company.slug}/${createdBranch.slug}`);
  revalidatePath(`/dashboard/companies/${company.slug}`);
  return { success: `Sede "${name}" creada correctamente.` };
}

export async function createBranchDocument(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const sectionKey = readString(formData, "sectionKey");
  const title = readString(formData, "title");
  const description = readString(formData, "description") || null;
  const fileUrl = readString(formData, "fileUrl") || null;
  const pdfFile = readFile(formData, "pdfFile");
  const expiresAt = readString(formData, "expiresAt") || null;
  const sortOrder = readNumber(formData, "sortOrder") ?? 0;
  const isActive = readBoolean(formData, "isActive");

  if (!branchId || !companySlug || !branchSlug || !sectionKey || !title) {
    return { error: "Debes completar la sección, el título y la sede correctamente." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "createBranchDocument",
    branchId,
  });

  let resolvedFileUrl = fileUrl;

  if (pdfFile) {
    const uploadedFile = await uploadBranchDocumentFile({ branchId, file: pdfFile, supabaseClient: supabase });
    resolvedFileUrl = uploadedFile.fileUrl;
  }

  const { error } = await supabase.from("branch_documents").insert({
    branch_id: branchId,
    section_key: sectionKey,
    title,
    description,
    file_url: resolvedFileUrl,
    expires_at: expiresAt || null,
    sort_order: sortOrder,
    is_active: isActive,
  });

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible crear el documento.") };
  }

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  return { success: `Documento "${title}" creado correctamente.` };
}

export async function updateBranchDocument(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const documentId = readString(formData, "documentId");
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const sectionKey = readString(formData, "sectionKey");
  const title = readString(formData, "title");
  const description = readString(formData, "description") || null;
  const fileUrl = readString(formData, "fileUrl") || null;
  const pdfFile = readFile(formData, "pdfFile");
  const expiresAt = readString(formData, "expiresAt") || null;
  const sortOrder = readNumber(formData, "sortOrder") ?? 0;
  const isActive = readBoolean(formData, "isActive");

  if (!documentId || !branchId || !companySlug || !branchSlug || !sectionKey || !title) {
    return { error: "Debes completar los datos del documento correctamente." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "updateBranchDocument",
    branchId,
    documentId,
  });

  const { data: currentDocument, error: currentDocumentError } = await supabase
    .from("branch_documents")
    .select("file_url")
    .eq("id", documentId)
    .eq("branch_id", branchId)
    .maybeSingle<{ file_url: string | null }>();

  if (currentDocumentError || !currentDocument) {
    return { error: currentDocumentError?.message ?? "No fue posible encontrar el documento actual." };
  }

  let resolvedFileUrl = fileUrl;

  if (pdfFile) {
    await deleteBranchDocumentFile(currentDocument.file_url, supabase);
    const uploadedFile = await uploadBranchDocumentFile({ branchId, file: pdfFile, supabaseClient: supabase });
    resolvedFileUrl = uploadedFile.fileUrl;
  }

  const { error } = await supabase
    .from("branch_documents")
    .update({
      section_key: sectionKey,
      title,
      description,
      file_url: resolvedFileUrl,
      expires_at: expiresAt || null,
      sort_order: sortOrder,
      is_active: isActive,
    })
    .eq("id", documentId)
    .eq("branch_id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible actualizar el documento.") };
  }

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  return { success: `Documento "${title}" actualizado correctamente.` };
}

export async function deleteBranchDocument(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const documentId = readString(formData, "documentId");
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");

  if (!documentId || !branchId || !companySlug || !branchSlug) {
    return { error: "Debes indicar el documento y la sede correctamente." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "deleteBranchDocument",
    branchId,
    documentId,
  });

  const { data: currentDocument, error: currentDocumentError } = await supabase
    .from("branch_documents")
    .select("file_url")
    .eq("id", documentId)
    .eq("branch_id", branchId)
    .maybeSingle<{ file_url: string | null }>();

  if (currentDocumentError || !currentDocument) {
    return { error: currentDocumentError?.message ?? "No fue posible encontrar el documento." };
  }

  const { error } = await supabase.from("branch_documents").delete().eq("id", documentId).eq("branch_id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible eliminar el documento.") };
  }

  await deleteBranchDocumentFile(currentDocument.file_url, supabase);

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  return { success: "Documento eliminado correctamente." };
}

export async function createBranchDocumentAction(formData: FormData) {
  await createBranchDocument(undefined, formData);
}

export async function updateBranchDocumentAction(formData: FormData) {
  await updateBranchDocument(undefined, formData);
}

export async function deleteBranchDocumentAction(formData: FormData) {
  await deleteBranchDocument(undefined, formData);
}

export async function saveBranchSanitaryDocumentFileAction(
  formData: FormData,
): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const documentId = readString(formData, "documentId") || null;
  const documentKind = readSanitaryDocumentKind(formData);
  const expiresAt = readString(formData, "expiresAt") || null;
  const metadata = readMetadata(formData);
  const pdfFile = readFile(formData, "pdfFile");

  if (!branchId || !companySlug || !branchSlug || !documentKind) {
    return { error: "No fue posible identificar la sede y el tipo de documento." };
  }

  if (pdfFile) {
    const validationError = validateSanitaryPdfFile(pdfFile, documentKind);

    if (validationError) {
      return { error: validationError };
    }
  }

  if (!documentId && !pdfFile) {
    return { error: "Debes seleccionar un PDF para guardar el documento." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "saveBranchSanitaryDocumentFileAction",
    branchId,
    documentKind,
  });
  const sanitizedExpiresAt = documentKind === "acu_final_disposal_certificate" ? null : expiresAt;

  try {
    if (
      !documentId &&
      (documentKind === "pest_control_certificate" ||
        documentKind === "water_tank_cleaning_certificate" ||
        documentKind === "acu_final_disposal_certificate")
    ) {
      const { count, error: countError } = await supabase
        .from("branch_sanitary_document_files")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("document_kind", documentKind)
        .eq("is_active", true);

      if (countError) {
        return { error: formatDatabaseError(countError, "No fue posible validar el limite de registros.") };
      }

      if ((count ?? 0) >= MAX_DOCUMENT_SECTION_RECORDS) {
        return { error: `Esta sección permite máximo ${MAX_DOCUMENT_SECTION_RECORDS} registros almacenados.` };
      }
    }

    const nextFileValues: Partial<BranchSanitaryDocumentFileRow> = {};

    if (pdfFile) {
      const uploadedFile = await uploadBranchDocumentFile({ branchId, file: pdfFile, supabaseClient: supabase });
      nextFileValues.file_url = uploadedFile.fileUrl;
      nextFileValues.file_name = pdfFile.name;
      nextFileValues.file_size_bytes = pdfFile.size;
      nextFileValues.mime_type = "application/pdf";
    }

    if (documentId) {
      const { data: currentFile, error: currentFileError } = await supabase
        .from("branch_sanitary_document_files")
        .select("file_url")
        .eq("id", documentId)
        .eq("branch_id", branchId)
        .maybeSingle<{ file_url: string | null }>();

      if (currentFileError || !currentFile) {
        return { error: currentFileError?.message ?? "No fue posible encontrar el documento actual." };
      }

      const { data, error } = await supabase
        .from("branch_sanitary_document_files")
        .update({
          ...nextFileValues,
          metadata,
          expires_at: sanitizedExpiresAt,
          is_active: true,
        })
        .eq("id", documentId)
        .eq("branch_id", branchId)
        .select(getSanitaryDocumentFileSelect())
        .single<BranchSanitaryDocumentFileRow>();

      if (error) {
        return { error: formatDatabaseError(error, "No fue posible guardar el documento.") };
      }

      if (pdfFile) {
        await deleteBranchDocumentFile(currentFile.file_url, supabase);
      }

      revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
      revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
      return { success: "Documento guardado correctamente.", file: mapSanitaryDocumentFileRow(data) };
    }

    if (documentKind === "sanitation_plan") {
      await supabase
        .from("branch_sanitary_document_files")
        .update({ is_active: false })
        .eq("branch_id", branchId)
        .eq("document_kind", documentKind)
        .eq("is_active", true);
    }

    const { data, error } = await supabase
      .from("branch_sanitary_document_files")
      .insert({
        branch_id: branchId,
        company_id: branch.companyId,
        document_kind: documentKind,
        file_url: nextFileValues.file_url,
        file_name: nextFileValues.file_name,
        file_size_bytes: nextFileValues.file_size_bytes,
        mime_type: "application/pdf",
        metadata,
        expires_at: sanitizedExpiresAt,
        is_active: true,
      })
      .select(getSanitaryDocumentFileSelect())
      .single<BranchSanitaryDocumentFileRow>();

    if (error) {
      return { error: formatDatabaseError(error, "No fue posible crear el documento.") };
    }

    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
    return { success: "Documento guardado correctamente.", file: mapSanitaryDocumentFileRow(data) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No fue posible guardar el documento." };
  }
}

async function saveOwnedSanitaryDocumentFile({
  branchId,
  companyId,
  documentKind,
  file,
  supabaseClient,
  expiresAt = null,
  metadata = {},
  chemicalProductId = null,
  staffMemberId = null,
}: {
  branchId: string;
  companyId: string;
  documentKind: BranchSanitaryDocumentKind;
  file: File;
  supabaseClient: SupabaseClient;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  chemicalProductId?: string | null;
  staffMemberId?: string | null;
}) {
  const validationError = validateSanitaryPdfFile(file, documentKind);

  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = supabaseClient;

  await supabase
    .from("branch_sanitary_document_files")
    .update({ is_active: false })
    .eq("branch_id", branchId)
    .eq("document_kind", documentKind)
    .eq("is_active", true)
    .match({
      ...(chemicalProductId ? { chemical_product_id: chemicalProductId } : {}),
      ...(staffMemberId ? { staff_member_id: staffMemberId } : {}),
    });

  const uploadedFile = await uploadBranchDocumentFile({ branchId, file, supabaseClient: supabase });
  const { data, error } = await supabase
    .from("branch_sanitary_document_files")
    .insert({
      branch_id: branchId,
      company_id: companyId,
      document_kind: documentKind,
      chemical_product_id: chemicalProductId,
      staff_member_id: staffMemberId,
      file_url: uploadedFile.fileUrl,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: "application/pdf",
      metadata,
      expires_at: expiresAt,
      is_active: true,
    })
    .select(getSanitaryDocumentFileSelect())
    .single<BranchSanitaryDocumentFileRow>();

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible guardar el archivo."));
  }

  return mapSanitaryDocumentFileRow(data);
}

async function updateOwnedSanitaryDocumentFileMetadata({
  branchId,
  documentKind,
  supabaseClient,
  expiresAt,
  metadata,
  chemicalProductId = null,
  staffMemberId = null,
}: {
  branchId: string;
  documentKind: BranchSanitaryDocumentKind;
  supabaseClient: SupabaseClient;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  chemicalProductId?: string | null;
  staffMemberId?: string | null;
}) {
  const { error } = await supabaseClient
    .from("branch_sanitary_document_files")
    .update({
      metadata,
      expires_at: expiresAt,
      is_active: true,
    })
    .eq("branch_id", branchId)
    .eq("document_kind", documentKind)
    .eq("is_active", true)
    .match({
      ...(chemicalProductId ? { chemical_product_id: chemicalProductId } : {}),
      ...(staffMemberId ? { staff_member_id: staffMemberId } : {}),
    });

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible actualizar la fecha del archivo."));
  }
}

export async function saveBranchChemicalProductAction(
  formData: FormData,
): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const productId = readString(formData, "productId") || null;
  const productName = readString(formData, "productName");
  const technicalSheetPdf = readFile(formData, "technicalSheetPdf");
  const safetySheetPdf = readFile(formData, "safetySheetPdf");

  if (!branchId || !companySlug || !branchSlug || !productName) {
    return { error: "Debes indicar la sede y el nombre del producto." };
  }

  if (!productId && !technicalSheetPdf && !safetySheetPdf) {
    return { error: "Debes cargar al menos un PDF del producto." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "saveBranchChemicalProductAction",
    branchId,
  });

  try {
    if (!productId) {
      const { count, error: countError } = await supabase
        .from("branch_chemical_products")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("is_active", true);

      if (countError) {
        return { error: formatDatabaseError(countError, "No fue posible validar el limite de productos.") };
      }

      if ((count ?? 0) >= MAX_DOCUMENT_SECTION_RECORDS) {
        return { error: `Esta sección permite máximo ${MAX_DOCUMENT_SECTION_RECORDS} registros almacenados.` };
      }
    }

    const productQuery = productId
      ? supabase
          .from("branch_chemical_products")
          .update({ name: productName, is_active: true })
          .eq("id", productId)
          .eq("branch_id", branchId)
      : supabase.from("branch_chemical_products").insert({
          branch_id: branchId,
          company_id: branch.companyId,
          name: productName,
          is_active: true,
        });

    const { data: productRow, error: productError } = await productQuery
      .select("id, branch_id, company_id, name, is_active, updated_at")
      .single<BranchChemicalProductRow>();

    if (productError) {
      return { error: formatDatabaseError(productError, "No fue posible guardar el producto.") };
    }

    const savedFiles: BranchSanitaryDocumentFileSummary[] = [];

    if (technicalSheetPdf) {
      savedFiles.push(
        await saveOwnedSanitaryDocumentFile({
          branchId,
          companyId: branch.companyId,
          documentKind: "chemical_technical_sheet",
          file: technicalSheetPdf,
          supabaseClient: supabase,
          chemicalProductId: productRow.id,
        }),
      );
    }

    if (safetySheetPdf) {
      savedFiles.push(
        await saveOwnedSanitaryDocumentFile({
          branchId,
          companyId: branch.companyId,
          documentKind: "chemical_safety_sheet",
          file: safetySheetPdf,
          supabaseClient: supabase,
          chemicalProductId: productRow.id,
        }),
      );
    }

    const { data: productFiles, error: filesError } = await supabase
      .from("branch_sanitary_document_files")
      .select(getSanitaryDocumentFileSelect())
      .eq("branch_id", branchId)
      .eq("chemical_product_id", productRow.id)
      .eq("is_active", true)
      .returns<BranchSanitaryDocumentFileRow[]>();

    if (filesError) {
      return { error: formatDatabaseError(filesError, "No fue posible leer los archivos del producto.") };
    }

    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
    return {
      success: "Producto guardado correctamente.",
      product: mapChemicalProductRow(productRow),
      files: productFiles?.map(mapSanitaryDocumentFileRow) ?? savedFiles,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No fue posible guardar el producto." };
  }
}

export async function saveBranchStaffMemberAction(formData: FormData): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const staffMemberId = readString(formData, "staffMemberId") || null;
  const fullName = readString(formData, "fullName");
  const foodHandlingIssuedAt = readString(formData, "foodHandlingIssuedAt");
  const foodHandlingExpiresAt = readString(formData, "foodHandlingExpiresAt") || null;
  const foodHandlingValidityMonths = readString(formData, "foodHandlingValidityMonths") || "12";
  const medicalExamIssuedAt = readString(formData, "medicalExamIssuedAt");
  const medicalExamExpiresAt = readString(formData, "medicalExamExpiresAt") || null;
  const medicalExamValidityMonths = readString(formData, "medicalExamValidityMonths") || "12";
  const foodHandlingPdf = readFile(formData, "foodHandlingPdf");
  const medicalExamPdf = readFile(formData, "medicalExamPdf");

  if (!branchId || !companySlug || !branchSlug || !fullName) {
    return { error: "Debes indicar la sede y el nombre del empleado." };
  }

  if (!staffMemberId && !foodHandlingPdf && !medicalExamPdf) {
    return { error: "Debes cargar al menos un PDF del empleado." };
  }

  if ((foodHandlingPdf && !foodHandlingExpiresAt) || (medicalExamPdf && !medicalExamExpiresAt)) {
    return { error: "Debes indicar la fecha del PDF que vas a guardar." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "saveBranchStaffMemberAction",
    branchId,
  });

  try {
    if (!staffMemberId) {
      const { count, error: countError } = await supabase
        .from("branch_staff_members")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("is_active", true);

      if (countError) {
        return { error: formatDatabaseError(countError, "No fue posible validar el limite de empleados.") };
      }

      if ((count ?? 0) >= MAX_DOCUMENT_SECTION_RECORDS) {
        return { error: `Esta sección permite máximo ${MAX_DOCUMENT_SECTION_RECORDS} registros almacenados.` };
      }
    }

    const staffQuery = staffMemberId
      ? supabase
          .from("branch_staff_members")
          .update({ full_name: fullName, is_active: true })
          .eq("id", staffMemberId)
          .eq("branch_id", branchId)
      : supabase.from("branch_staff_members").insert({
          branch_id: branchId,
          company_id: branch.companyId,
          full_name: fullName,
          is_active: true,
        });

    const { data: staffRow, error: staffError } = await staffQuery
      .select("id, branch_id, company_id, full_name, is_active, updated_at")
      .single<BranchStaffMemberRow>();

    if (staffError) {
      return { error: formatDatabaseError(staffError, "No fue posible guardar el empleado.") };
    }

    const savedFiles: BranchSanitaryDocumentFileSummary[] = [];

    if (foodHandlingPdf) {
      savedFiles.push(
        await saveOwnedSanitaryDocumentFile({
          branchId,
          companyId: branch.companyId,
          documentKind: "food_handling_course",
          file: foodHandlingPdf,
          supabaseClient: supabase,
          staffMemberId: staffRow.id,
          expiresAt: foodHandlingExpiresAt,
          metadata: { issuedAt: foodHandlingIssuedAt, validityMonths: foodHandlingValidityMonths },
        }),
      );
    } else if (staffMemberId && foodHandlingIssuedAt && foodHandlingExpiresAt) {
      await updateOwnedSanitaryDocumentFileMetadata({
        branchId,
        documentKind: "food_handling_course",
        supabaseClient: supabase,
        staffMemberId: staffRow.id,
        expiresAt: foodHandlingExpiresAt,
        metadata: { issuedAt: foodHandlingIssuedAt, validityMonths: foodHandlingValidityMonths },
      });
    }

    if (medicalExamPdf) {
      savedFiles.push(
        await saveOwnedSanitaryDocumentFile({
          branchId,
          companyId: branch.companyId,
          documentKind: "medical_fitness_exam",
          file: medicalExamPdf,
          supabaseClient: supabase,
          staffMemberId: staffRow.id,
          expiresAt: medicalExamExpiresAt,
          metadata: { issuedAt: medicalExamIssuedAt, validityMonths: medicalExamValidityMonths },
        }),
      );
    } else if (staffMemberId && medicalExamIssuedAt && medicalExamExpiresAt) {
      await updateOwnedSanitaryDocumentFileMetadata({
        branchId,
        documentKind: "medical_fitness_exam",
        supabaseClient: supabase,
        staffMemberId: staffRow.id,
        expiresAt: medicalExamExpiresAt,
        metadata: { issuedAt: medicalExamIssuedAt, validityMonths: medicalExamValidityMonths },
      });
    }

    const { data: staffFiles, error: filesError } = await supabase
      .from("branch_sanitary_document_files")
      .select(getSanitaryDocumentFileSelect())
      .eq("branch_id", branchId)
      .eq("staff_member_id", staffRow.id)
      .eq("is_active", true)
      .returns<BranchSanitaryDocumentFileRow[]>();

    if (filesError) {
      return { error: formatDatabaseError(filesError, "No fue posible leer los archivos del empleado.") };
    }

    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
    revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
    return {
      success: "Empleado guardado correctamente.",
      staffMember: mapStaffMemberRow(staffRow),
      files: staffFiles?.map(mapSanitaryDocumentFileRow) ?? savedFiles,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No fue posible guardar el empleado." };
  }
}

export async function archiveBranchSanitaryDocumentFileAction(
  formData: FormData,
): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const documentId = readString(formData, "documentId");

  if (!branchId || !companySlug || !branchSlug || !documentId) {
    return { error: "Debes indicar el documento a eliminar." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "archiveBranchSanitaryDocumentFileAction",
    branchId,
    documentId,
  });

  const { error } = await supabase
    .from("branch_sanitary_document_files")
    .update({ is_active: false })
    .eq("id", documentId)
    .eq("branch_id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible eliminar el documento.") };
  }

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
  return { success: "Documento eliminado correctamente.", id: documentId };
}

export async function archiveBranchChemicalProductAction(
  formData: FormData,
): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const productId = readString(formData, "productId");

  if (!branchId || !companySlug || !branchSlug || !productId) {
    return { error: "Debes indicar el producto a eliminar." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "archiveBranchChemicalProductAction",
    branchId,
    productId,
  });

  const { error } = await supabase
    .from("branch_chemical_products")
    .update({ is_active: false })
    .eq("id", productId)
    .eq("branch_id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible eliminar el producto.") };
  }

  await supabase
    .from("branch_sanitary_document_files")
    .update({ is_active: false })
    .eq("branch_id", branchId)
    .eq("chemical_product_id", productId);

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
  return { success: "Producto eliminado correctamente.", id: productId };
}

export async function archiveBranchStaffMemberAction(
  formData: FormData,
): Promise<SanitaryDocumentActionState> {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const staffMemberId = readString(formData, "staffMemberId");

  if (!branchId || !companySlug || !branchSlug || !staffMemberId) {
    return { error: "Debes indicar el empleado a eliminar." };
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    return { error: "La sede seleccionada no coincide con la ruta actual." };
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "archiveBranchStaffMemberAction",
    branchId,
    staffMemberId,
  });

  const { error } = await supabase
    .from("branch_staff_members")
    .update({ is_active: false })
    .eq("id", staffMemberId)
    .eq("branch_id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible eliminar el empleado.") };
  }

  await supabase
    .from("branch_sanitary_document_files")
    .update({ is_active: false })
    .eq("branch_id", branchId)
    .eq("staff_member_id", staffMemberId);

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}/cumplimiento`);
  return { success: "Empleado eliminado correctamente.", id: staffMemberId };
}

async function createBranchCatalogItem({
  formData,
  tableName,
  extraFields = {},
}: {
  formData: FormData;
  tableName: "branch_refrigeration_equipment" | "branch_sanitation_areas";
  extraFields?: Record<string, string>;
}) {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const name = readString(formData, "name");
  const logContext = { tableName, branchId, companySlug, branchSlug, itemName: name };

  if (!branchId || !companySlug || !branchSlug || !name) {
    logServerInfo("branch.catalog.create.skipped_invalid_form", logContext);
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = await getSupabaseRlsClientOrThrow(logContext);

  const { error } = await supabase.from(tableName).insert({
    branch_id: branchId,
    company_id: branch.companyId,
    name,
    is_active: true,
    status: "active",
    ...extraFields,
  });

  if (error) {
    logAdminActionError("branch.catalog.create.failed", error, {
      ...logContext,
      companyId: branch.companyId,
    });
    throw new Error(formatDatabaseError(error, "No fue posible crear el catalogo de la sede."));
  }

  logServerInfo("branch.catalog.create.done", {
    ...logContext,
    companyId: branch.companyId,
  });
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
}

async function toggleBranchCatalogItem({
  formData,
  tableName,
}: {
  formData: FormData;
  tableName: "branch_refrigeration_equipment" | "branch_sanitation_areas";
}) {
  const itemId = readString(formData, "itemId");
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const nextIsActive = readBoolean(formData, "nextIsActive");
  const nextStatus = nextIsActive ? "active" : "inactive";
  const logContext = { tableName, itemId, branchId, companySlug, branchSlug, nextIsActive, nextStatus };

  if (!itemId || !branchId || !companySlug || !branchSlug) {
    logServerInfo("branch.catalog.toggle.skipped_invalid_form", logContext);
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = await getSupabaseRlsClientOrThrow(logContext);

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: nextIsActive, status: nextStatus })
    .eq("id", itemId)
    .eq("branch_id", branchId);

  if (error) {
    logAdminActionError("branch.catalog.toggle.failed", error, logContext);
    throw new Error(formatDatabaseError(error, "No fue posible actualizar el catalogo de la sede."));
  }

  logServerInfo("branch.catalog.toggle.done", logContext);
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
}

async function archiveBranchCatalogItem({
  formData,
  tableName,
}: {
  formData: FormData;
  tableName: "branch_refrigeration_equipment" | "branch_sanitation_areas";
}) {
  const itemId = readString(formData, "itemId");
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const logContext = { tableName, itemId, branchId, companySlug, branchSlug };

  if (!itemId || !branchId || !companySlug || !branchSlug) {
    logServerInfo("branch.catalog.archive.skipped_invalid_form", logContext);
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = await getSupabaseRlsClientOrThrow(logContext);

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: false, status: "archived" })
    .eq("id", itemId)
    .eq("branch_id", branchId);

  if (error) {
    logAdminActionError("branch.catalog.archive.failed", error, logContext);
    throw new Error(formatDatabaseError(error, "No fue posible archivar el catalogo de la sede."));
  }

  logServerInfo("branch.catalog.archive.done", logContext);
  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
}

export async function createBranchRefrigerationEquipmentAction(formData: FormData) {
  try {
    const equipmentType = readRefrigerationEquipmentType(formData);

    if (!equipmentType) {
      return { error: "Selecciona si el equipo es refrigerador o congelador." } satisfies AdminActionState;
    }

    await createBranchCatalogItem({
      formData,
      tableName: "branch_refrigeration_equipment",
      extraFields: { equipment_type: equipmentType satisfies BranchRefrigerationEquipmentType },
    });
    return { success: "Opción agregada correctamente." } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.refrigeration.create.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible crear la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function createBranchRefrigerationEquipmentStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await createBranchRefrigerationEquipmentAction(formData)) ?? {};
}

export async function toggleBranchRefrigerationEquipmentAction(formData: FormData) {
  try {
    const nextIsActive = readBoolean(formData, "nextIsActive");
    await toggleBranchCatalogItem({ formData, tableName: "branch_refrigeration_equipment" });
    return {
      success: nextIsActive ? "Elemento activado correctamente." : "Elemento inactivado correctamente.",
    } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.refrigeration.toggle.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible actualizar la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function toggleBranchRefrigerationEquipmentStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await toggleBranchRefrigerationEquipmentAction(formData)) ?? {};
}

export async function archiveBranchRefrigerationEquipmentAction(formData: FormData) {
  try {
    await archiveBranchCatalogItem({ formData, tableName: "branch_refrigeration_equipment" });
    return { success: "Opción eliminada correctamente." } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.refrigeration.archive.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible eliminar la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function archiveBranchRefrigerationEquipmentStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await archiveBranchRefrigerationEquipmentAction(formData)) ?? {};
}

export async function createBranchSanitationAreaAction(formData: FormData) {
  try {
    await createBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
    return { success: "Opción agregada correctamente." } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.sanitation.create.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible crear la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function createBranchSanitationAreaStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await createBranchSanitationAreaAction(formData)) ?? {};
}

export async function toggleBranchSanitationAreaAction(formData: FormData) {
  try {
    const nextIsActive = readBoolean(formData, "nextIsActive");
    await toggleBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
    return {
      success: nextIsActive ? "Elemento activado correctamente." : "Elemento inactivado correctamente.",
    } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.sanitation.toggle.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible actualizar la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function toggleBranchSanitationAreaStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await toggleBranchSanitationAreaAction(formData)) ?? {};
}

export async function archiveBranchSanitationAreaAction(formData: FormData) {
  try {
    await archiveBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
    return { success: "Opción eliminada correctamente." } satisfies AdminActionState;
  } catch (error) {
    logAdminActionError("branch.catalog.sanitation.archive.action_failed", error);
    return {
      error: formatActionError(error, "No fue posible eliminar la opción del formulario."),
    } satisfies AdminActionState;
  }
}

export async function archiveBranchSanitationAreaStateAction(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  return (await archiveBranchSanitationAreaAction(formData)) ?? {};
}

async function createUserRecord({
  email,
  phone,
  phoneOtpCode,
  fullName,
  password,
  role,
  companyId,
}: {
  email: string | null;
  phone: string;
  phoneOtpCode: string;
  fullName: string;
  password: string;
  role: AppRole;
  companyId?: string;
}) {
  if (role === "owner") {
    throw new Error("No es posible crear owner desde este panel.");
  }

  const supabase = await getSupabaseRlsClientOrThrow({
    operation: "createUserRecord",
    role,
  });

  if (role === "company_admin") {
    if (!companyId) {
      throw new Error("Debes indicar una empresa válida.");
    }

    const { data: targetCompany, error: targetCompanyError } = await supabase
      .from("companies")
      .select("company_admin_user_id")
      .eq("id", companyId)
      .maybeSingle<{ company_admin_user_id: string | null }>();

    if (targetCompanyError || !targetCompany) {
      throw new Error(targetCompanyError?.message ?? "No fue posible encontrar la empresa seleccionada.");
    }

    if (targetCompany.company_admin_user_id) {
      throw new Error("La empresa seleccionada ya tiene un company_admin asignado.");
    }
  } else if (companyId) {
    throw new Error("Solo un company_admin puede tener empresa asignada.");
  }

  const approved = await verifyWhatsAppOTP(phone, phoneOtpCode);

  if (!approved) {
    throw new Error("El código de WhatsApp no es válido o expiró.");
  }

  const adminClient = getSupabaseAdminClientOrThrow({
    operation: "createUserRecord.authAdmin",
    role,
  });

  const { data: createdUser, error: authError } = await adminClient.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: {
      full_name: fullName,
      email,
    },
  });

  if (authError || !createdUser.user) {
    throw new Error(authError?.message ?? "No fue posible crear el usuario en Auth.");
  }

  const userId = createdUser.user.id;

  const { error: provisionError } = await supabase.rpc("provision_app_user", {
    target_user_id: userId,
    target_phone: phone,
    target_full_name: fullName,
    target_role: role,
    target_company_id: role === "company_admin" ? companyId : null,
    target_email: email,
  });

  if (provisionError) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      logAdminActionError("dashboard.user.auth_delete_compensation_failed", deleteError, {
        operation: "createUserRecord",
        userId,
        role,
      });
    }

    throw new Error(provisionError.message);
  }
}

export async function createSuperAdmin(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOwnerAccess();

  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const email = normalizeOptionalEmail(readString(formData, "email"));
  const fullName = readString(formData, "fullName");
  const password = readString(formData, "password");
  const phoneOtpCode = readString(formData, "phoneOtpCode");

  if (!phone || !fullName || password.length < 8 || !phoneOtpCode) {
    return {
      error: "El super_admin requiere nombre, celular, código WhatsApp y una contraseña de mínimo 8 caracteres.",
    };
  }

  try {
    await createUserRecord({
      email,
      phone,
      phoneOtpCode,
      fullName,
      password,
      role: "super_admin",
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible crear el super_admin.",
    };
  }

  revalidatePath("/dashboard");
  return { success: `Super admin "${fullName}" creado correctamente.` };
}

export async function createCompanyAdmin(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOperatorAccess();

  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const email = normalizeOptionalEmail(readString(formData, "email"));
  const fullName = readString(formData, "fullName");
  const password = readString(formData, "password");
  const companyId = readString(formData, "companyId");
  const phoneOtpCode = readString(formData, "phoneOtpCode");

  if (!phone || !fullName || password.length < 8 || !companyId || !phoneOtpCode) {
    return {
      error: "El company_admin requiere nombre, celular, código WhatsApp, contraseña y empresa asignada.",
    };
  }

  try {
    await createUserRecord({
      email,
      phone,
      phoneOtpCode,
      fullName,
      password,
      role: "company_admin",
      companyId,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible crear el company_admin.",
    };
  }

  revalidatePath("/dashboard");
  return { success: `Company admin "${fullName}" creado correctamente.` };
}

export async function sendSuperAdminRegistrationOTP(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOwnerAccess();
  const phone = normalizePhoneNumber(readString(formData, "phone"));

  if (!phone) {
    return { error: "Debes indicar un celular válido." };
  }

  try {
    await sendWhatsAppOTP(phone);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible enviar el código por WhatsApp.",
    };
  }

  return { success: "Código enviado por WhatsApp." };
}

export async function sendCompanyAdminRegistrationOTP(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOperatorAccess();
  const phone = normalizePhoneNumber(readString(formData, "phone"));

  if (!phone) {
    return { error: "Debes indicar un celular válido." };
  }

  try {
    await sendWhatsAppOTP(phone);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible enviar el código por WhatsApp.",
    };
  }

  return { success: "Código enviado por WhatsApp." };
}

export async function updateCompany(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "updateCompany" });

  const companyId = readString(formData, "companyId");
  const name = readString(formData, "name");
  const currentSlug = readString(formData, "currentSlug");

  if (!companyId || !name) {
    return { error: "Debes indicar una empresa y un nombre válidos." };
  }

  const { error } = await supabase.from("companies").update({ name }).eq("id", companyId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible actualizar la empresa.") };
  }

  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("slug")
    .eq("id", companyId)
    .maybeSingle<{ slug: string }>();

  if (fetchError || !company) {
    return { error: fetchError?.message ?? "La empresa se actualizó, pero no se pudo leer la nueva ruta." };
  }

  revalidatePath("/dashboard");

  if (currentSlug) {
    revalidatePath(`/dashboard/companies/${currentSlug}`);
  }

  revalidatePath(`/dashboard/companies/${company.slug}`);
  return { success: `Empresa "${name}" actualizada correctamente.` };
}

export async function updateCompanyBranch(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "updateCompanyBranch" });

  const branchId = readString(formData, "branchId");
  const name = readString(formData, "name");
  const companySlug = readString(formData, "companySlug");

  if (!branchId || !name) {
    return { error: "Debes indicar una sede y un nombre válidos." };
  }

  const { error } = await supabase.from("branches").update({ name }).eq("id", branchId);

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible actualizar la sede.") };
  }

  const branchRouteTarget = await resolveBranchRouteTarget(branchId);

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
  }

  if (branchRouteTarget) {
    revalidatePath(`/dashboard/sedes/${branchRouteTarget.companySlug}/${branchRouteTarget.branchSlug}`);
  }

  return { success: `Sede "${name}" actualizada correctamente.` };
}

export async function toggleCompanyStatus(formData: FormData): Promise<void> {
  await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "toggleCompanyStatus" });

  const companyId = readString(formData, "companyId");
  const nextIsActive = readString(formData, "nextIsActive") === "true";

  if (!companyId) {
    throw new Error("Empresa inválida.");
  }

  const { error } = await supabase.from("companies").update({ is_active: nextIsActive }).eq("id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/companies/[slug]", "page");
}

export async function toggleUserStatus(formData: FormData): Promise<void> {
  const context = await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "toggleUserStatus" });

  const userId = readString(formData, "userId");
  const nextIsActive = readString(formData, "nextIsActive") === "true";

  if (!userId) {
    throw new Error("Usuario inválido.");
  }

  const { data: targetUser, error: targetUserError } = await supabase
    .from("user_profiles")
    .select("global_role")
    .eq("user_id", userId)
    .maybeSingle<{ global_role: AppRole }>();

  if (targetUserError || !targetUser) {
    throw new Error(targetUserError?.message ?? "No fue posible encontrar el usuario.");
  }

  if (context.profile.globalRole === "super_admin" && targetUser.global_role !== "company_admin") {
    throw new Error("Un super_admin solo puede activar o desactivar company_admin.");
  }

  if (targetUser.global_role === "owner") {
    throw new Error("El owner no puede ser desactivado desde este panel.");
  }

  const { error } = await supabase.from("user_profiles").update({ is_active: nextIsActive }).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/companies/[slug]", "page");
}

export async function toggleCompanyBranchStatus(formData: FormData): Promise<void> {
  await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "toggleCompanyBranchStatus" });

  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const nextIsActive = readString(formData, "nextIsActive") === "true";

  if (!branchId) {
    throw new Error("Sede inválida.");
  }

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("is_main")
    .eq("id", branchId)
    .maybeSingle<{ is_main: boolean }>();

  if (branchError || !branch) {
    throw new Error(branchError?.message ?? "No fue posible encontrar la sede.");
  }

  if (branch.is_main && !nextIsActive) {
    throw new Error("La sede principal no se puede desactivar. Primero asigna otra sede principal.");
  }

  const { error } = await supabase.from("branches").update({ is_active: nextIsActive }).eq("id", branchId);

  if (error) {
    throw new Error(error.message);
  }

  const branchRouteTarget = await resolveBranchRouteTarget(branchId);

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
  }

  if (branchRouteTarget) {
    revalidatePath(`/dashboard/sedes/${branchRouteTarget.companySlug}/${branchRouteTarget.branchSlug}`);
  }
}

export async function setMainCompanyBranch(formData: FormData): Promise<void> {
  await requireOperatorAccess();
  const supabase = await getSupabaseRlsClientOrThrow({ operation: "setMainCompanyBranch" });

  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");

  if (!branchId) {
    throw new Error("Sede inválida.");
  }

  const { error } = await supabase.rpc("set_main_branch", {
    target_branch_id: branchId,
  });

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible actualizar la sede principal."));
  }

  const branchRouteTarget = await resolveBranchRouteTarget(branchId);

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
  }

  if (branchRouteTarget) {
    revalidatePath(`/dashboard/sedes/${branchRouteTarget.companySlug}/${branchRouteTarget.branchSlug}`);
  }
}
