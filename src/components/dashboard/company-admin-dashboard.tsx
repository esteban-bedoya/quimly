import Link from "next/link";

import { DashboardHeaderMenu } from "@/components/dashboard/dashboard-header-menu";
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
    <div className={`rounded-[1.15rem] border px-4 py-4 shadow-[0_20px_50px_rgba(18,17,15,0.08)] ${toneStyles[tone]}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] opacity-60">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function BranchCard({ branch }: { branch: AccessibleBranchSummary }) {
  return (
    <article className="group rounded-[1.45rem] border border-[#eef1f2] bg-white p-5 shadow-[0_18px_44px_rgba(18,17,15,0.12)] transition duration-300 hover:-translate-y-0.5 hover:border-white hover:shadow-[0_24px_58px_rgba(18,17,15,0.16)]">
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
    <main className="min-h-screen bg-white px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="relative rounded-[1.75rem] border border-[#2a2926] bg-[#12110f] px-5 py-5 text-white shadow-[0_20px_60px_rgba(18,17,15,0.16)] sm:px-8 sm:py-6">
          <DashboardHeaderMenu profile={profile} branchCount={branches.length} />

          <div className="flex flex-col gap-4 lg:items-start">
            <div className="w-full space-y-3 pr-14 sm:pr-44">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[#8fe3d5]">ADMINISTRACIÓN</p>
                <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-[-0.05em] text-[#e5ecec] sm:text-4xl">
                  {profile.fullName || profile.phone}
                </h1>
              </div>

              <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
                Mantén el control del cumplimiento sanitario de todas tus sedes desde un solo lugar.
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[74rem]">
          <section className="grid gap-6 rounded-[1.45rem] p-5 dashboard-card-surface dashboard-card-surface-operational sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="max-w-3xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">Acceso directo</p>
                <h2 className="text-base font-bold uppercase leading-6 tracking-[0.08em] text-[#2a7f86]">
                  Sedes asociadas a tu operación
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-[#5e6770]">
                  Selecciona una sede para mantener tu establecimiento siempre preparado ante auditorías e inspecciones.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[26rem]">
                <PremiumStat label="Sedes" value={branches.length} />
                <PremiumStat label="Activas" value={activeBranches.length} tone="accent" />
                <PremiumStat label="Principales" value={mainBranches.length} tone="gold" />
              </div>
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
          </section>
        </div>
      </div>
    </main>
  );
}
