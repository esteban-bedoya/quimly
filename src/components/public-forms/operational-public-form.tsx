"use client";

import { type FormEvent, type RefObject, useActionState, useEffect, useMemo, useRef, useState } from "react";

import { submitPublicOperationalForm, type PublicFormState } from "@/app/f/[token]/actions";
import {
  OperationalFormLayout,
  OperationalFormSubmitButton,
  OperationalFormSuccessDialog,
  operationalFormStyles,
} from "@/components/public-forms/operational-form-layout";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import type { BranchRefrigerationEquipmentType } from "@/types/auth";

type CatalogItem = {
  id: string;
  name: string;
  equipmentType?: BranchRefrigerationEquipmentType | null;
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
type WaterStep = 1 | 2 | 3 | 4;
type ThermalStep = 1 | 2 | 3 | 4 | 5;
type SanitationStep = 1 | 2 | 3 | 4;
type SanitationCleaningType = "Superficial" | "Profunda";
type SupplyActionTakenItem = {
  key: string;
  text: string;
};
type ComplianceItem = {
  key: string;
  text: string;
};

const supplyProductTypeLabels: Record<SupplyProductType, string> = {
  Ambiente: "Ambiente",
  Refrigerado: "Refrigerado",
  Congelado: "Congelado",
};

const otherActionTakenValue = "__other__";

const supplyAcceptedActionOptions = [
  "Se informa al administrador/responsable.",
  "Se acepta para uso inmediato.",
  "Se traslada urgente a refrigeración/congelación.",
  "Se separa para revisión.",
];

const supplyRejectedActionOptions = [
  "Se informa al administrador/responsable.",
  "Se devuelve al proveedor.",
  "Se desecha el lote.",
  "Se aísla producto no conforme.",
];

const waterCorrectiveActionOptions = [
  "Se informa al administrador/responsable.",
  "Se revisa sistema de filtración.",
  "Se usa suministro alterno.",
  "Se realiza contramuestra en otro punto de la red.",
];

const thermalCorrectiveActionOptions = [
  "Se informa al administrador/responsable.",
  "Se ajusta el termostato del equipo.",
  "Se trasladan los alimentos urgentes a otro equipo de frío operativo.",
];

const sanitationCleaningTypes = ["Superficial", "Profunda"] as const;

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
    return temperature >= 0 && temperature <= 4;
  }

  if (productType === "Congelado") {
    return temperature <= -18;
  }

  return false;
}

function formatDecimalMeasurement(integerPart: number, decimalPart: number) {
  return (integerPart + decimalPart / 10).toFixed(1);
}

function isChlorineCompliant(value: number) {
  return value >= 0.3 && value <= 2.0;
}

function isPhCompliant(value: number) {
  return value >= 6.5 && value <= 9.0;
}

function isThermalTemperatureCompliant(equipmentType: BranchRefrigerationEquipmentType | null | undefined, temperature: number) {
  if (equipmentType === "refrigerator") {
    return temperature >= 0 && temperature <= 4;
  }

  if (equipmentType === "freezer") {
    return temperature <= -18;
  }

  return null;
}

function getCatalogEquipmentType(item: CatalogItem | null) {
  return item?.equipment_type ?? item?.equipmentType ?? null;
}

function getCatalogEquipmentTypeLabel(item: CatalogItem | null) {
  const equipmentType = getCatalogEquipmentType(item);

  return equipmentType ? refrigerationEquipmentTypeLabels[equipmentType] : null;
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

  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const hours = String(hours12).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours24 >= 12 ? "PM" : "AM";

  return `${day} ${month} ${year} · ${hours}:${minutes} ${meridiem}`;
}

function toIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getInitialTemperatureScrollTarget(productType: SupplyProductType | "") {
  if (productType === "Refrigerado") {
    return 1;
  }

  if (productType === "Congelado") {
    return -24;
  }

  return null;
}

