"use client";

export type ExecutorSelection = "" | "self" | "operator";

export type AdminExecutorContext = {
  administratorName: string;
};

type ExecutorIdentificationStepProps = {
  title: string;
  executorName: string;
  executorSelection: ExecutorSelection;
  adminContext?: AdminExecutorContext | null;
  onExecutorNameChange: (executorName: string) => void;
  onExecutorSelectionChange: (selection: ExecutorSelection) => void;
  onContinue: () => void;
};

const executorInputClassName =
  "min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-left text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10";

function getExecutorOptionClassName(isSelected: boolean) {
  return [
    "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-base font-black leading-5 transition active:scale-[0.99]",
    isSelected ? "border-[#111816] bg-[#f4faf7] text-neutral-950" : "border-[#c7d8d4] bg-white text-neutral-950",
  ].join(" ");
}

export function ExecutorIdentificationStep({
  title,
  executorName,
  executorSelection,
  adminContext,
  onExecutorNameChange,
  onExecutorSelectionChange,
  onContinue,
}: ExecutorIdentificationStepProps) {
  const isAdminFlow = Boolean(adminContext);
  const canContinue = isAdminFlow
    ? executorSelection === "self" || (executorSelection === "operator" && Boolean(executorName.trim()))
    : Boolean(executorName.trim());

  return (
    <div className="grid gap-7">
      <div className="grid gap-3">
        <h2 className="text-3xl font-black leading-tight text-neutral-950">{title}</h2>
      </div>

      {isAdminFlow ? (
        <div className="grid gap-3" role="radiogroup" aria-label="Identificación del ejecutor">
          <label className={getExecutorOptionClassName(executorSelection === "self")}>
            <input
              type="radio"
              name="executor-selection"
              value="self"
              checked={executorSelection === "self"}
              onChange={() => onExecutorSelectionChange("self")}
              className="h-4 w-4 shrink-0 accent-[#111816]"
            />
            <span>La realicé yo mismo.</span>
          </label>

          <label className={getExecutorOptionClassName(executorSelection === "operator")}>
            <input
              type="radio"
              name="executor-selection"
              value="operator"
              checked={executorSelection === "operator"}
              onChange={() => onExecutorSelectionChange("operator")}
              className="h-4 w-4 shrink-0 accent-[#111816]"
            />
            <span>La realizó un operario.</span>
          </label>

          {executorSelection === "operator" ? (
            <input
              autoComplete="name"
              placeholder="Ej. Ana Gomez"
              value={executorName}
              onChange={(event) => onExecutorNameChange(event.target.value)}
              className={executorInputClassName}
            />
          ) : null}
        </div>
      ) : (
        <input
          autoComplete="name"
          placeholder="Ej. Ana Gomez"
          value={executorName}
          onChange={(event) => onExecutorNameChange(event.target.value)}
          className={executorInputClassName}
        />
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
      >
        Continuar
      </button>
    </div>
  );
}
