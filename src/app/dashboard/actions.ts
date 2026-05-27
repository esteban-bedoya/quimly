"use server";

import { revalidatePath } from "next/cache";

import { requireUserContext } from "@/lib/auth/user-context";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";

export type AdminActionState = {
  error?: string;
  success?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function requireOwnerAccess() {
  const context = await requireUserContext();

  if (context.profile.globalRole !== "owner") {
    throw new Error("Solo el owner puede realizar esta acción.");
  }

  return context;
}

export async function createCompany(
  _: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await requireOwnerAccess();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

  const name = readString(formData, "name");
  const slugInput = readString(formData, "slug");
  const slug = normalizeSlug(slugInput || name);

  if (!name || !slug) {
    return { error: "Debes indicar nombre y slug válidos para la empresa." };
  }

  const { error } = await supabase.from("companies").insert({
    name,
    slug,
    created_by: context.profile.userId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: `Empresa "${name}" creada correctamente.` };
}

async function createUserRecord({
  actorUserId,
  email,
  fullName,
  password,
  role,
  companyId,
  canAccessAllCompanies,
}: {
  actorUserId: string;
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
    const { error: membershipError } = await supabase.from("company_memberships").insert({
      company_id: companyId,
      user_id: userId,
      assigned_by: actorUserId,
      is_active: true,
    });

    if (membershipError) {
      await supabase.from("user_profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(membershipError.message);
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
  const context = await requireOwnerAccess();

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
      actorUserId: context.profile.userId,
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
  const context = await requireOwnerAccess();

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
      actorUserId: context.profile.userId,
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
