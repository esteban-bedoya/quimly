"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { submitPublicOperationalForm, type PublicFormState } from "@/app/f/[token]/actions";
import {
  OperationalFormLayout,
  OperationalFormResponsibleSummary,
  OperationalFormSection,
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
  productName?: string;
  productType?: SupplyProductType | "";
  temperatureC?: string;
  packageIntactDateValid?: YesNoValue | "";
  organolepticAdequate?: YesNoValue | "";
  decision?: SupplyDecision | "";
  observations?: string;
};

function isSupplyProductType(value: string): value is SupplyProductType {
  return supplyProductTypes.includes(value as SupplyProductType);
}

function isSupplyDecision(value: string): value is SupplyDecision {
  return supplyDecisions.includes(value as SupplyDecision);
}

function isYesNoValue(value: string): value is YesNoValue {
  return value === "true" || value === "false";
}

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

function formatTemperature(temperature: number | string) {
  return `${temperature}°C`;
}

function formatResponsibleName(value: string) {
  return value.toLocaleUpperCase("es-CO");
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
  const [operatorName, setOperatorName] = useState("");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState<SupplyProductType | "">("");
  const [temperatureC, setTemperatureC] = useState("");
  const [packageIntactDateValid, setPackageIntactDateValid] = useState<YesNoValue | "">("");
  const [organolepticAdequate, setOrganolepticAdequate] = useState<YesNoValue | "">("");
  const [decision, setDecision] = useState<SupplyDecision | "">("");
  const [observations, setObservations] = useState("");
  const [hasLoadedSupplyDraft, setHasLoadedSupplyDraft] = useState(false);
  const [isTemperatureMenuOpen, setIsTemperatureMenuOpen] = useState(false);
  const temperaturePickerRef = useRef<HTMLDivElement>(null);
  const label = operationalFormLabels[formType];
  const missingThermalCatalog = formType === "thermal_control" && equipment.length === 0;
  const missingAreaCatalog = formType === "area_sanitation" && sanitationAreas.length === 0;
  const isDisabled = isPending || missingThermalCatalog || missingAreaCatalog;
  const showTemperaturePicker = productType === "Refrigerado" || productType === "Congelado";
  const temperatureOptions = useMemo(() => getTemperatureOptions(productType), [productType]);
  const temperatureCompliant = isTemperatureCompliant(productType, temperatureC);
  const hasSelectedTemperature = temperatureC !== "";
  const supplyStorageKey = `quimly:supply-reception:${token}`;

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
        setProductName(typeof draft.productName === "string" ? draft.productName : "");
        setProductType(draft.productType && isSupplyProductType(draft.productType) ? draft.productType : "");
        setTemperatureC(typeof draft.temperatureC === "string" ? draft.temperatureC : "");
        setPackageIntactDateValid(
          draft.packageIntactDateValid && isYesNoValue(draft.packageIntactDateValid)
            ? draft.packageIntactDateValid
            : "",
        );
        setOrganolepticAdequate(
          draft.organolepticAdequate && isYesNoValue(draft.organolepticAdequate) ? draft.organolepticAdequate : "",
        );
        setDecision(draft.decision && isSupplyDecision(draft.decision) ? draft.decision : "");
        setObservations(typeof draft.observations === "string" ? draft.observations : "");
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
      productName,
      productType,
      temperatureC,
      packageIntactDateValid,
      organolepticAdequate,
      decision,
      observations,
    };

    window.localStorage.setItem(supplyStorageKey, JSON.stringify(draft));
  }, [
    decision,
    hasLoadedSupplyDraft,
    isSupplyReception,
    observations,
    operatorName,
    organolepticAdequate,
    packageIntactDateValid,
    productName,
    productType,
    supplyStorageKey,
    temperatureC,
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

  function handleSuccessAccept() {
    if (isSupplyReception) {
      window.localStorage.removeItem(supplyStorageKey);
    }

    window.location.reload();
  }

  return (
    <OperationalFormLayout
      title={label.title}
      description={isSupplyReception ? null : label.description}
      companyName={companyName}
      branchName={branchName}
    >
      <form action={action} className={operationalFormStyles.formBody}>
        <input type="hidden" name="token" value={token} />

        {!isSupplyReception ? (
          <label className={operationalFormStyles.field}>
            <span className={operationalFormStyles.fieldLabel}>Nombre del operador</span>
            <input
              name="operatorName"
              autoComplete="name"
              required
              placeholder="Ej. Ana Gomez"
              value={operatorName}
              onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
              className={operationalFormStyles.input}
            />
          </label>
        ) : null}

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

        {formType === "supply_reception" ? (
          <>
            <OperationalFormSection title="DATOS DE RECEPCIÓN">
              <label className={operationalFormStyles.field}>
                <span className={operationalFormStyles.fieldLabel}>¿Quién recibe el producto?</span>
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
              <label className={operationalFormStyles.field}>
                <span className={operationalFormStyles.fieldLabel}>¿Qué producto y distribuidor ingresa?</span>
                <input
                  name="productName"
                  required
                  placeholder="Ej. Pechuga de pollo - Distriaves"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  className={operationalFormStyles.inputOnWhite}
                />
              </label>
            </OperationalFormSection>

            <OperationalFormSection title="CONTROL DE TEMPERATURA">
              <fieldset className={operationalFormStyles.field}>
                <legend className={operationalFormStyles.fieldLabel}>¿Cómo debe conservarse este producto?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {supplyProductTypes.map((option) => (
                    <label key={option} className={operationalFormStyles.radioLabel}>
                      <input
                        className={operationalFormStyles.radioInput}
                        type="radio"
                        name="productType"
                        value={option}
                        checked={productType === option}
                        onChange={() => selectProductType(option)}
                        required
                      />
                      <span className="flex min-h-14 items-center justify-center rounded-2xl border border-[#c7d8d4] bg-white px-2 text-center text-sm font-black text-[#111816] transition peer-checked:border-[#147060] peer-checked:bg-[#147060] peer-checked:text-white">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {showTemperaturePicker ? (
                <>
                  <div ref={temperaturePickerRef} className={operationalFormStyles.field}>
                    <span className={operationalFormStyles.fieldLabel}>
                      ¿Con qué temperatura llega el producto?
                    </span>
                    <input type="hidden" name="temperatureC" value={temperatureC} />
                    <button
                      type="button"
                      aria-expanded={isTemperatureMenuOpen}
                      onClick={() => setIsTemperatureMenuOpen((currentValue) => !currentValue)}
                      className={[
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left text-lg font-black outline-none transition focus:border-[#147060]",
                        hasSelectedTemperature && temperatureCompliant
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-[#c7d8d4] bg-white text-[#111816]",
                      ].join(" ")}
                    >
                      <span className={hasSelectedTemperature ? "" : "text-base text-[#7b8c87]"}>
                        {hasSelectedTemperature ? formatTemperature(temperatureC) : "Seleccione la temperatura"}
                      </span>
                      <span aria-hidden="true" className="text-xl leading-none text-[#147060]">
                        ▾
                      </span>
                    </button>

                    {isTemperatureMenuOpen ? (
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-[#cfe0dc] bg-white p-2 shadow-[0_18px_40px_rgba(17,24,22,0.14)]">
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
                                  "flex min-h-11 items-center justify-between rounded-xl border px-4 text-left text-base font-black transition",
                                  optionCompliant
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                                    : "border-rose-100 bg-rose-50 text-rose-900",
                                  isSelected ? "ring-2 ring-[#147060]" : "",
                                ].join(" ")}
                              >
                                <span>{formatTemperature(option)}</span>
                                <span
                                  aria-hidden="true"
                                  className={[
                                    "h-3 w-3 rounded-[3px]",
                                    optionCompliant ? "bg-emerald-400" : "bg-rose-400",
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
                    <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#cfe0dc] bg-white px-4 py-3">
                      <span className={operationalFormStyles.fieldLabel}>Resultado</span>
                      <span
                        className={[
                          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black",
                          temperatureCompliant ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
                        ].join(" ")}
                      >
                        <span aria-hidden="true">{temperatureCompliant ? "✓" : "!"}</span>
                        {temperatureCompliant ? "Cumple" : "No cumple"}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </OperationalFormSection>

            <OperationalFormSection title="INSPECCIÓN VISUAL">
              <fieldset className={operationalFormStyles.field}>
                <legend className={operationalFormStyles.fieldLabel}>¿Empaque y fecha correcta?</legend>
                <div className={operationalFormStyles.yesNoGrid}>
                  <label className={operationalFormStyles.radioLabel}>
                    <input
                      className={operationalFormStyles.radioInput}
                      type="radio"
                      name="packageIntactDateValid"
                      value="true"
                      checked={packageIntactDateValid === "true"}
                      onChange={() => setPackageIntactDateValid("true")}
                      required
                    />
                    <span className={operationalFormStyles.yesButton}>Si</span>
                  </label>
                  <label className={operationalFormStyles.radioLabel}>
                    <input
                      className={operationalFormStyles.radioInput}
                      type="radio"
                      name="packageIntactDateValid"
                      value="false"
                      checked={packageIntactDateValid === "false"}
                      onChange={() => setPackageIntactDateValid("false")}
                      required
                    />
                    <span className={operationalFormStyles.noButton}>No</span>
                  </label>
                </div>
              </fieldset>

              <fieldset className={operationalFormStyles.field}>
                <legend className={operationalFormStyles.fieldLabel}>¿Se ve y huele bien?</legend>
                <div className={operationalFormStyles.yesNoGrid}>
                  <label className={operationalFormStyles.radioLabel}>
                    <input
                      className={operationalFormStyles.radioInput}
                      type="radio"
                      name="organolepticAdequate"
                      value="true"
                      checked={organolepticAdequate === "true"}
                      onChange={() => setOrganolepticAdequate("true")}
                      required
                    />
                    <span className={operationalFormStyles.yesButton}>Si</span>
                  </label>
                  <label className={operationalFormStyles.radioLabel}>
                    <input
                      className={operationalFormStyles.radioInput}
                      type="radio"
                      name="organolepticAdequate"
                      value="false"
                      checked={organolepticAdequate === "false"}
                      onChange={() => setOrganolepticAdequate("false")}
                      required
                    />
                    <span className={operationalFormStyles.noButton}>No</span>
                  </label>
                </div>
              </fieldset>
            </OperationalFormSection>

            <OperationalFormSection title="DECISIÓN">
              <fieldset className={operationalFormStyles.field}>
                <legend className={operationalFormStyles.fieldLabel}>Decisión de aceptación</legend>
                <div className="grid gap-3">
                  {supplyDecisions.map((option) => {
                    const isAccept = option === "Aceptar Producto";
                    const optionLabel = isAccept ? "Aceptar" : "Rechazar";

                    return (
                      <label key={option} className={operationalFormStyles.radioLabel}>
                        <input
                          className={operationalFormStyles.radioInput}
                          type="radio"
                          name="decision"
                          value={option}
                          checked={decision === option}
                          onChange={() => setDecision(option)}
                          required
                        />
                        <span
                          className={[
                            "flex min-h-14 items-center justify-center rounded-2xl border px-3 text-center text-base font-black transition peer-checked:text-white",
                            isAccept
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800 peer-checked:border-emerald-700 peer-checked:bg-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-800 peer-checked:border-rose-700 peer-checked:bg-rose-700",
                          ].join(" ")}
                        >
                          {optionLabel}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className={operationalFormStyles.field}>
                <span className={operationalFormStyles.fieldLabel}>
                  Observaciones / Justificación de decisión
                </span>
                <textarea
                  name="observations"
                  required={decision === "Rechazar Producto"}
                  rows={3}
                  placeholder="Ej. Empaque roto, temperatura fuera de rango, producto en mal estado..."
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  className={operationalFormStyles.textareaOnWhite}
                />
              </label>
            </OperationalFormSection>
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
          {isPending ? "Guardando..." : isSupplyReception ? "Firmar y registrar" : "Guardar registro"}
        </OperationalFormSubmitButton>
      </form>

      <OperationalFormSuccessDialog open={Boolean(state.success)} onAccept={handleSuccessAccept} />
    </OperationalFormLayout>
  );
}
