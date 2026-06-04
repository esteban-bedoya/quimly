"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState } from "react";

import { submitPublicOperationalForm, type PublicFormState } from "@/app/f/[token]/actions";
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
    initial: number;
  }
> = {
  Refrigerado: {
    min: -5,
    max: 15,
    initial: 4,
  },
  Congelado: {
    min: -30,
    max: 2,
    initial: -18,
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
    return temperature >= 0 && temperature <= 4;
  }

  if (productType === "Congelado") {
    return temperature <= -18;
  }

  return false;
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
  const label = operationalFormLabels[formType];
  const missingThermalCatalog = formType === "thermal_control" && equipment.length === 0;
  const missingAreaCatalog = formType === "area_sanitation" && sanitationAreas.length === 0;
  const isDisabled = isPending || missingThermalCatalog || missingAreaCatalog;
  const showTemperaturePicker = productType === "Refrigerado" || productType === "Congelado";
  const temperatureOptions = useMemo(() => getTemperatureOptions(productType), [productType]);
  const temperatureCompliant = isTemperatureCompliant(productType, temperatureC);
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
        setOperatorName(typeof draft.operatorName === "string" ? draft.operatorName : "");
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

  function selectProductType(nextProductType: SupplyProductType) {
    setProductType(nextProductType);

    if (nextProductType === "Ambiente") {
      setTemperatureC("");
      return;
    }

    setTemperatureC(String(supplyTemperatureSettings[nextProductType].initial));
  }

  return (
    <main className="min-h-screen bg-[#f2f7f5] px-4 py-5 text-[#111816]">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col justify-center">
        <section className="overflow-hidden rounded-[2rem] border border-[#cfe0dc] bg-white shadow-[0_24px_80px_rgba(17,24,22,0.12)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#d6fff4_0%,#f5fffb_42%,#ffffff_100%)] px-5 py-6">
            <Image
              src="/logos/quimly_logoo.png"
              alt="Quimly"
              width={146}
              height={48}
              priority
              className="h-10 w-auto"
            />
            <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#111816]">{label.title}</h1>
            <p className="mt-3 text-base leading-7 text-[#51645f]">{label.description}</p>
            <div className="mt-4 rounded-2xl border border-[#cfe0dc] bg-white/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#51645f]">{branchName}</p>
              <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#147060]">{companyName}</p>
            </div>
          </div>

          <form action={action} className="grid gap-4 px-5 py-5">
            <input type="hidden" name="token" value={token} />

            <label className="grid gap-2">
              <span className="text-sm font-black text-[#111816]">Nombre del operador</span>
              <input
                name="operatorName"
                autoComplete="name"
                required
                placeholder="Ej. Ana Gomez"
                value={isSupplyReception ? operatorName : undefined}
                onChange={isSupplyReception ? (event) => setOperatorName(event.target.value) : undefined}
                className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
              />
            </label>

            {formType === "thermal_control" ? (
              <>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Equipo de refrigeracion</span>
                  <select
                    name="equipmentId"
                    required
                    disabled={missingThermalCatalog}
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
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

                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Temperatura en °C</span>
                  <input
                    name="temperatureC"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    required
                    placeholder="Ej. 4.2"
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-2xl font-black text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  />
                </label>
              </>
            ) : null}

            {formType === "area_sanitation" ? (
              <>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Area o zona</span>
                  <select
                    name="areaId"
                    required
                    disabled={missingAreaCatalog}
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  >
                    <option value="">Seleccionar area</option>
                    {sanitationAreas.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-black text-[#111816]">Estado de conformidad</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="relative">
                      <input className="peer sr-only" type="radio" name="isCompliant" value="true" required />
                      <span className="flex min-h-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-lg font-black text-emerald-800 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white">
                        Si
                      </span>
                    </label>
                    <label className="relative">
                      <input className="peer sr-only" type="radio" name="isCompliant" value="false" required />
                      <span className="flex min-h-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-lg font-black text-rose-800 transition peer-checked:border-rose-700 peer-checked:bg-rose-700 peer-checked:text-white">
                        No
                      </span>
                    </label>
                  </div>
                </fieldset>
              </>
            ) : null}

            {formType === "supply_reception" ? (
              <>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Producto / Proveedor</span>
                  <input
                    name="productName"
                    required
                    placeholder="Ej. Distriaves / Pechuga"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  />
                </label>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-black text-[#111816]">Tipo de producto</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {supplyProductTypes.map((option) => (
                      <label key={option} className="relative">
                        <input
                          className="peer sr-only"
                          type="radio"
                          name="productType"
                          value={option}
                          checked={productType === option}
                          onChange={() => selectProductType(option)}
                          required
                        />
                        <span className="flex min-h-14 items-center justify-center rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-2 text-center text-sm font-black text-[#111816] transition peer-checked:border-[#147060] peer-checked:bg-[#147060] peer-checked:text-white">
                          {option}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {showTemperaturePicker ? (
                  <>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-[#111816]">Temperatura recibida (°C)</span>
                      <select
                        name="temperatureC"
                        required
                        value={temperatureC}
                        onChange={(event) => setTemperatureC(event.target.value)}
                        className={[
                          "min-h-14 appearance-none rounded-2xl border px-4 text-2xl font-black outline-none transition focus:border-[#147060]",
                          temperatureCompliant
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                            : "border-[#c7d8d4] bg-[#fbfffd] text-[#111816]",
                        ].join(" ")}
                      >
                        {temperatureOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}°C
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#cfe0dc] bg-[#fbfffd] px-4 py-3">
                      <span className="text-sm font-black text-[#111816]">Cumplimiento de temperatura</span>
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
                  </>
                ) : null}

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-black text-[#111816]">¿Empaque íntegro y fecha vigente?</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="relative">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name="packageIntactDateValid"
                        value="true"
                        checked={packageIntactDateValid === "true"}
                        onChange={() => setPackageIntactDateValid("true")}
                        required
                      />
                      <span className="flex min-h-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-lg font-black text-emerald-800 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white">
                        Si
                      </span>
                    </label>
                    <label className="relative">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name="packageIntactDateValid"
                        value="false"
                        checked={packageIntactDateValid === "false"}
                        onChange={() => setPackageIntactDateValid("false")}
                        required
                      />
                      <span className="flex min-h-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-lg font-black text-rose-800 transition peer-checked:border-rose-700 peer-checked:bg-rose-700 peer-checked:text-white">
                        No
                      </span>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-black text-[#111816]">¿Color, olor y textura adecuados?</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="relative">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name="organolepticAdequate"
                        value="true"
                        checked={organolepticAdequate === "true"}
                        onChange={() => setOrganolepticAdequate("true")}
                        required
                      />
                      <span className="flex min-h-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-lg font-black text-emerald-800 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white">
                        Si
                      </span>
                    </label>
                    <label className="relative">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name="organolepticAdequate"
                        value="false"
                        checked={organolepticAdequate === "false"}
                        onChange={() => setOrganolepticAdequate("false")}
                        required
                      />
                      <span className="flex min-h-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-lg font-black text-rose-800 transition peer-checked:border-rose-700 peer-checked:bg-rose-700 peer-checked:text-white">
                        No
                      </span>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-black text-[#111816]">Decisión</legend>
                  <div className="grid grid-cols-2 gap-3">
                    {supplyDecisions.map((option) => {
                      const isAccept = option === "Aceptar Producto";

                      return (
                        <label key={option} className="relative">
                          <input
                            className="peer sr-only"
                            type="radio"
                            name="decision"
                            value={option}
                            checked={decision === option}
                            onChange={() => setDecision(option)}
                            required
                          />
                          <span
                            className={[
                              "flex min-h-16 items-center justify-center rounded-2xl border px-3 text-center text-base font-black transition peer-checked:text-white",
                              isAccept
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 peer-checked:border-emerald-700 peer-checked:bg-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-800 peer-checked:border-rose-700 peer-checked:bg-rose-700",
                            ].join(" ")}
                          >
                            {option}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Observaciones / Acción tomada</span>
                  <textarea
                    name="observations"
                    required={decision === "Rechazar Producto"}
                    rows={3}
                    value={observations}
                    onChange={(event) => setObservations(event.target.value)}
                    className="min-h-24 resize-none rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 py-3 text-base font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  />
                </label>
              </>
            ) : null}

            {formType === "water_quality" ? (
              <label className="grid gap-2">
                <span className="text-sm font-black text-[#111816]">Medicion de cloro en ppm</span>
                <input
                  name="chlorinePpm"
                  type="number"
                  inputMode="decimal"
                  min="0.3"
                  max="2.0"
                  step="0.1"
                  required
                  placeholder="0.3 a 2.0"
                  className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-2xl font-black text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                />
                <span className="text-sm font-bold text-[#51645f]">Solo se aceptan valores entre 0.3 y 2.0 ppm.</span>
              </label>
            ) : null}

            {missingThermalCatalog ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                Esta sede aun no tiene equipos registrados para usar este QR.
              </p>
            ) : null}

            {missingAreaCatalog ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                Esta sede aun no tiene areas registradas para usar este QR.
              </p>
            ) : null}

            {state.error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-800">
                {state.error}
              </p>
            ) : null}

            {state.success ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-800">
                {state.success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isDisabled}
              className="mt-1 min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white shadow-[0_14px_32px_rgba(17,24,22,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6] disabled:shadow-none"
            >
              {isPending ? "Guardando..." : "Guardar registro"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