function PublicFormCardHeader({
  canGoBack,
  currentStep,
  onBack,
  totalSteps,
}: {
  canGoBack: boolean;
  currentStep: number;
  onBack?: () => void;
  totalSteps: number;
}) {
  const safeTotalSteps = Math.max(totalSteps, 1);
  const progressPercentage = Math.min(100, Math.max(0, (currentStep / safeTotalSteps) * 100));

  return (
    <div className="border-b border-neutral-100 pb-3">
      <div className="flex h-8 w-full flex-row items-center justify-between">
        <div className="w-24 shrink-0">
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-left text-[11px] font-bold uppercase tracking-widest text-neutral-500 transition hover:text-neutral-800"
            >
              ← Volver
            </button>
          ) : null}
        </div>

        <div
          aria-valuemax={safeTotalSteps}
          aria-valuemin={0}
          aria-valuenow={Math.min(currentStep, safeTotalSteps)}
          className="h-1 w-32 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[#7b8c87] transition-all duration-300 ease-in-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function EditableResponsibleSummary({
  isEditing,
  onEditingChange,
  responsibleName,
  onResponsibleNameChange,
}: {
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  responsibleName: string;
  onResponsibleNameChange: (responsibleName: string) => void;
}) {
  const [draftName, setDraftName] = useState(responsibleName);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = responsibleName.trim();
  const canSave = Boolean(draftName.trim());

  function startEditing() {
    setDraftName(responsibleName);
    onEditingChange(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function saveResponsibleName() {
    const nextName = draftName.trim();

    if (!nextName) {
      return;
    }

    onResponsibleNameChange(formatResponsibleName(nextName));
    onEditingChange(false);
  }

  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-[#f4faf7] px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#51645f]">Responsable del registro</p>
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(formatResponsibleName(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveResponsibleName();
              }

              if (event.key === "Escape") {
                onEditingChange(false);
              }
            }}
            className="mt-1 min-h-10 w-full rounded-xl border border-[#147060]/30 bg-white px-3 text-xl font-black text-neutral-950 outline-none transition focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
          />
        ) : (
          <p className={displayName ? "truncate text-xl font-black text-neutral-950" : "text-xl font-black text-[#7b8c87]"}>
            {displayName || "Sin definir"}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={isEditing ? saveResponsibleName : startEditing}
        disabled={isEditing && !canSave}
        className={[
          "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-45",
          isEditing ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#d7e4e1] bg-white text-neutral-800",
        ].join(" ")}
        aria-label={isEditing ? "Guardar responsable del registro" : "Editar responsable del registro"}
      >
        {isEditing ? (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.6"
            viewBox="0 0 24 24"
          >
            <path d="m20 6-11 11-5-5" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function EditableExecutionDateSummary({
  dateLabel,
  isModified,
  onEdit,
}: {
  dateLabel: string;
  isModified: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-[#f4faf7] px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#51645f]">Fecha y hora ejecución</p>
        <p
          className={[
            "truncate text-xl font-black",
            isModified ? "text-[#48c7d2]" : "text-neutral-950",
          ].join(" ")}
        >
          {dateLabel}
        </p>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#d7e4e1] bg-white text-neutral-800 transition active:scale-[0.94]"
        aria-label="Cambiar fecha y hora de ejecución"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
  );
}

function FinalRegistrationStep({
  dateLabel,
  errorMessage,
  isDateModified,
  isPending,
  isResponsibleEditing,
  onDateEdit,
  onResponsibleEditingChange,
  onResponsibleNameChange,
  responsibleName,
  submitDisabled,
}: {
  dateLabel: string;
  errorMessage?: string;
  isDateModified: boolean;
  isPending: boolean;
  isResponsibleEditing: boolean;
  onDateEdit: () => void;
  onResponsibleEditingChange: (isEditing: boolean) => void;
  onResponsibleNameChange: (responsibleName: string) => void;
  responsibleName: string;
  submitDisabled: boolean;
}) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h2 className="text-3xl font-black leading-tight text-neutral-950">Listo para registrar</h2>
      </div>
      <EditableResponsibleSummary
        isEditing={isResponsibleEditing}
        onEditingChange={onResponsibleEditingChange}
        responsibleName={responsibleName}
        onResponsibleNameChange={onResponsibleNameChange}
      />
      <EditableExecutionDateSummary dateLabel={dateLabel} isModified={isDateModified} onEdit={onDateEdit} />

      {errorMessage ? <p className={operationalFormStyles.statusError}>{errorMessage}</p> : null}

      <OperationalFormSubmitButton disabled={submitDisabled}>
        {isPending ? "Guardando..." : "Firmar y registrar"}
      </OperationalFormSubmitButton>
    </div>
  );
}

function EmergencyTriangleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
      <path d="M12 8.5v5" strokeLinecap="round" />
      <path d="M12 17.25h.01" strokeLinecap="round" />
      <path
        d="M10.2 4.35 2.6 17.55A2.1 2.1 0 0 0 4.4 20.7h15.2a2.1 2.1 0 0 0 1.8-3.15L13.8 4.35a2.08 2.08 0 0 0-3.6 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActionTakenChoiceGroup({
  customValue,
  errorId,
  inputRef,
  name,
  onCustomChange,
  onSelect,
  options,
  selectedValue,
}: {
  customValue: string;
  errorId?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  name: string;
  onCustomChange: (value: string) => void;
  onSelect: (value: string) => void;
  options: string[];
  selectedValue: string;
}) {
  const isOtherSelected = selectedValue === otherActionTakenValue;

  return (
    <div className="grid gap-2" role="radiogroup">
      {options.map((option) => {
        const isSelected = selectedValue === option;

        return (
          <label
            key={option}
            className={[
              "flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-black leading-5 transition active:scale-[0.99]",
              isSelected
                ? "border-[#111816] bg-[#f4faf7] text-neutral-950"
                : "border-[#c7d8d4] bg-white text-neutral-950",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={isSelected}
              onChange={() => onSelect(option)}
              className="h-4 w-4 shrink-0 accent-[#111816]"
            />
            <span>{option}</span>
          </label>
        );
      })}

      <label
        className={[
          "grid gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-black leading-5 transition active:scale-[0.99]",
          isOtherSelected ? "border-[#111816] bg-[#f4faf7] text-neutral-950" : "border-[#c7d8d4] bg-white text-neutral-950",
        ].join(" ")}
      >
        <span className="flex min-h-7 items-center gap-3">
          <input
            type="radio"
            name={name}
            value={otherActionTakenValue}
            checked={isOtherSelected}
            onChange={() => onSelect(otherActionTakenValue)}
            className="h-4 w-4 shrink-0 accent-[#111816]"
          />
          <span>Otra.</span>
        </span>
        {isOtherSelected ? (
          <input
            ref={inputRef}
            type="text"
            value={customValue}
            onChange={(event) => onCustomChange(event.target.value)}
            aria-describedby={errorId}
            placeholder="Escribe la medida tomada"
            className="min-h-12 rounded-xl border border-[#c7d8d4] bg-white px-4 text-base font-bold text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
          />
        ) : null}
      </label>
    </div>
  );
}

function MeasurementWheelControls({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const displayValue = value ?? min;
  const canDecrease = value === null || displayValue > min;
  const canIncrease = value === null || displayValue < max;

  return (
    <div className="grid w-14 justify-items-center gap-1.5">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#51645f]">{label}</p>
      <button
        type="button"
        disabled={!canIncrease}
        onClick={() => onChange(value === null ? Math.min(min + 1, max) : Math.min(displayValue + 1, max))}
        className="grid h-7 w-10 place-items-center rounded-xl border border-[#d7e4e1] bg-white text-sm font-black leading-none text-neutral-700 transition active:scale-[0.94] active:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
        aria-label={`Subir ${label}`}
      >
        +
      </button>
      <button
        type="button"
        disabled={!canDecrease}
        onClick={() => onChange(value === null ? min : Math.max(displayValue - 1, min))}
        className="grid h-7 w-10 place-items-center rounded-xl border border-[#d7e4e1] bg-white text-sm font-black leading-none text-neutral-700 transition active:scale-[0.94] active:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
        aria-label={`Bajar ${label}`}
      >
        -
      </button>
    </div>
  );
}

function MeasurementWheelPicker({
  title,
  integerValue,
  decimalValue,
  integerMin,
  integerMax,
  onIntegerChange,
  onDecimalChange,
  isCompliant,
  helperText,
}: {
  title: string;
  integerValue: number | null;
  decimalValue: number | null;
  integerMin: number;
  integerMax: number;
  onIntegerChange: (value: number) => void;
  onDecimalChange: (value: number) => void;
  isCompliant: boolean | null;
  helperText: string;
}) {
  const hasMeasurement = integerValue !== null && decimalValue !== null;
  const formattedValue = hasMeasurement ? `${integerValue}.${decimalValue}` : "-.-";

  return (
    <section className="grid gap-3 rounded-2xl border border-[#d7e4e1] bg-white px-3 py-3">
      <h3 className="text-lg font-black leading-5 text-neutral-950">{title}</h3>

      <div className="flex flex-row items-center justify-center gap-2">
        <MeasurementWheelControls
          label="Entero"
          value={integerValue}
          min={integerMin}
          max={integerMax}
          onChange={onIntegerChange}
        />
        <div className="mt-5 flex h-14 min-w-24 items-center justify-center rounded-full border border-[#d7e4e1] bg-gray-50 px-4 shadow-inner shadow-black/[0.03]">
          <span className={["font-mono text-3xl font-semibold", hasMeasurement ? "text-neutral-950" : "text-[#7b8c87]"].join(" ")}>
            {formattedValue}
          </span>
        </div>
        <MeasurementWheelControls
          label="Decimal"
          value={decimalValue}
          min={0}
          max={9}
          onChange={onDecimalChange}
        />
      </div>

      <div
        className={[
          "flex items-center justify-between gap-3 rounded-full px-4 py-1.5 transition",
          isCompliant === null ? "bg-[#f4faf7]" : isCompliant ? "bg-emerald-50/70" : "bg-rose-50/70",
        ].join(" ")}
      >
        <p className="text-left text-xs font-bold leading-4 text-[#51645f]">{helperText}</p>
        <span
          className={[
            "inline-flex min-h-8 shrink-0 items-center rounded-full px-4 py-1.5 text-xs font-black",
            isCompliant === null
              ? "bg-white text-[#51645f]"
              : isCompliant
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800",
          ].join(" ")}
        >
          {isCompliant === null ? "Ingrese la medición..." : isCompliant ? "Cumple" : "No cumple"}
        </span>
      </div>
    </section>
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
  const isWaterQuality = formType === "water_quality";
  const isThermalControl = formType === "thermal_control";
  const isAreaSanitation = formType === "area_sanitation";
  const [currentStep, setCurrentStep] = useState<SupplyStep>(1);
  const [waterStep, setWaterStep] = useState<WaterStep>(1);
  const [thermalStep, setThermalStep] = useState<ThermalStep>(1);
  const [sanitationStep, setSanitationStep] = useState<SanitationStep>(1);
  const [operatorName, setOperatorName] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [selectedSanitationAreaId, setSelectedSanitationAreaId] = useState("");
  const [sanitationCleaningType, setSanitationCleaningType] = useState<SanitationCleaningType | "">("");
  const [sanitationImplementsConfirmed, setSanitationImplementsConfirmed] = useState(false);
  const [sanitationChemicalsConfirmed, setSanitationChemicalsConfirmed] = useState(false);
  const [productName, setProductName] = useState("");
  const [providerName, setProviderName] = useState("");
  const [productType, setProductType] = useState<SupplyProductType | "">("");
  const [temperatureC, setTemperatureC] = useState("");
  const [packageIntactDateValid, setPackageIntactDateValid] = useState<YesNoValue | "">("");
  const [organolepticAdequate, setOrganolepticAdequate] = useState<YesNoValue | "">("");
  const [decision, setDecision] = useState<SupplyDecision | "">("");
  const [observations, setObservations] = useState("");
  const [actionTakenChoice, setActionTakenChoice] = useState("");
  const [customActionTaken, setCustomActionTaken] = useState("");
  const [actionTakenError, setActionTakenError] = useState("");
  const [hasLoadedSupplyDraft, setHasLoadedSupplyDraft] = useState(false);
  const [isTemperatureMenuOpen, setIsTemperatureMenuOpen] = useState(false);
  const [isResponsibleEditing, setIsResponsibleEditing] = useState(false);
  const [chlorineInteger, setChlorineInteger] = useState<number | null>(null);
  const [chlorineDecimal, setChlorineDecimal] = useState<number | null>(null);
  const [phInteger, setPhInteger] = useState<number | null>(null);
  const [phDecimal, setPhDecimal] = useState<number | null>(null);
  const [recordedAtLocalValue, setRecordedAtLocalValue] = useState(() => toDateTimeLocalValue(new Date()));
  const [recordDateLimits, setRecordDateLimits] = useState(() => getRecordDateLimits());
  const [datePickerValue, setDatePickerValue] = useState(recordedAtLocalValue);
  const [hasCustomRecordedAt, setHasCustomRecordedAt] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const temperaturePickerRef = useRef<HTMLDivElement>(null);
  const temperatureMenuRef = useRef<HTMLDivElement>(null);
  const actionTakenCustomInputRef = useRef<HTMLInputElement>(null);
  const label = operationalFormLabels[formType];
  const missingThermalCatalog = isThermalControl && equipment.length === 0;
  const missingAreaCatalog = isAreaSanitation && sanitationAreas.length === 0;
  const isDisabled = isPending || missingThermalCatalog || missingAreaCatalog;
  const isSubmitDisabled = isDisabled || isResponsibleEditing;
  const hasSanitationArea = Boolean(selectedSanitationAreaId);
  const hasSanitationProtocol = sanitationImplementsConfirmed && sanitationChemicalsConfirmed;
  const showTemperaturePicker = productType === "Refrigerado" || productType === "Congelado";
  const temperatureCompliant = isTemperatureCompliant(productType, temperatureC);
  const hasSelectedTemperature = temperatureC !== "";
  const selectedThermalEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId) ?? null,
    [equipment, selectedEquipmentId],
  );
  const selectedThermalEquipmentType = getCatalogEquipmentType(selectedThermalEquipment);
  const thermalTemperatureProductType: SupplyProductType | "" =
    selectedThermalEquipmentType === "freezer" ? "Congelado" : selectedThermalEquipmentType === "refrigerator" ? "Refrigerado" : "";
  const activeTemperatureProductType = isThermalControl ? thermalTemperatureProductType : productType;
  const temperatureOptions = useMemo(() => getTemperatureOptions(activeTemperatureProductType), [activeTemperatureProductType]);
  const thermalTemperatureValue = temperatureC.trim() ? Number(temperatureC) : null;
  const hasThermalTemperature =
    thermalTemperatureValue !== null && Number.isFinite(thermalTemperatureValue);
  const thermalTemperatureCompliant =
    hasThermalTemperature && selectedThermalEquipmentType
      ? isThermalTemperatureCompliant(selectedThermalEquipmentType, thermalTemperatureValue)
      : null;
  const showThermalCorrectiveStep = thermalTemperatureCompliant === false;
  const thermalTotalSteps = showThermalCorrectiveStep ? 5 : 4;
  const thermalProgressStep = thermalStep === 5 && !showThermalCorrectiveStep ? 4 : thermalStep;
  const hasChlorineMeasurement = chlorineInteger !== null && chlorineDecimal !== null;
  const hasPhMeasurement = phInteger !== null && phDecimal !== null;
  const hasWaterMeasurements = hasChlorineMeasurement && hasPhMeasurement;
  const chlorineValue = hasChlorineMeasurement ? Number(formatDecimalMeasurement(chlorineInteger, chlorineDecimal)) : null;
  const phValue = hasPhMeasurement ? Number(formatDecimalMeasurement(phInteger, phDecimal)) : null;
  const chlorineCompliant = chlorineValue === null ? null : isChlorineCompliant(chlorineValue);
  const phCompliant = phValue === null ? null : isPhCompliant(phValue);
  const supplySubmittedProductName = [productName.trim(), providerName.trim()].filter(Boolean).join(" - ");
  const supplyStorageKey = `quimly:supply-reception:${token}`;
  const waterNonComplianceItems = useMemo<ComplianceItem[]>(() => {
    const items: ComplianceItem[] = [];

    if (chlorineCompliant === false) {
      items.push({
        key: "chlorine",
        text: "Nivel de cloro residual fuera de rango.",
      });
    }

    if (phCompliant === false) {
      items.push({
        key: "ph",
        text: "Nivel de pH fuera de rango.",
      });
    }

    return items;
  }, [chlorineCompliant, phCompliant]);
  const showWaterCorrectiveStep = waterNonComplianceItems.length > 0;
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
          text: "Producto ACEPTADO.",
        }
      : decision === "Rechazar Producto"
        ? {
            key: "rejected",
            text: "Producto RECHAZADO.",
          }
        : null;
  const supplyActionTakenOptions =
    decision === "Rechazar Producto" ? supplyRejectedActionOptions : supplyAcceptedActionOptions;
  const isCustomActionTaken = actionTakenChoice === otherActionTakenValue;
  const hasCompletedActionTaken = Boolean(actionTakenChoice && (!isCustomActionTaken || customActionTaken.trim()));
  const showActionTakenError = Boolean(actionTakenError && showActionTakenBlock && !hasCompletedActionTaken);
  const temperatureStepTitle =
    productType === "Congelado"
      ? "¿Con qué temperatura llegó el producto congelado?"
      : "¿Con qué temperatura llegó el producto refrigerado?";
  const thermalTemperatureStepTitle =
    selectedThermalEquipmentType === "freezer"
      ? "¿Qué temperatura tiene el congelador?"
      : "¿Qué temperatura tiene el refrigerador?";
  const thermalTemperatureAlertText =
    selectedThermalEquipmentType === "freezer"
      ? "Temperatura del congelador fuera de rango seguro."
      : "Temperatura del refrigerador fuera de rango seguro.";
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

  useEffect(() => {
    if (!isTemperatureMenuOpen) {
      return;
    }

    const targetTemperature = hasSelectedTemperature
      ? Number(temperatureC)
      : getInitialTemperatureScrollTarget(activeTemperatureProductType);

    if (!Number.isFinite(targetTemperature)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const menu = temperatureMenuRef.current;
      const targetOption = menu?.querySelector<HTMLElement>(`[data-temperature-option="${targetTemperature}"]`);

      if (!menu || !targetOption) {
        return;
      }

      menu.scrollTop = Math.max(targetOption.offsetTop - menu.offsetTop - 8, 0);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTemperatureProductType, hasSelectedTemperature, isTemperatureMenuOpen, temperatureC]);

  function selectProductType(nextProductType: SupplyProductType) {
    setProductType(nextProductType);
    setIsTemperatureMenuOpen(false);

    if (nextProductType === "Ambiente") {
      setTemperatureC("");
      return;
    }

    setTemperatureC("");
  }

  function resetActionTakenSelection() {
    setActionTakenChoice("");
    setCustomActionTaken("");
    setObservations("");
    setActionTakenError("");
  }

  function selectActionTakenChoice(value: string) {
    setActionTakenChoice(value);
    setActionTakenError("");

    if (value === otherActionTakenValue) {
      setObservations(customActionTaken.trim());
      window.requestAnimationFrame(() => actionTakenCustomInputRef.current?.focus());
      return;
    }

    setCustomActionTaken("");
    setObservations(value);
  }

  function updateCustomActionTaken(value: string) {
    setCustomActionTaken(value);
    setObservations(value.trim());

    if (value.trim()) {
      setActionTakenError("");
    }
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
    if (
      (isSupplyReception && currentStep !== 10) ||
      (isWaterQuality && waterStep !== 4) ||
      (isThermalControl && thermalStep !== 5) ||
      (isAreaSanitation && sanitationStep !== 4)
    ) {
      event.preventDefault();
      return;
    }

    if (isResponsibleEditing) {
      event.preventDefault();
      return;
    }

    if (isWaterQuality && !hasWaterMeasurements) {
      event.preventDefault();
      setWaterStep(2);
      return;
    }

    if (isThermalControl && (!selectedEquipmentId || !hasThermalTemperature)) {
      event.preventDefault();
      setThermalStep(selectedEquipmentId ? 3 : 2);
      return;
    }

    if (isAreaSanitation && !hasSanitationArea) {
      event.preventDefault();
      setSanitationStep(2);
      return;
    }

    if (isAreaSanitation && (!sanitationCleaningType || !hasSanitationProtocol)) {
      event.preventDefault();
      setSanitationStep(3);
      return;
    }

    if (isWaterQuality && showWaterCorrectiveStep && !hasCompletedActionTaken) {
      event.preventDefault();
      setActionTakenError("Registra la acción tomada antes de enviar.");
      actionTakenCustomInputRef.current?.focus();
      return;
    }

    if (isThermalControl && showThermalCorrectiveStep && !hasCompletedActionTaken) {
      event.preventDefault();
      setActionTakenError("Registra la acción tomada antes de enviar.");
      actionTakenCustomInputRef.current?.focus();
      return;
    }

    if (showActionTakenBlock && !hasCompletedActionTaken) {
      event.preventDefault();
      setActionTakenError("Registra la acción tomada antes de enviar.");
      actionTakenCustomInputRef.current?.focus();
    }
  }

  function goBackSupplyStep() {
    setIsResponsibleEditing(false);

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

  function goBackWaterStep() {
    setIsResponsibleEditing(false);

    if (waterStep === 2) {
      setWaterStep(1);
      return;
    }

    if (waterStep === 3) {
      setWaterStep(2);
      return;
    }

    if (waterStep === 4) {
      setWaterStep(showWaterCorrectiveStep ? 3 : 2);
    }
  }

  function goBackThermalStep() {
    setIsResponsibleEditing(false);

    if (thermalStep === 2) {
      setThermalStep(1);
      return;
    }

    if (thermalStep === 3) {
      setThermalStep(2);
      return;
    }

    if (thermalStep === 4) {
      setThermalStep(3);
      return;
    }

    if (thermalStep === 5) {
      setThermalStep(showThermalCorrectiveStep ? 4 : 3);
    }
  }

  function goBackSanitationStep() {
    setIsResponsibleEditing(false);

    if (sanitationStep === 2) {
      setSanitationStep(1);
      return;
    }

    if (sanitationStep === 3) {
      setSanitationStep(2);
      return;
    }

    if (sanitationStep === 4) {
      setSanitationStep(3);
    }
  }

  function updateChlorineInteger(value: number) {
    setChlorineInteger(value);
    setChlorineDecimal((currentValue) => currentValue ?? 0);
  }

  function updateChlorineDecimal(value: number) {
    setChlorineDecimal(value);
    setChlorineInteger((currentValue) => currentValue ?? 0);
  }

  function updatePhInteger(value: number) {
    setPhInteger(value);
    setPhDecimal((currentValue) => currentValue ?? 0);
  }

  function updatePhDecimal(value: number) {
    setPhDecimal(value);
    setPhInteger((currentValue) => currentValue ?? 0);
  }

  function continueFromWaterMeasurements() {
    if (!hasWaterMeasurements) {
      return;
    }

    if (!showWaterCorrectiveStep) {
      resetActionTakenSelection();
    }

    setWaterStep(showWaterCorrectiveStep ? 3 : 4);
  }

  function selectThermalEquipment(equipmentId: string) {
    setSelectedEquipmentId(equipmentId);
    setTemperatureC("");
    setIsTemperatureMenuOpen(false);
    resetActionTakenSelection();
  }

  function updateThermalTemperature(value: string) {
    setTemperatureC(value);
    resetActionTakenSelection();
  }

  function continueFromThermalTemperature() {
    if (!hasThermalTemperature || !selectedThermalEquipment || thermalTemperatureCompliant === null) {
      return;
    }

    if (!showThermalCorrectiveStep) {
      resetActionTakenSelection();
    }

    setThermalStep(showThermalCorrectiveStep ? 4 : 5);
  }

  function selectSupplyProductType(nextProductType: SupplyProductType) {
    selectProductType(nextProductType);
  }

  function selectSupplyDecision(nextDecision: SupplyDecision) {
    if (nextDecision !== decision) {
      resetActionTakenSelection();
    }

    setDecision(nextDecision);
  }

  const finalRegistrationStepProps = {
    dateLabel: recordedAtDisplay,
    errorMessage: state.error,
    isDateModified: hasCustomRecordedAt,
    isPending,
    isResponsibleEditing,
    onDateEdit: openDatePicker,
    onResponsibleEditingChange: setIsResponsibleEditing,
    onResponsibleNameChange: setOperatorName,
    responsibleName: operatorName,
    submitDisabled: isSubmitDisabled,
  };

  return (
    <OperationalFormLayout
      title={label.title}
      description={isSupplyReception || isWaterQuality || isThermalControl || isAreaSanitation ? null : label.description}
      companyName={companyName}
      branchName={branchName}
    >
      <form action={action} className={operationalFormStyles.formBody} onSubmit={handleSubmit}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="recordedAt" value={recordedAtIsoValue} />
        {isAreaSanitation ? (
          <>
            <input type="hidden" name="operatorName" value={operatorName} />
            <input type="hidden" name="areaId" value={selectedSanitationAreaId} />
            <input type="hidden" name="cleaningType" value={sanitationCleaningType} />
            <input type="hidden" name="isCompliant" value={hasSanitationProtocol ? "true" : ""} />
            <input type="hidden" name="usedExclusiveImplements" value={sanitationImplementsConfirmed ? "true" : ""} />
            <input type="hidden" name="usedAuthorizedChemicals" value={sanitationChemicalsConfirmed ? "true" : ""} />
          </>
        ) : null}
        {isThermalControl ? (
          <>
            <input type="hidden" name="operatorName" value={operatorName} />
            <input type="hidden" name="equipmentId" value={selectedEquipmentId} />
            <input type="hidden" name="temperatureC" value={hasThermalTemperature ? temperatureC : ""} />
            <input type="hidden" name="observations" value={observations} />
          </>
        ) : null}
        {isWaterQuality ? (
          <>
            <input type="hidden" name="operatorName" value={operatorName} />
            <input
              type="hidden"
              name="chlorinePpm"
              value={hasChlorineMeasurement ? formatDecimalMeasurement(chlorineInteger, chlorineDecimal) : ""}
            />
            <input
              type="hidden"
              name="phLevel"
              value={hasPhMeasurement ? formatDecimalMeasurement(phInteger, phDecimal) : ""}
            />
            <input type="hidden" name="observations" value={observations} />
          </>
        ) : null}
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

        {isThermalControl ? (
          <section className="grid gap-2">
            <div className="grid min-h-[560px] content-start gap-8 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader
                canGoBack={thermalStep > 1}
                currentStep={thermalProgressStep}
                onBack={goBackThermalStep}
                totalSteps={thermalTotalSteps}
              />

              {thermalStep === 1 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Quién realiza la medición?</h2>
                  </div>
                  <input
                    autoComplete="name"
                    placeholder="Ej. Ana Gomez"
                    value={operatorName}
                    onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
                    className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-left text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                  />
                  <button
                    type="button"
                    disabled={!operatorName.trim()}
                    onClick={() => setThermalStep(2)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {thermalStep === 2 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">Selección del equipo</h2>
                  </div>
                  {missingThermalCatalog ? (
                    <p className={operationalFormStyles.statusWarning}>
                      No hay equipos de frío activos para esta sede. Configúralos desde el administrador.
                    </p>
                  ) : (
                    <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
                      {equipment.map((item) => {
                        const isSelected = selectedEquipmentId === item.id;
                        const equipmentTypeLabel = getCatalogEquipmentTypeLabel(item);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!equipmentTypeLabel}
                            onClick={() => selectThermalEquipment(item.id)}
                            className={[
                              "min-h-16 rounded-2xl border px-5 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
                              isSelected ? "border-neutral-900 bg-neutral-200" : "border-[#c7d8d4] bg-white",
                            ].join(" ")}
                          >
                              <span className="block text-xl font-black text-neutral-950">{item.name}</span>
                              {equipmentTypeLabel ? (
                                <span className="mt-1 block text-sm font-bold text-[#51645f]">{equipmentTypeLabel}</span>
                              ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!selectedEquipmentId || !selectedThermalEquipmentType}
                    onClick={() => setThermalStep(3)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {thermalStep === 3 ? (
                <div ref={temperaturePickerRef} className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">{thermalTemperatureStepTitle}</h2>
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
                      <div
                        ref={temperatureMenuRef}
                        className="max-h-72 overflow-y-auto rounded-2xl border border-[#c7d8d4] bg-white p-2 shadow-[0_18px_40px_rgba(17,24,22,0.12)]"
                      >
                        <div className="grid gap-1">
                          {temperatureOptions.map((option) => {
                            const optionCompliant =
                              selectedThermalEquipmentType !== null
                                ? isThermalTemperatureCompliant(selectedThermalEquipmentType, option) === true
                                : false;
                            const isSelected = temperatureC === String(option);

                            return (
                              <button
                                key={option}
                                type="button"
                                data-temperature-option={option}
                                onClick={() => {
                                  updateThermalTemperature(String(option));
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
                  {thermalTemperatureCompliant !== null ? (
                    <div
                      className={[
                        "flex min-h-14 items-center justify-between rounded-2xl px-4 py-3",
                        thermalTemperatureCompliant ? "bg-emerald-50" : "bg-rose-50",
                      ].join(" ")}
                    >
                      <span className="text-sm font-black text-neutral-950">Resultado</span>
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-sm font-black",
                          thermalTemperatureCompliant ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
                        ].join(" ")}
                      >
                        {thermalTemperatureCompliant ? "Cumple" : "No cumple"}
                      </span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!hasThermalTemperature || thermalTemperatureCompliant === null}
                    onClick={continueFromThermalTemperature}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {thermalStep === 4 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Qué medidas se tomaron?</h2>
                  </div>
                  <div className="grid gap-2 rounded-2xl border-l-4 border-[#8f1d2c] bg-[#f8eeee] px-4 py-3 text-sm font-bold leading-6 text-neutral-950">
                    <span
                      aria-label="Alerta"
                      className="grid h-9 w-9 place-items-center rounded-xl bg-[#efd6d8] text-[#8f1d2c]"
                      role="img"
                    >
                      <EmergencyTriangleIcon />
                    </span>
                    <ul className="grid gap-1.5">
                      <li className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[#8f1d2c]" />
                        <span>{thermalTemperatureAlertText}</span>
                      </li>
                    </ul>
                  </div>
                  <ActionTakenChoiceGroup
                    customValue={customActionTaken}
                    errorId="thermal-action-taken-error"
                    inputRef={actionTakenCustomInputRef}
                    name="thermal-action-taken"
                    onCustomChange={updateCustomActionTaken}
                    onSelect={selectActionTakenChoice}
                    options={thermalCorrectiveActionOptions}
                    selectedValue={actionTakenChoice}
                  />
                  {actionTakenError && !hasCompletedActionTaken ? (
                    <p id="thermal-action-taken-error" className={operationalFormStyles.statusError}>
                      {actionTakenError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!hasCompletedActionTaken}
                    onClick={() => setThermalStep(5)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {thermalStep === 5 ? (
                <FinalRegistrationStep {...finalRegistrationStepProps} />
              ) : null}
            </div>
          </section>
        ) : null}

        {isAreaSanitation ? (
          <section className="grid gap-2">
            <div className="grid min-h-[560px] content-start gap-8 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader
                canGoBack={sanitationStep > 1}
                currentStep={sanitationStep}
                onBack={goBackSanitationStep}
                totalSteps={4}
              />

              {sanitationStep === 1 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Quién realiza la limpieza?</h2>
                  </div>
                  <input
                    autoComplete="name"
                    placeholder="Ej. Ana Gomez"
                    value={operatorName}
                    onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
                    className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-left text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                  />
                  <button
                    type="button"
                    disabled={!operatorName.trim()}
                    onClick={() => setSanitationStep(2)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {sanitationStep === 2 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">Área o elemento a limpiar</h2>
                  </div>
                  {missingAreaCatalog ? (
                    <p className={operationalFormStyles.statusWarning}>
                      Esta sede aun no tiene areas registradas para usar este QR.
                    </p>
                  ) : (
                    <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
                      {sanitationAreas.map((item) => {
                        const isSelected = selectedSanitationAreaId === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedSanitationAreaId(item.id)}
                            className={[
                              "min-h-16 rounded-2xl border px-5 text-left transition active:scale-[0.99]",
                              isSelected ? "border-neutral-900 bg-neutral-200" : "border-[#c7d8d4] bg-white",
                            ].join(" ")}
                          >
                            <span className="block text-xl font-black text-neutral-950">{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!hasSanitationArea}
                    onClick={() => setSanitationStep(3)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {sanitationStep === 3 ? (
                <div className="grid gap-7">
                  <fieldset className="grid gap-5">
                    <legend className="sr-only">Elija el tipo de limpieza realizada</legend>
                    <h3 className="text-[1.7rem] font-black leading-tight text-neutral-950">Elija el tipo de limpieza realizada</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {sanitationCleaningTypes.map((option) => (
                        <label
                          key={option}
                          className={[
                            "flex min-h-16 items-center justify-center rounded-2xl border px-4 text-lg font-black transition active:scale-[0.98]",
                            sanitationCleaningType === option
                              ? "border-neutral-900 bg-neutral-200 font-semibold text-neutral-900"
                              : "border-[#c7d8d4] bg-white text-neutral-950",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="sanitation-cleaning-type"
                            value={option}
                            checked={sanitationCleaningType === option}
                            onChange={() => setSanitationCleaningType(option)}
                            className="sr-only"
                          />
                          {option}.
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div aria-hidden="true" className="h-px w-full bg-[#d7e4e1]" />

                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">Protocolo de saneamiento</h2>
                  </div>
                  <div className="grid gap-3">
                    <label
                      className={[
                        "flex min-h-20 items-start gap-3 rounded-2xl border px-4 py-4 text-base font-black leading-6 transition active:scale-[0.99]",
                        sanitationImplementsConfirmed
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-[#c7d8d4] bg-white text-neutral-950",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={sanitationImplementsConfirmed}
                        onChange={(event) => setSanitationImplementsConfirmed(event.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#0f5f48]"
                      />
                      <span>Se utilizaron implementos exclusivos para este fin evitando contaminación cruzada.</span>
                    </label>

                    <label
                      className={[
                        "flex min-h-20 items-start gap-3 rounded-2xl border px-4 py-4 text-base font-black leading-6 transition active:scale-[0.99]",
                        sanitationChemicalsConfirmed
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-[#c7d8d4] bg-white text-neutral-950",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={sanitationChemicalsConfirmed}
                        onChange={(event) => setSanitationChemicalsConfirmed(event.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#0f5f48]"
                      />
                      <span>
                        Se utilizaron los productos químicos y en las dosis autorizadas en el Plan de Saneamiento Básico.
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={!sanitationCleaningType || !hasSanitationProtocol}
                    onClick={() => setSanitationStep(4)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {sanitationStep === 4 ? (
                <FinalRegistrationStep {...finalRegistrationStepProps} />
              ) : null}
            </div>
          </section>
        ) : null}

        {isWaterQuality ? (
          <section className="grid gap-2">
            <div className="grid min-h-[560px] content-start gap-8 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader
                canGoBack={waterStep > 1}
                currentStep={waterStep}
                onBack={goBackWaterStep}
                totalSteps={4}
              />

              {waterStep === 1 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Quién realiza la medición?</h2>
                  </div>
                  <input
                    autoComplete="name"
                    placeholder="Ej. Ana Gomez"
                    value={operatorName}
                    onChange={(event) => setOperatorName(formatResponsibleName(event.target.value))}
                    className="min-h-16 rounded-2xl border border-[#c7d8d4] bg-white px-5 text-left text-xl font-black text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10"
                  />
                  <button
                    type="button"
                    disabled={!operatorName.trim()}
                    onClick={() => setWaterStep(2)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {waterStep === 2 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">Mediciones técnicas</h2>
                  </div>

                  <div className="grid gap-4">
                    <MeasurementWheelPicker
                      title="Nivel de cloro residual"
                      integerValue={chlorineInteger}
                      decimalValue={chlorineDecimal}
                      integerMin={0}
                      integerMax={9}
                      onIntegerChange={updateChlorineInteger}
                      onDecimalChange={updateChlorineDecimal}
                      isCompliant={chlorineCompliant}
                      helperText="Rango aceptable: 0.3 a 2.0 mg/L"
                    />
                    <MeasurementWheelPicker
                      title="Nivel de pH"
                      integerValue={phInteger}
                      decimalValue={phDecimal}
                      integerMin={0}
                      integerMax={9}
                      onIntegerChange={updatePhInteger}
                      onDecimalChange={updatePhDecimal}
                      isCompliant={phCompliant}
                      helperText="Rango aceptable: 6.5 a 9.0"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!hasWaterMeasurements}
                    onClick={continueFromWaterMeasurements}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {waterStep === 3 ? (
                <div className="grid gap-7">
                  <div className="grid gap-3">
                    <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Qué medidas se tomaron?</h2>
                  </div>
                  <div className="grid gap-2 rounded-2xl border-l-4 border-[#8f1d2c] bg-[#f8eeee] px-4 py-3 text-sm font-bold leading-6 text-neutral-950">
                    <span
                      aria-label="Alerta"
                      className="grid h-9 w-9 place-items-center rounded-xl bg-[#efd6d8] text-[#8f1d2c]"
                      role="img"
                    >
                      <EmergencyTriangleIcon />
                    </span>
                    <ul className="grid gap-1.5">
                      {waterNonComplianceItems.map((item) => (
                        <li key={item.key} className="flex gap-2.5">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[#8f1d2c]" />
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ActionTakenChoiceGroup
                    customValue={customActionTaken}
                    errorId="water-action-taken-error"
                    inputRef={actionTakenCustomInputRef}
                    name="water-action-taken"
                    onCustomChange={updateCustomActionTaken}
                    onSelect={selectActionTakenChoice}
                    options={waterCorrectiveActionOptions}
                    selectedValue={actionTakenChoice}
                  />
                  {actionTakenError && !hasCompletedActionTaken ? (
                    <p className={operationalFormStyles.statusError}>{actionTakenError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!hasCompletedActionTaken}
                    onClick={() => setWaterStep(4)}
                    className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                  >
                    Continuar
                  </button>
                </div>
              ) : null}

              {waterStep === 4 ? (
                <FinalRegistrationStep {...finalRegistrationStepProps} />
              ) : null}
            </div>
          </section>
        ) : null}

        {formType === "supply_reception" ? (
          <section className="grid gap-2">
            <div className="grid min-h-[560px] content-start gap-8 rounded-[1.75rem] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
              <PublicFormCardHeader
                canGoBack={currentStep > 1}
                currentStep={currentStep}
                onBack={goBackSupplyStep}
                totalSteps={10}
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
                    <div
                      ref={temperatureMenuRef}
                      className="max-h-72 overflow-y-auto rounded-2xl border border-[#c7d8d4] bg-white p-2 shadow-[0_18px_40px_rgba(17,24,22,0.12)]"
                    >
                      <div className="grid gap-1">
                        {temperatureOptions.map((option) => {
                          const optionCompliant = isTemperatureCompliant(productType, String(option));
                          const isSelected = temperatureC === String(option);

                          return (
                            <button
                              key={option}
                              type="button"
                              data-temperature-option={option}
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
                  <h2 className="text-3xl font-black leading-tight text-neutral-950">¿Qué medidas se tomaron?</h2>
                </div>
                <div className="grid gap-2 rounded-2xl border-l-4 border-[#8f1d2c] bg-[#f8eeee] px-4 py-3 text-sm font-bold leading-6 text-neutral-950">
                  <span
                    aria-label="Alerta"
                    className="grid h-9 w-9 place-items-center rounded-xl bg-[#efd6d8] text-[#8f1d2c]"
                    role="img"
                  >
                    <EmergencyTriangleIcon />
                  </span>
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
                <ActionTakenChoiceGroup
                  customValue={customActionTaken}
                  errorId={showActionTakenError ? "supply-action-taken-error" : undefined}
                  inputRef={actionTakenCustomInputRef}
                  name="supply-action-taken"
                  onCustomChange={updateCustomActionTaken}
                  onSelect={selectActionTakenChoice}
                  options={supplyActionTakenOptions}
                  selectedValue={actionTakenChoice}
                />
                {showActionTakenError ? (
                  <p id="supply-action-taken-error" className={operationalFormStyles.statusError}>
                    {actionTakenError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!hasCompletedActionTaken}
                  onClick={() => setCurrentStep(10)}
                  className="min-h-16 rounded-2xl bg-[#111816] px-5 text-lg font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6]"
                >
                  Continuar
                </button>
                </div>
              ) : null}

              {currentStep === 10 ? (
                <FinalRegistrationStep {...finalRegistrationStepProps} />
              ) : null}
            </div>
          </section>
        ) : null}

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

            <DateTimePicker
              value={datePickerValue}
              min={recordDateLimits.min}
              max={recordDateLimits.max}
              onChange={setDatePickerValue}
            />

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
