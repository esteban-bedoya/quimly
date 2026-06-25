import Link from "next/link";

import { CompanyAdminDashboard } from "@/components/dashboard/company-admin-dashboard";
import {
  CompanyStatusToggle,
  CompanyBranchStatusBadge,
  CompanyBranchStatusToggle,
  CreateCompanyAdminForm,
  CreateCompanyBranchForm,
  CreateCompanyForm,
  CreateSuperAdminForm,
  EditCompanyBranchForm,
  EditCompanyForm,
  RoleBadge,
  SetMainBranchButton,
  UserStatusToggle,
} from "@/components/dashboard/admin-forms";
import { logout } from "@/app/login/actions";
import {
  getAccessibleBranches,
  getAccessibleCompanies,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { CompanyBranchSummary, CompanySummary, UserProfile } from "@/types/auth";

const roleLabels = {
  owner: "Owner",
  super_admin: "Super admin",
  company_admin: "Company admin",
} as const;

const roleDescriptions = {
  owner: "Control absoluto sobre Quimly, empresas, usuarios y configuración crítica.",
  super_admin: "Acceso global a todas las empresas para soporte, creación y gestión de clientes.",
  company_admin: "Acceso a la operación diaria de su empresa, sin permisos globales.",
} as const;

export const dynamic = "force-dynamic";

type ManagedUserSummary = Pick<UserProfile, "userId" | "email" | "fullName" | "globalRole" | "isActive"> & {
  defaultCompanyName: string | null;
};

type ManagedBranchSummary = CompanyBranchSummary & {
  companyName: string;
  companySlug: string;
};

type ManagedUserRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  global_role: UserProfile["globalRole"];
  is_active: boolean;
  default_company: { name: string } | { name: string }[] | null;
};

type ManagedBranchRow = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  is_main: boolean;
  is_active: boolean;
  company: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

async function getManagementData(role: UserProfile["globalRole"]) {
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return {
      companies: [] as CompanySummary[],
      companyBranches: [] as ManagedBranchSummary[],
      managedUsers: [] as ManagedUserSummary[],
    };
  }

  const [{ data: companies }, { data: companyBranches }, { data: managedUsers }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, slug, is_active, company_admin_user_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("branches")
      .select("id, company_id, name, slug, is_main, is_active, company:companies!inner(name, slug)")
      .order("created_at", { ascending: false })
      .returns<ManagedBranchRow[]>(),
    supabase
      .from("user_profiles")
      .select("user_id, email, full_name, global_role, is_active, default_company:companies(name)")
      .in("global_role", role === "owner" ? ["super_admin", "company_admin"] : ["company_admin"])
      .order("created_at", { ascending: false })
      .returns<ManagedUserRow[]>(),
  ]);

  return {
    companies:
      companies?.map((company) => ({
        id: company.id,
        name: company.name,
        slug: company.slug,
        isActive: company.is_active,
        companyAdminUserId: company.company_admin_user_id,
      })) ?? [],
    companyBranches:
      companyBranches?.flatMap((branch) => {
        const company = Array.isArray(branch.company) ? branch.company[0] ?? null : branch.company;

        if (!company) {
          return [];
        }

        return [
          {
            id: branch.id,
            companyId: branch.company_id,
            name: branch.name,
            slug: branch.slug,
            isMain: branch.is_main,
            isActive: branch.is_active,
            companyName: company.name,
            companySlug: company.slug,
          } satisfies ManagedBranchSummary,
        ];
      }) ?? [],
    managedUsers:
      managedUsers?.map((user) => ({
        userId: user.user_id,
        email: user.email,
        fullName: user.full_name,
        globalRole: user.global_role,
        isActive: user.is_active,
        defaultCompanyName: Array.isArray(user.default_company)
          ? user.default_company[0]?.name ?? null
          : user.default_company?.name ?? null,
      })) ?? [],
  };
}

