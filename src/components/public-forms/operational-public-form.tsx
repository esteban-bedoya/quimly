"use client";

import { type FormEvent, useActionState, useEffect, useMemo, useRef, useState } from "react";

import { submitPublicOperationalForm, type PublicFormState } from "@/app/f/[token]/actions";
import {
  OperationalFormLayout,
  OperationalFormResponsibleSummary,
  OperationalFormSubmitButton,
  OperationalFormSuccessDialog,
  operationalFormStyles,
} from "@/components/public-forms/operational-form-layout";
import { operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import type { BranchRefrigerationEquipmentType } from "@/types/auth";

type CatalogItem = {
  id: string;
  name: string;
  equipment_type?: BranchRefrigerationEquipmentType | null;
};

const refrigerationEquipmentTypeLabels: Record<BranchRefrigerationEquipmentType, string> = {
  refrigerator: "Refrigerador",
  freezer: "Congelador",
};

const supplyProductTypes = ["Ambiente", "Refrigerado", "Congelado"] as const;
type SupplyProductType = (typeof supplyProductTypes)[number];

const supplyDecisions = ["Aceptar Producto", "Rechazar Producto"] as const;
type SupplyDecision = (typeof supplyDecisions)[number];

type YesNoValue = "true" | "false";
type SupplyStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type SupplyActionTakenItem = {
  key: string;
  text: string;
};

const supplyProductTypeLabels: Record<SupplyProductType, string> = {
  Ambiente: "Ambiente",
  Refrigerado: "Refrigerado",
  Congelado: "Congelado",
};

const supplyAcceptedActionPlaceholder = [
  "Ej. Se acepta para uso inmediato.",
  "Ej. Se traslada inmediatamente a refrigeración.",
  "Ej. Se informa al responsable de compras.",
  "Ej. Se bota a la basura parte del lote",
].join("\n");

const supplyRejectedActionPlaceholder = [
  "Ej. Se devuelve al proveedor.",
  "Ej. Se rechaza el lote afectado.",
].join("\n");

const supplyTemperatureSettings: Record<
  Exclude<SupplyProductType, "Ambiente">,
  {
    min: number;
    max: number;
  }
> = {
  Refrigerado: {
    min: -5,
    max: 15,
  },
  Congelado: {
    min: -30,
    max: 2,
  },
};

type SupplyDraft = {
  operatorName?: string;
};

function getTemperatureOptions(productType: SupplyProductType | "") {
  if (productType === "Ambiente" || !productType) {
    return [];
  }

  const settings = supplyTemperatureSettings[productType];

  return Array.from({ length: settings.max - settings.min + 1 }, (_, index) => settings.min + index);
}

function isTemperatureCompliant(productType: SupplyProductType | "", temperatureValue: string) {
  const temperature = Number(temperatureValue);

  if (!Number.isFinite(temperature)) {
    return false;
  }

  if (productType === "Refrigerado") {
    return temperature >= -1 && temperature <= 4;
  }

  if (productType === "Congelado") {
    return temperature <= -18;
  }

  return false;
}

function formatResponsibleName(value: string) {
  return value.toLocaleUpperCase("es-CO");
}

function toDateTimeLocalValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function getRecordDateLimits() {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  return {
    min: toDateTimeLocalValue(fiveDaysAgo),
    max: toDateTimeLocalValue(now),
  };
}

function formatRecordDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--/---/---- --:--";
  }

  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function toIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function PublicFormCardHeader({
  canGoBack,
  onBack,
  stepLabel,
  totalSteps,
}: {
  canGoBack: boolean;
  onBack?: () => void;
  stepLabel: string;
  totalSteps: number;
}) {
  return (
    <div className="border-b border-neutral-100 pb-3">
      <div className="flex w-full items-center gap-4">
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-left text-[11px] font-bold uppercase tracking-widest text-neutral-500 transition hover:text-neutral-800"
          >
            ← Volver
          </button>
        ) : null}

        <p className="ml-auto text-right text-[11px] font-bold uppercase tracking-widest text-neutral-500">
          Paso {stepLabel} de {totalSteps}
        </p>
      </div>
    </div>
  );
}

