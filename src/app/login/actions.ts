"use server";

import { redirect } from "next/navigation";

import { clearSessionTokens, storeSessionTokens } from "@/lib/auth/session";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

type LoginFormState = {
  error?: string;
};

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function login(_: LoginFormState | undefined, formData: FormData): Promise<LoginFormState | undefined> {
  const email = readRequiredString(formData, "email").toLowerCase();
  const password = readRequiredString(formData, "password");

  if (!email || !password) {
    return { error: "Debes ingresar correo y contraseña." };
  }

  const supabase = getSupabaseAuthClient();

  if (!supabase) {
    return { error: "Faltan variables de entorno de Supabase para iniciar sesión." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return { error: error?.message ?? "No fue posible iniciar sesión." };
  }

  await storeSessionTokens({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  });

  redirect("/dashboard");
}

export async function logout() {
  await clearSessionTokens();
  redirect("/login");
}
