export const readOnlyBranchSurfaceToneClassName = "border-[#e5e2d9] bg-[#fcfbf8] text-[#716e65]";
export const readOnlyBranchActionToneClassName =
  "border-[#e5e2d9] bg-[#fcfbf8] text-[#5f5b52] hover:border-[#e5e2d9] hover:bg-[#fcfbf8]";
export const readOnlyBranchDashboardCardToneClassName =
  "shadow-[0_12px_30px_rgba(62,59,53,0.04)] hover:border-[#dedbd3] hover:shadow-[0_18px_38px_rgba(62,59,53,0.06)]";

export function ReadOnlyBranchLockIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dfdbd0] bg-[#fdfcf9] text-[#716c61] shadow-[0_2px_6px_rgba(62,59,53,0.05)]"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="10" width="14" height="10" rx="2.5" />
        <path strokeLinecap="round" d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        <path strokeLinecap="round" d="M12 14v2" />
      </svg>
    </span>
  );
}

export function ReadOnlyBranchStatus() {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold leading-6 text-[#5f5b52]">
      <ReadOnlyBranchLockIcon />
      Sede inactiva · acceso solo de lectura
    </p>
  );
}
