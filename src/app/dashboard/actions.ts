"use server";

import { revalidatePath } from "next/cache";

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

  const { error } = await supabase.from("branches").insert({
    company_id: companyId,
    name,
    created_by: context.profile.userId,
    is_main: false,
  });

  if (error) {
    return { error: formatDatabaseError(error, "No fue posible crear la sede.") };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/companies/${company.slug}`);
  return { success: `Sede "${name}" creada correctamente.` };
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

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
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

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
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

  revalidatePath("/dashboard");

  if (companySlug) {
    revalidatePath(`/dashboard/companies/${companySlug}`);
  }
}
