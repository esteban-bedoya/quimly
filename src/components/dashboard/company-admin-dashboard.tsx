import Link from "next/link";

import {
  CapacityResolutionForm,
  CompanyBranchActionsMenu,
  CreateCompanyBranchForm,
  OpenPlanPaymentsButton,
  ScheduledDowngradeSelectionForm,
} from "@/components/dashboard/admin-forms";
import { DashboardHeaderMenu } from "@/components/dashboard/dashboard-header-menu";
import {
  getBranchCreationBlockedMessage,
  getSiteStatusLabel,
  getSubscriptionViewStateLabel,
  type PlanPaymentsData,
} from "@/lib/billing";
import type { AccessibleBranchSummary, CompanySummary, UserProfile } from "@/types/auth";

const subtleBranchActionButtonClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-4 py-2 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.02] hover:border-[#12110f]/32 hover:bg-[#e7e7e7] disabled:cursor-not-allowed disabled:opacity-55";

type PlanStatusTone = "success" | "info" | "warning" | "critical";

function PremiumStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "muted" | "accent" | PlanStatusTone;
}) {
  const toneStyles = {
    muted: "border-[#d9dfe0] bg-white text-[#12110f]",
    accent: "border-[#12110f] bg-[#12110f] text-white",
    success: "border-[#5fa57b]/35 bg-[#5fa57b]/10 text-[#46795a]",
    info: "border-[#5e9da5]/35 bg-[#5e9da5]/10 text-[#47777d]",
    warning: "border-[#c99a3f]/35 bg-[#c99a3f]/10 text-[#80642d]",
    critical: "border-[#bc7568]/35 bg-[#bc7568]/10 text-[#875348]",
  } as const;

  return (
    <div className={`h-full rounded-[1.15rem] border px-4 py-3 shadow-[0_20px_50px_rgba(18,17,15,0.08)] ${toneStyles[tone]}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] opacity-60">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function AccessIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function BranchCard({ branch }: { branch: AccessibleBranchSummary }) {
  const statusLabel = getSiteStatusLabel(branch.status);

  return (
    <article className="group rounded-[1.45rem] border border-[#eef1f2] bg-white p-5 shadow-[0_18px_44px_rgba(18,17,15,0.12)] transition duration-300 hover:-translate-y-0.5 hover:border-white hover:shadow-[0_24px_58px_rgba(18,17,15,0.16)]">
      <div>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 lg:items-center">
            <div className="min-w-0">
              <div className="space-y-1">
                <span
                  className={`text-[0.68rem] font-semibold uppercase tracking-[0.2em] ${
                    branch.status === "active" ? "text-[#1c6a71]" : "text-[#8a2d1f]"
                  }`}
                >
                  {statusLabel}
                </span>
                <h3 className="text-[1.35rem] font-semibold tracking-[-0.04em] text-[#12110f]">{branch.name}</h3>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={`/dashboard/sedes/${branch.companySlug}/${branch.slug}`}
                aria-label={`Acceder a ${branch.name}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#12110f]/18 bg-[#f1f1f1] px-4 py-2 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.08] hover:border-[#12110f]/32 hover:bg-[#e7e7e7]"
              >
                <AccessIcon />
                Acceder
              </Link>
              <CompanyBranchActionsMenu branch={branch} companySlug={branch.companySlug} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CompanyAdminDashboard({
  profile,
  branches,
  company,
  planPayments,
}: {
  profile: UserProfile;
  branches: AccessibleBranchSummary[];
  company: CompanySummary | null;
  planPayments: PlanPaymentsData;
}) {
  const activeBranches = branches.filter((branch) => branch.status === "active");
  const canCreateBranch = planPayments.accountCapabilities.canCreateBranch;
  const scheduledDowngrade =
    planPayments.scheduledCapacityChange?.changeType === "downgrade" ? planPayments.scheduledCapacityChange : null;
  const branchCreationBlockedMessage = canCreateBranch
    ? null
    : getBranchCreationBlockedMessage({
        subscriptionViewState: planPayments.subscriptionViewState,
        accountCapabilities: planPayments.accountCapabilities,
        hasScheduledDowngrade: Boolean(scheduledDowngrade),
      });
  const requiresCapacityResolution = planPayments.accountCapabilities.requiresCapacityResolution;
  const subscriptionStatusLabel = getSubscriptionViewStateLabel(planPayments.subscriptionViewState);
  const subscriptionStatusTone: PlanStatusTone =
    planPayments.subscriptionViewState === "founder_active" || planPayments.subscriptionViewState === "operational_active"
      ? "success"
      : planPayments.subscriptionViewState === "trial_active"
        ? "info"
        : planPayments.subscriptionViewState === "payment_issue"
          ? "warning"
          : "critical";
  const companyForBranchCreation = company ?? (branches[0]
    ? {
        id: branches[0].companyId,
        name: branches[0].companyName,
        slug: branches[0].companySlug,
        isActive: true,
        companyAdminUserId: profile.userId,
      }
    : null);

  return (
    <main className="min-h-screen bg-white px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="relative rounded-[1.75rem] border border-[#2a2926] bg-[#12110f] px-5 py-5 text-white shadow-[0_20px_60px_rgba(18,17,15,0.16)] sm:px-8 sm:py-6">
          <DashboardHeaderMenu
            profile={profile}
            planPayments={planPayments}
            branches={branches}
          />

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

        <div className="mx-auto grid w-full max-w-[74rem] gap-5">
          {requiresCapacityResolution && companyForBranchCreation ? (
            <div id="resolver-sedes-activas">
              <CapacityResolutionForm
                activeBranches={activeBranches}
                companyId={companyForBranchCreation.id}
                companySlug={companyForBranchCreation.slug}
                maxBranches={planPayments.accountCapabilities.maxBranches}
              />
            </div>
          ) : null}

          <section id="sedes" className="grid gap-6 rounded-[1.45rem] p-5 dashboard-card-surface dashboard-card-surface-operational sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="max-w-3xl space-y-3">
                <h2 className="text-base font-bold uppercase leading-6 tracking-[0.08em] text-[#2a7f86]">
                  Sedes asociadas a tu negocio
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-[#5e6770]">
                  Selecciona una sede para mantener tu establecimiento siempre preparado ante auditorías e inspecciones.
                </p>
              </div>

              <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:min-w-[18rem]">
                <PremiumStat
                  label="Uso de sedes"
                  value={`${activeBranches.length} de ${planPayments.accountCapabilities.maxBranches}`}
                />
                <PremiumStat
                  label="Estado del plan"
                  value={subscriptionStatusLabel}
                  tone={subscriptionStatusTone}
                />
              </div>
            </div>

            {scheduledDowngrade && planPayments.companySlug ? (
              <div id="reduccion-programada">
                <ScheduledDowngradeSelectionForm
                  key={`${scheduledDowngrade.id}:${activeBranches.map((branch) => branch.id).join(":")}`}
                  activeBranches={activeBranches}
                  companySlug={planPayments.companySlug}
                  effectiveAt={scheduledDowngrade.effectiveAt}
                  maxBranches={scheduledDowngrade.requestedMaxActiveLocations}
                  selectedBranchIds={scheduledDowngrade.selectedBranchIds}
                />
              </div>
            ) : null}

            {companyForBranchCreation ? (
              <details className="peer group rounded-[1.25rem] border border-[#d9dfe0] bg-white p-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 text-sm font-semibold text-[#12110f] [&::-webkit-details-marker]:hidden [&::marker]:hidden">
                  <span className="inline-flex h-5 w-7 shrink-0 items-center justify-center text-[#5e6770]">
                    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-90">
                      <path
                        d="m4.25 2.75 4.25 3.25-4.25 3.25Z"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeLinejoin="round"
                        strokeWidth="0.6"
                      />
                    </svg>
                  </span>
                  <span>{canCreateBranch ? "Agregar sede" : branchCreationBlockedMessage?.summaryLabel}</span>
                </summary>
                <div className="mt-4 border-t border-[#eef1f2] pt-4">
                  {branchCreationBlockedMessage ? (
                    <div className="grid gap-5">
                      <div>
                        <p className="text-sm font-semibold leading-6 text-[#12110f]">
                          {branchCreationBlockedMessage.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#5e6770]">
                          {branchCreationBlockedMessage.description}
                        </p>
                      </div>
                      {branchCreationBlockedMessage.action === "resolve_capacity" ? (
                        <a
                          href="#resolver-sedes-activas"
                          className={subtleBranchActionButtonClassName}
                        >
                          {branchCreationBlockedMessage.actionLabel}
                        </a>
                      ) : branchCreationBlockedMessage.action === "manage_scheduled_downgrade" ? (
                        <a
                          href="#reduccion-programada"
                          className={subtleBranchActionButtonClassName}
                        >
                          {branchCreationBlockedMessage.actionLabel}
                        </a>
                      ) : (
                        <OpenPlanPaymentsButton
                          label={branchCreationBlockedMessage.actionLabel}
                          target={planPayments.subscriptionViewState === "payment_issue" ? "payment_method" : "overview"}
                          className={subtleBranchActionButtonClassName}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <p className="text-sm leading-6 text-[#5e6770]">La sede quedará activa de inmediato.</p>
                      <CreateCompanyBranchForm
                        companies={[companyForBranchCreation]}
                        lockedCompanyId={companyForBranchCreation.id}
                        idleLabel="Crear sede activa"
                        pendingLabel="Creando sede..."
                        submitClassName={subtleBranchActionButtonClassName}
                      />
                    </div>
                  )}
                </div>
              </details>
            ) : null}

            <div className="grid gap-4 peer-open:hidden">
              {branches.length ? (
                branches.map((branch) => <BranchCard key={branch.id} branch={branch} />)
              ) : (
                <div className="rounded-[1.75rem] border border-dashed border-[#d9dfe0] bg-[#fbfdfe] px-5 py-8 text-sm leading-7 text-[#5e6770]">
                  Aún no tienes sedes asociadas a tu negocio.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