function PublicFormDateControl({
  dateLabel,
  onOpenDatePicker,
}: {
  dateLabel: string;
  onOpenDatePicker: () => void;
}) {
  return (
    <div className="flex justify-end px-1">
      <button
        type="button"
        onClick={onOpenDatePicker}
        className="grid justify-items-end gap-1 text-right text-white"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white">
          Cambiar fecha y hora:
        </span>
        <span className="font-mono text-xs font-semibold tracking-[0.08em]">
          {dateLabel}
        </span>
      </button>
    </div>
  );
}

export function OperationalPublicForm({
  token,
  formType,
  branchName,
  companyName,
  equipment,
  sanitationAreas,
}: {
  token: string;
  formType: OperationalFormType;
  branchName: string;
  companyName: string;
  equipment: CatalogItem[];
  sanitationAreas: CatalogItem[];
}) {
  const [state, action, isPending] = useActionState<PublicFormState, FormData>(
    submitPublicOperationalForm,
    {},
  );
  const isSupplyReception = formType === "supply_reception";
  const [currentStep, setCurrentStep] = useState<SupplyStep>(1);
  const [operatorName, setOperatorName] = useState("");
  const [productName, setProductName] = useState("");
  const [providerName, setProviderName] = useState("");
  const [productType, setProductType] = useState<SupplyProductType | "">("");
  const [temperatureC, setTemperatureC] = useState("");
  const [packageIntactDateValid, setPackageIntactDateValid] = useState<YesNoValue | "">("");
  const [organolepticAdequate, setOrganolepticAdequate] = useState<YesNoValue | "">("");
  const [decision, setDecision] = useState<SupplyDecision | "">("");
  const [observations, setObservations] = useState("");
  const [actionTakenError, setActionTakenError] = useState("");
  const [hasLoadedSupplyDraft, setHasLoadedSupplyDraft] = useState(false);
  const [isTemperatureMenuOpen, setIsTemperatureMenuOpen] = useState(false);
  const [recordedAtLocalValue, setRecordedAtLocalValue] = useState(() => toDateTimeLocalValue(new Date()));
  const [recordDateLimits, setRecordDateLimits] = useState(() => getRecordDateLimits());
  const [datePickerValue, setDatePickerValue] = useState(recordedAtLocalValue);
  const [hasCustomRecordedAt, setHasCustomRecordedAt] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const temperaturePickerRef = useRef<HTMLDivElement>(null);
  const actionTakenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const label = operationalFormLabels[formType];
  const missingThermalCatalog = formType === "thermal_control" && equipment.length === 0;
  const missingAreaCatalog = formType === "area_sanitation" && sanitationAreas.length === 0;
  const isDisabled = isPending || missingThermalCatalog || missingAreaCatalog;
  const showTemperaturePicker = productType === "Refrigerado" || productType === "Congelado";
  const temperatureOptions = useMemo(() => getTemperatureOptions(productType), [productType]);
  const temperatureCompliant = isTemperatureCompliant(productType, temperatureC);
  const hasSelectedTemperature = temperatureC !== "";
  const supplySubmittedProductName = [productName.trim(), providerName.trim()].filter(Boolean).join(" - ");
  const supplyStorageKey = `quimly:supply-reception:${token}`;
  const supplyActionTakenItems = useMemo<SupplyActionTakenItem[]>(() => {
    const items: SupplyActionTakenItem[] = [];

    if (showTemperaturePicker && hasSelectedTemperature && !temperatureCompliant) {
      items.push({
        key: "temperature",
        text: "Temperatura fuera de rango seguro.",
      });
    }

    if (packageIntactDateValid === "false") {
      items.push({
        key: "package",
        text: "Empaque roto o fecha no vigente.",
      });
    }

    if (organolepticAdequate === "false") {
      items.push({
        key: "organoleptic",
        text: "Aspecto u olor no adecuados.",
      });
    }

    return items;
  }, [
    hasSelectedTemperature,
    organolepticAdequate,
    packageIntactDateValid,
    showTemperaturePicker,
    temperatureCompliant,
  ]);
  const showActionTakenBlock = supplyActionTakenItems.length > 0 || decision === "Rechazar Producto";
  const supplyDecisionTakenItem: SupplyActionTakenItem | null =
    decision === "Aceptar Producto"
      ? {
          key: "accepted",
          text: "Producto aceptado.",
        }
      : decision === "Rechazar Producto"
        ? {
            key: "rejected",
            text: "Producto rechazado.",
          }
        : null;
  const showActionTakenError = Boolean(actionTakenError && showActionTakenBlock && !observations.trim());
  const actionTakenPlaceholder =
    decision === "Rechazar Producto" ? supplyRejectedActionPlaceholder : supplyAcceptedActionPlaceholder;
  const supplyStepLabel =
    currentStep === 2
      ? "2A"
      : currentStep === 3
        ? "2B"
        : currentStep >= 4
          ? String(currentStep - 1)
          : String(currentStep);
  const temperatureStepTitle =
    productType === "Congelado"
      ? "¿Con qué temperatura llegó el producto congelado?"
      : "¿Con qué temperatura llegó el producto refrigerado?";
  const recordedAtDisplay = formatRecordDateLabel(recordedAtLocalValue);
  const recordedAtIsoValue = hasCustomRecordedAt ? toIsoDateTime(recordedAtLocalValue) : "";

  useEffect(() => {
    if (hasCustomRecordedAt || showDatePicker) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRecordedAtLocalValue(toDateTimeLocalValue(new Date()));
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [hasCustomRecordedAt, showDatePicker]);

  useEffect(() => {
    if (!isSupplyReception) {
      return;
    }

    let frameId = 0;

    try {
      const savedDraft = window.localStorage.getItem(supplyStorageKey);

      if (!savedDraft) {
        frameId = window.requestAnimationFrame(() => setHasLoadedSupplyDraft(true));
        return;
      }

      const draft = JSON.parse(savedDraft) as SupplyDraft;

      frameId = window.requestAnimationFrame(() => {
        setOperatorName(typeof draft.operatorName === "string" ? formatResponsibleName(draft.operatorName) : "");
        setHasLoadedSupplyDraft(true);
      });
    } catch {
      frameId = window.requestAnimationFrame(() => setHasLoadedSupplyDraft(true));
    }

    return () => window.cancelAnimationFrame(frameId);
  }, [isSupplyReception, supplyStorageKey]);

  useEffect(() => {
    if (!isSupplyReception || !hasLoadedSupplyDraft) {
      return;
    }

    const draft: SupplyDraft = {
      operatorName,
    };

    window.localStorage.setItem(supplyStorageKey, JSON.stringify(draft));
  }, [
    hasLoadedSupplyDraft,
    isSupplyReception,
    operatorName,
    supplyStorageKey,
  ]);

  useEffect(() => {
    if (!isTemperatureMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!temperaturePickerRef.current?.contains(target)) {
        setIsTemperatureMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTemperatureMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTemperatureMenuOpen]);

  function selectProductType(nextProductType: SupplyProductType) {
    setProductType(nextProductType);
    setIsTemperatureMenuOpen(false);

    if (nextProductType === "Ambiente") {
      setTemperatureC("");
      return;
    }

    setTemperatureC("");
  }

  function openDatePicker() {
    const nextLimits = getRecordDateLimits();
    setRecordDateLimits(nextLimits);
    setDatePickerValue(recordedAtLocalValue);
    setShowDatePicker(true);
  }

  function saveDatePickerValue() {
    const nextLimits = getRecordDateLimits();
    const clampedValue =
      datePickerValue < nextLimits.min ? nextLimits.min : datePickerValue > nextLimits.max ? nextLimits.max : datePickerValue;

    setRecordDateLimits(nextLimits);
    setRecordedAtLocalValue(clampedValue);
    setHasCustomRecordedAt(true);
    setShowDatePicker(false);
  }

  function handleSuccessAccept() {
    if (isSupplyReception) {
      const rememberedDraft: SupplyDraft = {
        operatorName,
      };

      window.localStorage.setItem(supplyStorageKey, JSON.stringify(rememberedDraft));
    }

    window.location.reload();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (showActionTakenBlock && !observations.trim()) {
      event.preventDefault();
      setActionTakenError("Registra la acción tomada antes de enviar.");
      actionTakenTextareaRef.current?.focus();
    }
  }

  function goBackSupplyStep() {
    if (currentStep === 2) {
      setCurrentStep(1);
      return;
    }

    if (currentStep === 3) {
      setCurrentStep(2);
      return;
    }

    if (currentStep === 4) {
      setCurrentStep(3);
      return;
    }

    if (currentStep === 5) {
      setCurrentStep(4);
      return;
    }

    if (currentStep === 6) {
      setCurrentStep(showTemperaturePicker ? 5 : 4);
      return;
    }

    if (currentStep === 7) {
      setCurrentStep(6);
      return;
    }

    if (currentStep === 8) {
      setCurrentStep(7);
      return;
    }

    if (currentStep === 9) {
      setCurrentStep(8);
      return;
    }

    if (currentStep === 10) {
      setCurrentStep(showActionTakenBlock ? 9 : 8);
    }
  }

  function selectSupplyProductType(nextProductType: SupplyProductType) {
    selectProductType(nextProductType);
  }

  function selectSupplyDecision(nextDecision: SupplyDecision) {
    setDecision(nextDecision);
  }

  return (
    <OperationalFormLayout
      title={label.title}
      description={isSupplyReception ? null : label.description}
      companyName={companyName}
      branchName={branchName}
    >
      <form action={action} className={operationalFormStyles.formBody} onSubmit={handleSubmit}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="recordedAt" value={recordedAtIsoValue} />
        {isSupplyReception ? (
          <>
            <input type="hidden" name="operatorName" value={operatorName} />
            <input type="hidden" name="productName" value={supplySubmittedProductName} />
            <input type="hidden" name="productType" value={productType} />
            <input type="hidden" name="temperatureC" value={temperatureC} />
            <input type="hidden" name="packageIntactDateValid" value={packageIntactDateValid} />
            <input type="hidden" name="organolepticAdequate" value={organolepticAdequate} />
            <input type="hidden" name="decision" value={decision} />
            <input type="hidden" name="observations" value={observations} />
          </>
        ) : null}

        {!isSupplyReception ? (
          <div className="grid gap-2">
            <PublicFormDateControl dateLabel={recordedAtDisplay} onOpenDatePicker={openDatePicker} />
            <section className="grid gap-6 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader canGoBack={false} stepLabel="1" totalSteps={1} />

            <label className={operationalFormStyles.field}>
              <span className={operationalFormStyles.fieldLabel}>Nombre del operador</span>
              <input
                name="operatorName"
                autoComplete="name"
                required
                placeholder="Ej. Ana Gomez"
                value={operatorName}
                onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
                className={operationalFormStyles.inputOnWhite}
              />
            </label>

            {formType === "thermal_control" ? (
              <>
                <label className={operationalFormStyles.field}>
                  <span className={operationalFormStyles.fieldLabel}>Equipo de refrigeracion</span>
                  <select
                    name="equipmentId"
                    required
                    disabled={missingThermalCatalog}
                    className={operationalFormStyles.select}
                  >
                    <option value="">Seleccionar equipo</option>
                    {equipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.equipment_type
                          ? `${item.name} - ${refrigerationEquipmentTypeLabels[item.equipment_type]}`
                          : item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={operationalFormStyles.field}>
                  <span className={operationalFormStyles.fieldLabel}>Temperatura en °C</span>
                  <input
                    name="temperatureC"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    required
                    placeholder="Ej. 4.2"
                    className={operationalFormStyles.temperatureInput}
                  />
                </label>
              </>
            ) : null}

            {formType === "area_sanitation" ? (
              <>
                <label className={operationalFormStyles.field}>
                  <span className={operationalFormStyles.fieldLabel}>Area o zona</span>
                  <select
                    name="areaId"
                    required
                    disabled={missingAreaCatalog}
                    className={operationalFormStyles.select}
                  >
                    <option value="">Seleccionar area</option>
                    {sanitationAreas.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className={operationalFormStyles.field}>
                  <legend className={operationalFormStyles.fieldLabel}>Estado de conformidad</legend>
                  <div className={operationalFormStyles.yesNoGrid}>
                    <label className={operationalFormStyles.radioLabel}>
                      <input className={operationalFormStyles.radioInput} type="radio" name="isCompliant" value="true" required />
                      <span className={operationalFormStyles.yesButtonLarge}>Si</span>
                    </label>
                    <label className={operationalFormStyles.radioLabel}>
                      <input className={operationalFormStyles.radioInput} type="radio" name="isCompliant" value="false" required />
                      <span className={operationalFormStyles.noButtonLarge}>No</span>
                    </label>
                  </div>
                </fieldset>
              </>
            ) : null}

            {formType === "water_quality" ? (
              <label className={operationalFormStyles.field}>
                <span className={operationalFormStyles.fieldLabel}>Medicion de cloro en ppm</span>
                <input
                  name="chlorinePpm"
                  type="number"
                  inputMode="decimal"
                  min="0.3"
                  max="2.0"
                  step="0.1"
                  required
                  placeholder="0.3 a 2.0"
                  className={operationalFormStyles.temperatureInput}
                />
                <span className="text-sm font-bold text-[#51645f]">Solo se aceptan valores entre 0.3 y 2.0 ppm.</span>
              </label>
            ) : null}

            {missingThermalCatalog ? (
              <p className={operationalFormStyles.statusWarning}>
                Esta sede aun no tiene equipos registrados para usar este QR.
              </p>
            ) : null}

            {missingAreaCatalog ? (
              <p className={operationalFormStyles.statusWarning}>
                Esta sede aun no tiene areas registradas para usar este QR.
              </p>
            ) : null}

            {state.error ? <p className={operationalFormStyles.statusError}>{state.error}</p> : null}

            <OperationalFormResponsibleSummary responsibleName={operatorName} />

            <OperationalFormSubmitButton disabled={isDisabled}>
              {isPending ? "Guardando..." : "Guardar registro"}
            </OperationalFormSubmitButton>
            </section>
          </div>
        ) : null}

        {formType === "supply_reception" ? (
          <section className="grid gap-2">
            <PublicFormDateControl dateLabel={recordedAtDisplay} onOpenDatePicker={openDatePicker} />
            <div className="grid min-h-[560px] content-start gap-8 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader
                canGoBack={currentStep > 1}
                onBack={goBackSupplyStep}
                stepLabel={supplyStepLabel}
                totalSteps={9}
              />

              {currentStep === 1 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Quién recibe el producto?</h2>
                </div>
                <input
                  autoComplete="name"
                  placeholder="Ej. Ana Gomez"
                  value={operatorName}
                  onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
                  className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                />
                <button
                  type="button"
                  disabled={!operatorName.trim()}
                  onClick={() => setCurrentStep(2)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 2 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Cuál es el producto?</h2>
                </div>
                <input
                  autoComplete="off"
                  placeholder="Ej. Pechuga de pollo"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                />
                <button
                  type="button"
                  disabled={!productName.trim()}
                  onClick={() => setCurrentStep(3)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">Nombre del proveedor</h2>
                </div>
                <input
                  autoComplete="organization"
                  placeholder="Ej. Distriaves"
                  value={providerName}
                  onChange={(event) => setProviderName(event.target.value)}
                  className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                />
                <button
                  type="button"
                  disabled={!providerName.trim()}
                  onClick={() => setCurrentStep(4)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 4 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">Método de conservación</h2>
                </div>
                <div className="grid gap-3">
                  {supplyProductTypes.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => selectSupplyProductType(option)}
                      className={[
                        "min-h-16 rounded-2xl border px-5 text-left text-xl font-black transition",
                        productType === option
                          ? "border-neutral-900 bg-neutral-200 font-semibold text-neutral-900"
                          : "border-[#c7d8d4] bg-white text-neutral-950",
                      ].join(" ")}
                    >
                      {supplyProductTypeLabels[option]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!productType}
                  onClick={() => setCurrentStep(productType === "Ambiente" ? 6 : 5)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 5 ? (
                <div ref={temperaturePickerRef} className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">{temperatureStepTitle}</h2>
                </div>
                <div className="grid gap-2">
                  <button
                    type="button"
                    aria-expanded={isTemperatureMenuOpen}
                    onClick={() => setIsTemperatureMenuOpen((currentValue) => !currentValue)}
                    className={[
                      "flex min-h-20 w-full items-center justify-between gap-3 rounded-2xl border px-5 text-left text-3xl font-black outline-none transition focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10",
                      hasSelectedTemperature
                        ? "border-[#147060]/20 bg-white text-neutral-950"
                        : "border-[#c7d8d4] bg-white text-[#7b8c87]",
                    ].join(" ")}
                  >
                    <span>{hasSelectedTemperature ? `${temperatureC}°C` : "Seleccione"}</span>
                    <span aria-hidden="true" className="text-2xl leading-none text-[#147060]">
                      ▾
                    </span>
                  </button>

                  {isTemperatureMenuOpen ? (
                    <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#c7d8d4] bg-white p-2 shadow-[0_18px_40px_rgba(17,24,22,0.12)]">
                      <div className="grid gap-1">
                        {temperatureOptions.map((option) => {
                          const optionCompliant = isTemperatureCompliant(productType, String(option));
                          const isSelected = temperatureC === String(option);

                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setTemperatureC(String(option));
                                setIsTemperatureMenuOpen(false);
                              }}
                              className={[
                                "flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-lg font-black transition",
                                isSelected
                                  ? "border-[#111816] bg-[#111816] text-white"
                                  : optionCompliant
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-950"
                                    : "border-rose-100 bg-rose-50 text-[#7b1b28]",
                              ].join(" ")}
                            >
                              <span>{option}°C</span>
                              <span
                                aria-hidden="true"
                                className={[
                                  "h-3 w-3 rounded-[3px]",
                                  optionCompliant ? "bg-emerald-300" : "bg-[#8f1d2c]",
                                ].join(" ")}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {hasSelectedTemperature ? (
                  <div className="flex min-h-14 items-center justify-between rounded-2xl bg-[#f4faf7] px-4 py-3">
                    <span className="text-sm font-black text-neutral-950">Resultado</span>
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-3 py-1 text-sm font-black",
                        temperatureCompliant ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
                      ].join(" ")}
                    >
                      {temperatureCompliant ? "Cumple" : "No cumple"}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!hasSelectedTemperature}
                  onClick={() => setCurrentStep(6)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 6 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">
                    ¿El empaque está correcto e intacto?
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPackageIntactDateValid("true");
                    }}
                    className={[
                      "min-h-24 rounded-2xl border text-2xl font-black transition",
                      packageIntactDateValid === "true"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-[#c7d8d4] bg-white text-neutral-950",
                    ].join(" ")}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPackageIntactDateValid("false");
                    }}
                    className={[
                      "min-h-24 rounded-2xl border text-2xl font-black transition",
                      packageIntactDateValid === "false"
                        ? "border-rose-200 bg-rose-50 text-[#7b1b28]"
                        : "border-[#c7d8d4] bg-white text-neutral-950",
                    ].join(" ")}
                  >
                    No
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!packageIntactDateValid}
                  onClick={() => setCurrentStep(7)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 7 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">
                    ¿El producto se ve y huele como se espera?
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOrganolepticAdequate("true");
                    }}
                    className={[
                      "min-h-24 rounded-2xl border text-2xl font-black transition",
                      organolepticAdequate === "true"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-[#c7d8d4] bg-white text-neutral-950",
                    ].join(" ")}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrganolepticAdequate("false");
                    }}
                    className={[
                      "min-h-24 rounded-2xl border text-2xl font-black transition",
                      organolepticAdequate === "false"
                        ? "border-rose-200 bg-rose-50 text-[#7b1b28]"
                        : "border-[#c7d8d4] bg-white text-neutral-950",
                    ].join(" ")}
                  >
                    No
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!organolepticAdequate}
                  onClick={() => setCurrentStep(8)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 8 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">Decisión de aceptación</h2>
                </div>
                <div className="grid gap-3">
                  {supplyDecisions.map((option) => {
                    const isAccept = option === "Aceptar Producto";
                    const optionLabel = isAccept ? "Aceptar" : "Rechazar";

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => selectSupplyDecision(option)}
                        className={[
                          "min-h-16 rounded-2xl border px-5 text-left text-xl font-black transition",
                          decision === option && isAccept
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                            : decision === option
                              ? "border-rose-200 bg-rose-50 text-[#7b1b28]"
                              : "border-[#c7d8d4] bg-white text-neutral-950",
                        ].join(" ")}
                      >
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={!decision}
                  onClick={() => setCurrentStep(decision === "Rechazar Producto" || supplyActionTakenItems.length > 0 ? 9 : 10)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 9 ? (
                <div className="grid gap-7">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">
                    ¿Qué acción se tomó con este producto?
                  </h2>
                </div>
                <div className="grid gap-2 rounded-2xl border-l-4 border-[#8f1d2c] bg-[#f8eeee] px-4 py-3 text-sm font-bold leading-6 text-neutral-950">
                  <p className="text-[#7b1b28]">Se requiere registrar la acción tomada frente a:</p>
                  <ul className="grid gap-1.5">
                    {supplyActionTakenItems.map((item) => (
                      <li key={item.key} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[#8f1d2c]" />
                        <span>{item.text}</span>
                      </li>
                    ))}
                    {supplyDecisionTakenItem ? (
                      <li key={supplyDecisionTakenItem.key} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[#8f1d2c]" />
                        <span>{supplyDecisionTakenItem.text}</span>
                      </li>
                    ) : null}
                  </ul>
                </div>
                <textarea
                  id="supply-action-taken"
                  ref={actionTakenTextareaRef}
                  rows={6}
                  aria-invalid={showActionTakenError}
                  aria-describedby={showActionTakenError ? "supply-action-taken-error" : undefined}
                  placeholder={actionTakenPlaceholder}
                  value={observations}
                  onChange={(event) => {
                    setObservations(event.target.value);

                    if (event.target.value.trim()) {
                      setActionTakenError("");
                    }
                  }}
                  className="min-h-40 resize-none rounded-2xl border border-[#c7d8d4] bg-white px-5 py-4 text-lg font-bold text-neutral-950 outline-none transition placeholder:text-sm placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                />
                {showActionTakenError ? (
                  <p id="supply-action-taken-error" className={operationalFormStyles.statusError}>
                    {actionTakenError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!observations.trim()}
                  onClick={() => setCurrentStep(10)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 10 ? (
                <div className="grid gap-8">
                <div className="grid gap-3">
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">Listo para registrar</h2>
                </div>
                <div className="grid gap-1 rounded-2xl bg-[#f4faf7] px-5 py-4">
                  <p className="text-sm font-bold text-[#51645f]">Responsable del registro</p>
                  <p className="text-2xl font-black text-neutral-950">{operatorName || "Sin definir"}</p>
                </div>
                <OperationalFormSubmitButton disabled={isDisabled}>
                  {isPending ? "Guardando..." : "Firmar y registrar"}
                </OperationalFormSubmitButton>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {isSupplyReception && state.error ? <p className={operationalFormStyles.statusError}>{state.error}</p> : null}
      </form>

      {showDatePicker ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#111816]/40 px-5 backdrop-blur-md" role="presentation">
          <section
            aria-modal="true"
            aria-label="Modificar fecha y hora del registro"
            className="grid w-full max-w-sm gap-5 rounded-3xl bg-white p-6 text-[#111816] shadow-[0_24px_80px_rgba(17,24,22,0.22)]"
            role="dialog"
          >
            <div className="grid gap-1">
              <h2 className="text-xl font-black text-neutral-950">Fecha y hora del registro</h2>
              <p className="text-sm font-semibold leading-5 text-neutral-500">Puedes ajustar máximo 5 días hacia atrás.</p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-neutral-700">Registro</span>
              <input
                type="datetime-local"
                value={datePickerValue}
                min={recordDateLimits.min}
                max={recordDateLimits.max}
                onChange={(event) => setDatePickerValue(event.target.value)}
                className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-white px-4 text-base font-bold text-neutral-950 outline-none transition focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowDatePicker(false)}
                className="min-h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 transition active:scale-[0.98]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDatePickerValue}
                className="min-h-12 rounded-2xl bg-[#111816] px-4 text-sm font-black text-white transition active:scale-[0.98]"
              >
                Guardar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <OperationalFormSuccessDialog open={Boolean(state.success)} onAccept={handleSuccessAccept} />
    </OperationalFormLayout>
  );
}
