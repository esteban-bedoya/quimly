import Link from "next/link";

import {
  CompanyBranchStatusBadge,
  CompanyBranchStatusToggle,
  EditCompanyBranchForm,
  RoleBadge,
  SetMainBranchButton,
  UserStatusToggle,
} from "@/components/dashboard/admin-forms";
import { requireCompanyAccess } from "@/lib/auth/authorization";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CompanyBranchSummary } from "@/types/auth";

type CompanyMember = {
  userId: string;
  fullName: string | null;
  email: string;
  isActive: boolean;
};

type CompanyBranch = CompanyBranchSummary;

export const dynamic = "force-dynamic";

async function getCompanyModuleData(companyId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      companyAdmin: null as CompanyMember | null,
      branches: [] as CompanyBranch[],
    };
  }

  const [{ data: companyAdmin }, { data: branches }] = await Promise.all([
    supabase
      .from("companies")
      .select("company_admin:user_profiles!companies_company_admin_user_id_fkey(user_id, full_name, email, is_active)")
      .eq("id", companyId)
      .maybeSingle<{
        company_admin:
          | { user_id: string; full_name: string | null; email: string; is_active: boolean }
          | { user_id: string; full_name: string | null; email: string; is_active: boolean }[]
          | null;
      }>(),
    supabase
      .from("branches")
      .select("id, company_id, name, slug, is_main, is_active")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
  ]);

  const admin = Array.isArray(companyAdmin?.company_admin)
    ? companyAdmin?.company_admin[0] ?? null
    : companyAdmin?.company_admin ?? null;

  return {
    companyAdmin: admin
      ? ({
          userId: admin.user_id,
          fullName: admin.full_name,
          email: admin.email,
          isActive: admin.is_active,
        } satisfies CompanyMember)
      : null,
    branches:
      branches?.map((branch) => ({
        id: branch.id,
        companyId: branch.company_id,
        name: branch.name,
        slug: branch.slug,
        isMain: branch.is_main,
        isActive: branch.is_active,
      })) ?? [],
  };
}

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { context, company } = await requireCompanyAccess(slug);
  const moduleData = await getCompanyModuleData(company.id);
  const canManageCompanyUsers = context.profile.globalRole === "owner" || context.profile.globalRole === "super_admin";
  const canManageSites = canManageCompanyUsers;
  const visibleBranches = canManageSites ? moduleData.branches : moduleData.branches.filter((branch) => branch.isActive);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe7_0%,#ebe4d7_100%)] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#12110f]/10 bg-white shadow-[0_20px_60px_rgba(18,17,15,0.08)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#86dce0_0%,#f4efe7_40%,#ffffff_100%)] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="w-fit rounded-full bg-[#12110f] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[#7ad9dd]">
                  Empresa aislada
                </p>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#12110f]">{company.name}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#565149] sm:text-base">
                  Esta vista ya está protegida por sesión, rol y aislamiento por empresa usando RLS en Supabase.
                </p>
              </div>

              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/16 bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Contexto</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
                Sesión conectada a datos reales
              </h2>

              <div className="mt-6 space-y-3">
                <div className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-3">
                  <p className="text-sm text-[#5d574f]">Empresa</p>
                  <p className="font-semibold text-[#12110f]">{company.name}</p>
                </div>
                <div className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-3">
                  <p className="text-sm text-[#5d574f]">Rol actual</p>
                  <p className="font-semibold text-[#12110f]">{context.profile.globalRole}</p>
                </div>
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#12110f] p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7ad9dd]">Aislamiento</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Reglas aplicadas</h2>

              <ul className="mt-6 space-y-3 text-sm leading-7 text-white/80">
                <li>Si el usuario no tiene sesión, `proxy.ts` y el layout lo envían a `/login`.</li>
                <li>Si no tiene acceso a esta empresa, la consulta RLS no devuelve fila y termina en `notFound()`.</li>
                <li>`company_admin` solo ve empresas donde está asignado como administrador actual.</li>
                <li>`owner` y `super_admin` operan sobre empresas permitidas por su perfil.</li>
              </ul>
            </article>
          </div>

          <div className="grid gap-6 border-t border-[#12110f]/8 p-6 sm:p-8 xl:grid-cols-3">
            <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#12110f] p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7ad9dd]">Módulos internos</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Centro operativo de empresa</h2>

              <div className="mt-6 grid gap-3">
                <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
                  <p className="font-semibold text-white">Acceso y usuarios</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    Controla el `company_admin` activo y el perímetro de acceso interno.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
                  <p className="font-semibold text-white">Configuración base</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    Espacio preparado para sedes, parámetros y configuración operativa de la empresa.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
                  <p className="font-semibold text-white">Operación sanitaria</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    Módulo reservado para próximos flujos de inventario, certificados y rutinas internas.
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Sedes de la empresa</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
                Cobertura habilitada
              </h2>

              <div className="mt-6 space-y-3">
                {visibleBranches.length ? (
                  visibleBranches.map((branch) => (
                    <div key={branch.id} className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-[#12110f]">{branch.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {branch.isMain ? (
                            <span className="rounded-full bg-[#12110f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                              Principal
                            </span>
                          ) : canManageSites ? (
                            <SetMainBranchButton branchId={branch.id} companySlug={company.slug} />
                          ) : null}
                          <CompanyBranchStatusBadge branch={branch} />
                          {canManageSites ? (
                            <CompanyBranchStatusToggle
                              branchId={branch.id}
                              companySlug={company.slug}
                              isActive={branch.isActive}
                              disabled={branch.isMain}
                            />
                          ) : null}
                        </div>
                      </div>
                      {canManageSites ? (
                        <div className="mt-4 rounded-[1rem] border border-[#12110f]/8 bg-[#fcfbf8] p-3">
                          <EditCompanyBranchForm branch={branch} companySlug={company.slug} />
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-[#12110f]/16 px-4 py-5 text-sm leading-7 text-[#5d574f]">
                    {canManageSites
                      ? "Esta empresa todavía no tiene sedes registradas."
                      : "Todavía no hay sedes activas habilitadas para tu operación."}
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Administrador de la empresa</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
                Administrador con acceso actual
              </h2>

              <div className="mt-6 space-y-3">
                {moduleData.companyAdmin ? (
                  <div className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-[#12110f]">
                          {moduleData.companyAdmin.fullName || moduleData.companyAdmin.email}
                        </p>
                        <p className="text-sm text-[#5d574f]">{moduleData.companyAdmin.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleBadge role="company_admin" />
                        <span className="rounded-full bg-[#f2ebe0] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#6b655d]">
                          {moduleData.companyAdmin.isActive ? "Activo" : "Inactivo"}
                        </span>
                        {canManageCompanyUsers ? (
                          <UserStatusToggle userId={moduleData.companyAdmin.userId} isActive={moduleData.companyAdmin.isActive} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-[#12110f]/16 px-4 py-5 text-sm leading-7 text-[#5d574f]">
                    Esta empresa todavía no tiene un `company_admin` asignado.
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
