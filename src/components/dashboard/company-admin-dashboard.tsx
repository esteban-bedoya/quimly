import Link from "next/link";

import { logout } from "@/app/login/actions";
import type { AccessibleBranchSummary, UserProfile } from "@/types/auth";

function PremiumStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "muted" | "accent" | "gold";
}) {
  const toneStyles = {
    muted: "border-[#d9dfe0] bg-white text-[#12110f]",
    accent: "border-[#12110f] bg-[#12110f] text-white",
    gold: "border-[#bde5e7] bg-[#effbfb] text-[#1c6a71]",
  } as const;

  return (
    <div className={`rounded-3xl border px-4 py-4 shadow-[0_20px_50px_rgba(18,17,15,0.08)] ${toneStyles[tone]}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] opacity-60">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function BranchCard({ branch }: { branch: AccessibleBranchSummary }) {
  return (
    <article className="group rounded-[1.75rem] border border-[#d9dfe0] bg-white p-5 transition duration-300 hover:border-[#bfcfd1] hover:shadow-[0_24px_70px_rgba(18,17,15,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {branch.isMain ? (
              <span className="rounded-full border border-[#d9dfe0] bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6b655d]">
                Principal
              </span>
            ) : null}
            <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#1c6a71]">
              {branch.isActive ? "Operativa" : "Inactiva"}
            </span>
          </div>

          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">{branch.name}</h3>
            <p className="mt-2 text-sm leading-7 text-[#5f5750]">{branch.companyName}</p>
          </div>
        </div>

        <Link
          href={`/dashboard/sedes/${branch.companySlug}/${branch.slug}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#1d1b18]"
        >
          Gestionar Sede
        </Link>
      </div>
    </article>
  );
}

export function CompanyAdminDashboard({
  profile,
  branches,
}: {
  profile: UserProfile;
  branches: AccessibleBranchSummary[];
}) {
  const activeBranches = branches.filter((branch) => branch.isActive);
  const mainBranches = branches.filter((branch) => branch.isMain);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafb_45%,#eef4f5_100%)] px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#dfe7e8] bg-white shadow-[0_20px_60px_rgba(18,17,15,0.06)]">
          <div className="border-b border-[#dfe7e8] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f9fbfb_45%,#eef7f7_100%)] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <span className="w-fit rounded-full bg-[#12110f] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[#7ad9dd]">
                  Quimly / company_admin
                </span>
                <div>
                  <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[#12110f] sm:text-5xl">
                    {profile.fullName || profile.email}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5e6770] sm:text-base">
                    Selecciona una sede para operar de forma directa, sin pasos intermedios, con una interfaz
                    ejecutiva y enfocada en acciones.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[26rem]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <PremiumStat label="Sedes" value={branches.length} />
                  <PremiumStat label="Activas" value={activeBranches.length} tone="accent" />
                  <PremiumStat label="Principales" value={mainBranches.length} tone="gold" />
                </div>
                <form action={logout} className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9dfe0] bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:border-[#bfcfd1] hover:bg-[#f8fbfb]"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:p-8">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">Acceso directo</p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Sedes asociadas a tu operación
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Cada sede abre su propio espacio de control con bitácoras QR y repositorio documental.
              </p>
            </div>

            <div className="grid gap-4">
              {branches.length ? (
                branches.map((branch) => <BranchCard key={branch.id} branch={branch} />)
              ) : (
                <div className="rounded-[1.75rem] border border-dashed border-[#d9dfe0] bg-[#fbfdfe] px-5 py-8 text-sm leading-7 text-[#5e6770]">
                  Todavía no tienes sedes activas disponibles para este usuario.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