export default async function DashboardPage() {
  const { profile } = await requireAuthenticatedUser();

  if (profile.globalRole === "company_admin") {
    const accessibleBranches = await getAccessibleBranches({ profile });
    return <CompanyAdminDashboard profile={profile} branches={accessibleBranches} />;
  }

  const accessibleCompanies = await getAccessibleCompanies({ profile });
  const managementData = await getManagementData(profile.globalRole);
  const companiesAvailableForAdminAssignment =
    managementData?.companies.filter((company) => !company.companyAdminUserId) ?? [];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe7_0%,#ebe4d7_100%)] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="w-fit rounded-full bg-[#12110f] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[#7ad9dd]">
                Dashboard
              </p>
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#12110f]">
                  {profile.fullName || profile.email}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#565149] sm:text-base">
                  {roleDescriptions[profile.globalRole]}
                </p>
              </div>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/16 bg-[#f3eee6] px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#eae2d4]"
              >
                Cerrar sesión
              </button>
            </form>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Rol global</p>
              <p className="mt-3 text-xl font-semibold text-[#12110f]">{roleLabels[profile.globalRole]}</p>
            </article>
            <article className="rounded-[1.5rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Empresas accesibles</p>
              <p className="mt-3 text-xl font-semibold text-[#12110f]">{accessibleCompanies.length}</p>
            </article>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-[#12110f]/10 bg-white p-6 shadow-[0_20px_60px_rgba(18,17,15,0.08)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Empresas</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
                  Alcance del usuario
                </h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {accessibleCompanies.length ? (
                accessibleCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="rounded-[1.5rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-[#12110f]">
                          {company.name}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/companies/${company.slug}`}
                        className="inline-flex w-fit rounded-full bg-[#12110f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#1d1b18]"
                      >
                        Entrar
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[#12110f]/16 bg-[#fcfbf8] p-5 text-sm leading-7 text-[#5d574f]">
                  Este usuario todavía no tiene empresas accesibles. `owner` y `super_admin` mantienen acceso global;
                  `company_admin` accede únicamente a su empresa asignada.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#12110f]/10 bg-[#12110f] p-6 text-white shadow-[0_20px_60px_rgba(18,17,15,0.12)] sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7ad9dd]">Permisos</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Resumen del rol actual</h2>

            <ul className="mt-6 space-y-3 text-sm leading-7 text-white/80">
              {profile.globalRole === "owner" ? (
                <>
                  <li>Puede administrar cualquier usuario, empresa y configuración crítica.</li>
                  <li>Puede crear y desactivar `super_admin` y `company_admin`.</li>
                  <li>Puede habilitar y deshabilitar sedes en cualquier empresa.</li>
                  <li>Puede acceder o impersonar cualquier empresa de la plataforma.</li>
                </>
              ) : null}

              {profile.globalRole === "super_admin" ? (
                <>
                  <li>Puede crear empresas y administrar usuarios `company_admin`.</li>
                  <li>Puede crear y desactivar sedes para empresas operativas.</li>
                  <li>Tiene acceso global a todas las empresas de la plataforma.</li>
                  <li>No puede modificar `owner` ni parámetros críticos de seguridad global.</li>
                </>
              ) : null}

            </ul>
          </article>
        </section>

        {profile.globalRole === "owner" || profile.globalRole === "super_admin" ? (
          <section className="overflow-hidden rounded-[2rem] border border-[#12110f]/10 bg-white shadow-[0_20px_60px_rgba(18,17,15,0.08)]">
            <div className="border-b border-[#12110f]/8 bg-[radial-gradient(circle_at_top_left,#86dce0_0%,#f4efe7_44%,#ffffff_100%)] px-6 py-8 sm:px-8">
              <p className="w-fit rounded-full bg-[#12110f] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[#7ad9dd]">
                Panel interno
              </p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-[#12110f]">
                {profile.globalRole === "owner"
                  ? "Alta de estructura base para Quimly desde una sola vista."
                  : "Operación diaria de clientes y estructura comercial desde una sola vista."}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#565149] sm:text-base">
                {profile.globalRole === "owner"
                  ? "Este módulo está diseñado para que el owner configure operación interna y clientes con la misma sensación visual de la landing: bloques claros, contraste fuerte y acciones muy directas."
                  : "Este módulo permite al super_admin crear empresas, dar alta a clientes y activar o desactivar accesos operativos sin tocar configuraciones críticas."}
              </p>
            </div>

            <div className={`grid gap-6 p-6 sm:p-8 ${profile.globalRole === "owner" ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5 shadow-[0_12px_32px_rgba(18,17,15,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Empresas</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Crear empresa</h3>
                <p className="mt-3 text-sm leading-7 text-[#5b564f]">
                  Registra una nueva compañía cliente dentro de la plataforma multi-tenant.
                </p>
                <div className="mt-6">
                  <CreateCompanyForm />
                </div>
              </article>

              {profile.globalRole === "owner" ? (
                <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5 shadow-[0_12px_32px_rgba(18,17,15,0.05)]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Interno Quimly</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Crear super admin</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5b564f]">
                    Crea usuarios internos para soporte, operación y gestión transversal de clientes.
                  </p>
                  <div className="mt-6">
                    <CreateSuperAdminForm />
                  </div>
                </article>
              ) : null}

              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5 shadow-[0_12px_32px_rgba(18,17,15,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Cliente</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Crear company admin</h3>
                <p className="mt-3 text-sm leading-7 text-[#5b564f]">
                  Crea el acceso operativo del cliente y asígnalo a su empresa principal.
                </p>
                <div className="mt-6">
                  <CreateCompanyAdminForm companies={companiesAvailableForAdminAssignment} />
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-5 shadow-[0_12px_32px_rgba(18,17,15,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Sedes</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Crear sede</h3>
                <p className="mt-3 text-sm leading-7 text-[#5b564f]">
                  Registra nuevas unidades operativas dentro de una empresa ya creada.
                </p>
                <div className="mt-6">
                  <CreateCompanyBranchForm companies={managementData?.companies ?? []} />
                </div>
              </article>
            </div>

            <div className="grid gap-6 border-t border-[#12110f]/8 p-6 sm:p-8 lg:grid-cols-[0.95fr_1.05fr]">
              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#12110f] p-6 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7ad9dd]">Estado actual</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Empresas registradas</h3>

                <div className="mt-6 space-y-3">
                  {(managementData?.companies ?? []).length ? (
                    managementData?.companies.map((company) => (
                      <div
                        key={company.id}
                        className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{company.name}</p>
                          </div>
                          <span className="rounded-full bg-[#7ad9dd]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7ad9dd]">
                            {company.isActive ? "Activa" : "Inactiva"}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <Link
                            href={`/dashboard/companies/${company.slug}`}
                            className="text-sm font-semibold text-[#7ad9dd] transition hover:text-white"
                          >
                            Abrir empresa
                          </Link>
                          <CompanyStatusToggle companyId={company.id} isActive={company.isActive} />
                        </div>
                        <div className="mt-4 rounded-[1rem] bg-white/8 p-3">
                          <EditCompanyForm company={company} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-white/18 px-4 py-5 text-sm leading-7 text-white/72">
                      Aún no hay empresas creadas. Empieza creando una y luego asigna su `company_admin`.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Sedes creadas</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">Cobertura operativa</h3>

                <div className="mt-6 space-y-3">
                  {(managementData?.companyBranches ?? []).length ? (
                    managementData?.companyBranches.map((branch) => (
                      <div
                        key={branch.id}
                        className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-[#12110f]">{branch.name}</p>
                            <p className="text-sm text-[#5d574f]">{branch.companyName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {branch.isMain ? (
                              <span className="rounded-full bg-[#12110f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                                Principal
                              </span>
                            ) : (
                              <SetMainBranchButton branchId={branch.id} companySlug={branch.companySlug} />
                            )}
                            <CompanyBranchStatusBadge branch={branch} />
                            <CompanyBranchStatusToggle
                              branchId={branch.id}
                              companySlug={branch.companySlug}
                              isActive={branch.isActive}
                              disabled={branch.isMain}
                            />
                          </div>
                        </div>
                        <div className="mt-4 rounded-[1rem] border border-[#12110f]/8 bg-[#fcfbf8] p-3">
                          <EditCompanyBranchForm branch={branch} companySlug={branch.companySlug} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-[#12110f]/16 px-4 py-5 text-sm leading-7 text-[#5d574f]">
                      Todavía no hay sedes registradas para las empresas de la plataforma.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-[#12110f]/10 bg-[#fcfbf8] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2a7f86]">Usuarios creados</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#12110f]">
                  Operación interna y clientes
                </h3>

                <div className="mt-6 space-y-3">
                  {(managementData?.managedUsers ?? []).length ? (
                    managementData?.managedUsers.map((user) => (
                      <div
                        key={user.userId}
                        className="rounded-[1.25rem] border border-[#12110f]/10 bg-white px-4 py-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-[#12110f]">{user.fullName || user.email}</p>
                            <p className="text-sm text-[#5d574f]">{user.email}</p>
                            {user.defaultCompanyName ? (
                              <p className="text-xs uppercase tracking-[0.14em] text-[#7d766d]">
                                Empresa base: {user.defaultCompanyName}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <RoleBadge role={user.globalRole} />
                            <span className="rounded-full bg-[#f2ebe0] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#6b655d]">
                              {user.isActive ? "Activo" : "Inactivo"}
                            </span>
                            <UserStatusToggle userId={user.userId} isActive={user.isActive} />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-[#12110f]/16 px-4 py-5 text-sm leading-7 text-[#5d574f]">
                      Todavía no hay usuarios operativos creados desde este panel.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
