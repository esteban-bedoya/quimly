"use server";

import { redirect } from "next/navigation";

import { clearSessionTokens, storeSessionTokens } from "@/lib/auth/session";
import { notificationService } from "@/lib/notifications/notification.service";
import { normalizePhoneNumber } from "@/lib/phone";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export type LoginFormState = {
  error?: string;
  success?: string;
};

export type PasswordResetFormState = {
  error?: string;
  success?: string;
  step?: "request" | "verify";
  phone?: string;
};

export type SignupFormState = {
  error?: string;
  success?: string;
  step?: "details" | "verify";
  establishmentName?: string;
  adminName?: string;
  phone?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase Admin no está configurado para operaciones de autenticación.");
  }

  return supabase;
}

async function markPhoneVerified(userId: string, phone: string) {
  const adminClient = getSupabaseAdminClientOrThrow();

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    phone,
    phone_confirm: true,
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const { error: profileError } = await adminClient
    .from("user_profiles")
    .update({
      phone,
      phone_verified: true,
    })
    .eq("user_id", userId);

  if (profileError) {
    throw new Error(profileError.message);
  }
}

async function findUserProfileByPhone(phone: string) {
  const adminClient = getSupabaseAdminClientOrThrow();
  const { data, error } = await adminClient
    .from("user_profiles")
    .select("user_id")
    .eq("phone", phone)
    .maybeSingle<{ user_id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function sendPhoneOTP(phone: string) {
  await notificationService.sendOTP(phone);
}

async function verifyPhoneOTP(phone: string, code: string) {
  const verification = await notificationService.checkOTP(phone, code);
  return verification.approved;
}

export async function login(_: LoginFormState | undefined, formData: FormData): Promise<LoginFormState | undefined> {
  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const password = readString(formData, "password");

  if (!phone || !password) {
    return { error: "Debes ingresar celular y contraseña." };
  }

  const supabase = getSupabaseAuthClient();

  if (!supabase) {
    return { error: "Faltan variables de entorno de Supabase para iniciar sesión." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    phone,
    password,
  });

  if (error || !data.session || !data.user) {
    return { error: error?.message ?? "No fue posible iniciar sesión." };
  }

  await storeSessionTokens({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  });

  redirect("/dashboard");
}

export async function requestSignupOTP(
  _: SignupFormState | undefined,
  formData: FormData,
): Promise<SignupFormState> {
  const establishmentName = readString(formData, "establishmentName");
  const adminName = readString(formData, "adminName");
  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const password = readString(formData, "password");

  if (!establishmentName || !adminName || !phone || password.length < 8) {
    return {
      error: "Completa establecimiento, administrador, celular y una contraseña de mínimo 8 caracteres.",
      step: "details",
      establishmentName,
      adminName,
      phone: phone ?? undefined,
    };
  }

  try {
    const existingProfile = await findUserProfileByPhone(phone);

    if (existingProfile) {
      return {
        error: "Ya existe una cuenta con ese celular. Inicia sesión o recupera tu contraseña.",
        step: "details",
        establishmentName,
        adminName,
        phone,
      };
    }

    await sendPhoneOTP(phone);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible enviar el código por WhatsApp.",
      step: "details",
      establishmentName,
      adminName,
      phone,
    };
  }

  return {
    success: "Te enviamos un código por WhatsApp para crear tu cuenta.",
    step: "verify",
    establishmentName,
    adminName,
    phone,
  };
}

export async function completeSignupWithOTP(
  _: SignupFormState | undefined,
  formData: FormData,
): Promise<SignupFormState | undefined> {
  const establishmentName = readString(formData, "establishmentName");
  const adminName = readString(formData, "adminName");
  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const password = readString(formData, "password");
  const code = readString(formData, "otpCode");

  if (!establishmentName || !adminName || !phone || password.length < 8 || !code) {
    return {
      error: "Debes ingresar el código y mantener completos los datos de creación.",
      step: "verify",
      establishmentName,
      adminName,
      phone: phone ?? undefined,
    };
  }

  let createdUserId: string | null = null;
  let shouldCompensateAuthUser = false;

  try {
    const approved = await verifyPhoneOTP(phone, code);

    if (!approved) {
      return {
        error: "El código no es válido o expiró.",
        step: "verify",
        establishmentName,
        adminName,
        phone,
      };
    }

    const adminClient = getSupabaseAdminClientOrThrow();
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      user_metadata: {
        full_name: adminName,
        company_name: establishmentName,
      },
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "No fue posible crear el usuario de autenticación.");
    }

    createdUserId = createdUser.user.id;
    shouldCompensateAuthUser = true;

    const { error: onboardingError } = await adminClient.rpc("onboard_company_trial", {
      target_user_id: createdUserId,
      target_phone: phone,
      target_admin_name: adminName,
      target_company_name: establishmentName,
    });

    if (onboardingError) {
      throw new Error(onboardingError.message);
    }

    shouldCompensateAuthUser = false;

    const supabase = getSupabaseAuthClient();

    if (!supabase) {
      return {
        success: "Cuenta creada. Inicia sesión con tu celular y contraseña.",
        step: "details",
      };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      phone,
      password,
    });

    if (sessionError || !sessionData.session) {
      return {
        success: "Cuenta creada. Inicia sesión con tu celular y contraseña.",
        step: "details",
      };
    }

    await storeSessionTokens({
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresAt: sessionData.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    });
  } catch (error) {
    if (createdUserId && shouldCompensateAuthUser) {
      const adminClient = getSupabaseAdminClient();
      await adminClient?.auth.admin.deleteUser(createdUserId);
    }

    return {
      error: error instanceof Error ? error.message : "No fue posible crear la cuenta.",
      step: createdUserId ? "details" : "verify",
      establishmentName,
      adminName,
      phone,
    };
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(
  _: PasswordResetFormState | undefined,
  formData: FormData,
): Promise<PasswordResetFormState> {
  const phone = normalizePhoneNumber(readString(formData, "phone"));

  if (!phone) {
    return { error: "Debes ingresar un celular válido.", step: "request" };
  }

  try {
    await sendPhoneOTP(phone);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible enviar el código por WhatsApp.",
      step: "request",
    };
  }

  return {
    success: "Te enviamos un código por WhatsApp para recuperar tu contraseña.",
    step: "verify",
    phone,
  };
}

