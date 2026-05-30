"use server";

import { revalidatePath } from "next/cache";

import { requireBranchAccess } from "@/lib/auth/authorization";
import { requireUserContext } from "@/lib/auth/user-context";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";

export type AdminActionState = {
  error?: string;
  success?: string;
};

type PostgrestErrorLike = {
  code?: string;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
}: {
  branchId: string;
  file: File;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const safeBranchId = branchId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safeBranchId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(getStorageBucketName())
    .upload(fileName, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(getStorageBucketName()).getPublicUrl(fileName);
  return {
    fileUrl: data.publicUrl,
    filePath: fileName,
  };
}

async function deleteBranchDocumentFile(fileUrl: string | null) {
  if (!fileUrl) {
    return;
  }

  const filePath = getFilePathFromUrl(fileUrl);
  if (!filePath) {
    return;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  await supabase.storage.from(getStorageBucketName()).remove([filePath]);
}

function formatDatabaseError(error: PostgrestErrorLike, fallback: string) {
  if (error.code === "23505") {
    if (error.message.includes("companies_slug")) {
      return "Ya existe una empresa con un nombre que genera el mismo identificador interno.";
    }

    if (error.message.includes("branches_company_id_slug")) {
      return "Ya existe una sede con un nombre equivalente dentro de esa empresa.";
    }
  }

  return error.message || fallback;
}

type BranchRouteTarget = {
  companySlug: string;
  branchSlug: string;
};

async function resolveBranchRouteTarget(branchId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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

export async function createCompanyBranch(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await requireOperatorAccess();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

  let resolvedFileUrl = fileUrl;

  if (pdfFile) {
    const uploadedFile = await uploadBranchDocumentFile({ branchId, file: pdfFile });
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

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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
    await deleteBranchDocumentFile(currentDocument.file_url);
    const uploadedFile = await uploadBranchDocumentFile({ branchId, file: pdfFile });
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

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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

  await deleteBranchDocumentFile(currentDocument.file_url);

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

async function createBranchCatalogItem({
  formData,
  tableName,
}: {
  formData: FormData;
  tableName: "branch_refrigeration_equipment" | "branch_sanitation_areas";
}) {
  const branchId = readString(formData, "branchId");
  const companySlug = readString(formData, "companySlug");
  const branchSlug = readString(formData, "branchSlug");
  const name = readString(formData, "name");

  if (!branchId || !companySlug || !branchSlug || !name) {
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { error } = await supabase.from(tableName).insert({
    branch_id: branchId,
    company_id: branch.companyId,
    name,
    is_active: true,
    status: "active",
  });

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible crear el catalogo de la sede."));
  }

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

  if (!itemId || !branchId || !companySlug || !branchSlug) {
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: nextIsActive, status: nextIsActive ? "active" : "inactive" })
    .eq("id", itemId)
    .eq("branch_id", branchId);

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible actualizar el catalogo de la sede."));
  }

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

  if (!itemId || !branchId || !companySlug || !branchSlug) {
    return;
  }

  const { branch } = await requireBranchAccess(companySlug, branchSlug);

  if (branch.id !== branchId) {
    throw new Error("La sede seleccionada no coincide con la ruta actual.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: false, status: "archived" })
    .eq("id", itemId)
    .eq("branch_id", branchId)
    .eq("is_active", false);

  if (error) {
    throw new Error(formatDatabaseError(error, "No fue posible archivar el catalogo de la sede."));
  }

  revalidatePath(`/dashboard/sedes/${companySlug}/${branchSlug}`);
}

export async function createBranchRefrigerationEquipmentAction(formData: FormData) {
  await createBranchCatalogItem({ formData, tableName: "branch_refrigeration_equipment" });
}

export async function toggleBranchRefrigerationEquipmentAction(formData: FormData) {
  await toggleBranchCatalogItem({ formData, tableName: "branch_refrigeration_equipment" });
}

export async function archiveBranchRefrigerationEquipmentAction(formData: FormData) {
  await archiveBranchCatalogItem({ formData, tableName: "branch_refrigeration_equipment" });
}

export async function createBranchSanitationAreaAction(formData: FormData) {
  await createBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
}

export async function toggleBranchSanitationAreaAction(formData: FormData) {
  await toggleBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
}

export async function archiveBranchSanitationAreaAction(formData: FormData) {
  await archiveBranchCatalogItem({ formData, tableName: "branch_sanitation_areas" });
}

async function createUserRecord({
  email,
  fullName,
  password,
  role,
  companyId,
  canAccessAllCompanies,
}: {
  email: string;
  fullName: string;
  password: string;
  role: AppRole;
  companyId?: string;
  canAccessAllCompanies?: boolean;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { data: createdUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (authError || !createdUser.user) {
    throw new Error(authError?.message ?? "No fue posible crear el usuario en Auth.");
  }

  const userId = createdUser.user.id;

  const { error: profileError } = await supabase.from("user_profiles").insert({
    user_id: userId,
    email,
    full_name: fullName,
    global_role: role,
    is_active: true,
    can_access_all_companies: role === "super_admin" ? Boolean(canAccessAllCompanies) : false,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  if (role === "company_admin" && companyId) {
    const { data: targetCompany, error: targetCompanyError } = await supabase
      .from("companies")
      .select("company_admin_user_id")
      .eq("id", companyId)
      .maybeSingle<{ company_admin_user_id: string | null }>();

    if (targetCompanyError || !targetCompany) {
      await supabase.from("user_profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(targetCompanyError?.message ?? "No fue posible encontrar la empresa seleccionada.");
    }

    if (targetCompany.company_admin_user_id) {
      await supabase.from("user_profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      throw new Error("La empresa seleccionada ya tiene un company_admin asignado.");
    }

    const { error: companyAssignmentError } = await supabase
      .from("companies")
      .update({ company_admin_user_id: userId })
      .eq("id", companyId);

    if (companyAssignmentError) {
      await supabase.from("user_profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(companyAssignmentError.message);
    }

    const { error: defaultCompanyError } = await supabase
      .from("user_profiles")
      .update({ default_company_id: companyId })
      .eq("user_id", userId);

    if (defaultCompanyError) {
      throw new Error(defaultCompanyError.message);
    }
  }
}

export async function createSuperAdmin(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOwnerAccess();

  const email = readString(formData, "email").toLowerCase();
  const fullName = readString(formData, "fullName");
  const password = readString(formData, "password");
  const canAccessAllCompanies = readBoolean(formData, "canAccessAllCompanies");

  if (!email || !fullName || password.length < 8) {
    return {
      error: "El super_admin requiere nombre, correo y una contraseña de mínimo 8 caracteres.",
    };
  }

  try {
    await createUserRecord({
      email,
      fullName,
      password,
      role: "super_admin",
      canAccessAllCompanies,
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

  const email = readString(formData, "email").toLowerCase();
  const fullName = readString(formData, "fullName");
  const password = readString(formData, "password");
  const companyId = readString(formData, "companyId");

  if (!email || !fullName || password.length < 8 || !companyId) {
    return {
      error: "El company_admin requiere nombre, correo, contraseña y empresa asignada.",
    };
  }

  try {
    await createUserRecord({
      email,
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

export async function updateCompany(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  await requireOperatorAccess();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

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
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

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
