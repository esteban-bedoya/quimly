import type { OperationalRecordDateStatus } from "@/lib/operational-record-dates";

type OperationalRecordStatusDotProps = {
  status: OperationalRecordDateStatus;
  size?: "sm" | "md";
};

const statusLabels: Record<OperationalRecordDateStatus, string> = {
  missing: "Sin registros",
  complete: "Con registros",
};

const statusClasses: Record<OperationalRecordDateStatus, { ping: string; dot: string }> = {
  missing: {
    ping: "bg-red-400",
    dot: "bg-red-500",
  },
  complete: {
    ping: "bg-green-400",
    dot: "bg-green-500",
  },
};

const sizeClasses = {
  sm: "h-1.5 w-1.5",
  md: "h-2.5 w-2.5",
};

export function OperationalRecordStatusDot({ status, size = "md" }: OperationalRecordStatusDotProps) {
  const classNames = statusClasses[status];
  const sizeClassName = sizeClasses[size];

  return (
    <span className={`relative flex ${sizeClassName}`} aria-label={statusLabels[status]} role="img">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${classNames.ping}`} />
      <span className={`relative inline-flex rounded-full ${sizeClassName} ${classNames.dot}`} />
    </span>
  );
}
