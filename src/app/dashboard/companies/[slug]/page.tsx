import Link from "next/link";

import { requireCompanyAccess } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { context, company } = await requireCompanyAccess(slug);

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
                  <p className="text-sm text-[#5d574f]">Slug</p>
                  <p className="font-semibold text-[#12110f]">{company.slug}</p>
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
                <li>`company_admin` solo ve empresas asociadas a sus membresías activas.</li>
                <li>`owner` y `super_admin` operan sobre empresas permitidas por su perfil.</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
