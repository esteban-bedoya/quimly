import { notFound } from "next/navigation";
import { cache } from "react";

import { OperationalPublicForm } from "@/components/public-forms/operational-public-form";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { isOperationalFormType } from "@/lib/operational-forms";
import { logServerError } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { BranchRefrigerationEquipmentType } from "@/types/auth";

export const dynamic = "force-dynamic";

const PUBLIC_FORM_REQUIRED_LOAD_TIMEOUT_MS = 8_000;
const PUBLIC_FORM_OPTIONAL_LOAD_TIMEOUT_MS = 4_000;

type PublicOperationalFormPayload = {
  form_type: string;
  branch_name: string;
  company_name: string;
  equipment: CatalogRow[] | null;
  sanitation_areas: CatalogRow[] | null;
};

type CatalogRow = {
  id: string;
  name: string;
  equipmentType?: BranchRefrigerationEquipmentType | null;
  equipment_type?: BranchRefrigerationEquipmentType | null;
};

type AdminAccessibleQrRow = {
  id: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "No fue posible cargar el formulario.";
  }

  return "No fue posible cargar el formulario.";
}

async function withPublicFormTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, operation: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Public form operation timed out: ${operation}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

const loadPublicOperationalFormPayload = cache(async (token: string) => {
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    return {
      payload: null,
      error: new Error("Supabase public client is not configured."),
    };
  }

  const { data, error } = await withPublicFormTimeout(
    supabase.rpc("get_public_operational_form", {
      p_token: token,
    }),
    PUBLIC_FORM_REQUIRED_LOAD_TIMEOUT_MS,
    "get_public_operational_form",
  );

  return {
    payload: data as PublicOperationalFormPayload | null,
    error,
  };
});

async function loadCompletedRecordDateKeys(token: string) {
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    throw new Error("Supabase public client is not configured.");
  }

  const { data, error } = await withPublicFormTimeout(
    supabase.rpc("get_public_operational_form_completed_dates", {
      p_token: token,
    }),
    PUBLIC_FORM_REQUIRED_LOAD_TIMEOUT_MS,
    "get_public_operational_form_completed_dates",
  );

  if (error) {
    logServerError("public_form.page.completed_dates_lookup_failed", error, {
      tokenLength: token.length,
    });
    throw new Error("No fue posible cargar el estado diario del formulario.");
  }

  return Array.isArray(data) ? data.filter((dateKey): dateKey is string => typeof dateKey === "string") : [];
}

function getAdminDisplayName(fullName: string | null, phone: string) {
  return (fullName?.trim() || phone).toLocaleUpperCase("es-CO");
}

function isDashboardAdminLaunch(source: string | string[] | undefined, admin: string | string[] | undefined) {
  return source === "dashboard" && admin === "1";
}

async function loadOperationalFormAdminContext({
  admin,
  source,
  token,
}: {
  admin: string | string[] | undefined;
  source: string | string[] | undefined;
  token: string;
}) {
  if (!isDashboardAdminLaunch(source, admin)) {
    return null;
  }

  const userContext = await getCurrentUserContext();

  if (userContext?.profile.globalRole !== "company_admin") {
    return null;
  }

  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return null;
  }

  const { data: qrRow, error: qrError } = await withPublicFormTimeout(
    supabase
      .from("branch_form_qr_codes")
      .select("id")
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle<AdminAccessibleQrRow>(),
    PUBLIC_FORM_OPTIONAL_LOAD_TIMEOUT_MS,
    "admin_qr_lookup",
  );

  if (qrError) {
    logServerError("public_form.page.admin_qr_lookup_failed", qrError, { tokenLength: token.length });
    return null;
  }

  if (!qrRow?.id) {
    return null;
  }

  return {
    administratorName: getAdminDisplayName(userContext.profile.fullName, userContext.profile.phone),
  };
}

export const metadata = {
  title: "Formulario Quimly",
  robots: { index: false, follow: false },
};

export default async function PublicOperationalFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ admin?: string | string[]; source?: string | string[] }>;
}) {
  const { token } = await params;
  const { admin, source } = await searchParams;
  const { payload, error } = await loadPublicOperationalFormPayload(token);

  if (error) {
    logServerError("public_form.page.load_failed", error, { tokenLength: token.length });
    throw new Error(getErrorMessage(error));
  }

  if (!payload || !isOperationalFormType(payload.form_type)) {
    notFound();
  }

  const equipment = payload.equipment ?? [];
  const completedRecordDateKeysPromise = loadCompletedRecordDateKeys(token);
  const adminContextPromise = loadOperationalFormAdminContext({ admin, source, token });
  const [completedRecordDateKeys, adminContext] = await Promise.all([
    completedRecordDateKeysPromise,
    adminContextPromise,
  ]);

  return (
    <OperationalPublicForm
      token={token}
      formType={payload.form_type}
      branchName={payload.branch_name}
      companyName={payload.company_name}
      equipment={equipment}
      sanitationAreas={payload.sanitation_areas ?? []}
      completedRecordDateKeys={completedRecordDateKeys}
      adminContext={adminContext}
    />
  );
}