export async function resetPasswordWithOTP(
  _: PasswordResetFormState | undefined,
  formData: FormData,
): Promise<PasswordResetFormState> {
  const phone = normalizePhoneNumber(readString(formData, "phone"));
  const code = readString(formData, "otpCode");
  const password = readString(formData, "password");

  if (!phone || !code || password.length < 8) {
    return {
      error: "Debes ingresar celular, código y una nueva contraseña de mínimo 8 caracteres.",
      step: "verify",
      phone: phone ?? undefined,
    };
  }

  try {
    const approved = await verifyPhoneOTP(phone, code);

    if (!approved) {
      return { error: "El código no es válido o expiró.", step: "verify", phone };
    }

    const profile = await findUserProfileByPhone(phone);

    if (!profile) {
      return { error: "No encontramos un usuario con ese celular.", step: "request" };
    }

    const adminClient = getSupabaseAdminClientOrThrow();
    const { error } = await adminClient.auth.admin.updateUserById(profile.user_id, {
      password,
      phone,
      phone_confirm: true,
    });

    if (error) {
      throw new Error(error.message);
    }

    await markPhoneVerified(profile.user_id, phone);

    return { success: "Contraseña actualizada. Ya puedes iniciar sesión.", step: "request" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No fue posible recuperar la contraseña.",
      step: "verify",
      phone,
    };
  }
}

export async function logout() {
  await clearSessionTokens();
  redirect("/login");
}
