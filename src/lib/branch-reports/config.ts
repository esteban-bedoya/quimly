import { operationalFormLabels, operationalFormTypes, type OperationalFormType } from "@/lib/operational-forms";
import type { BranchSanitaryDocumentKind } from "@/types/auth";

export const reportFormOptions = operationalFormTypes.map((formType) => ({
  id: formType,
  label: operationalFormLabels[formType].title.charAt(0) + operationalFormLabels[formType].title.slice(1).toLocaleLowerCase("es-CO"),
  title: operationalFormLabels[formType].title,
}));

export type ReportFormOptionId = OperationalFormType;

export const currentDocumentCategories = [
  {
    id: "sanitation_plan",
    title: "Plan de saneamiento básico",
    documentKinds: ["sanitation_plan"],
  },
  {
    id: "pest_control",
    title: "Certificado de control de plagas",
    documentKinds: ["pest_control_certificate"],
  },
  {
    id: "water_tank_cleaning",
    title: "Certificado de lavado de tanques de agua potable",
    documentKinds: ["water_tank_cleaning_certificate"],
  },
  {
    id: "acu_final_disposal",
    title: "Certificado de disposición final de aceites (ACU)",
    documentKinds: ["acu_final_disposal_certificate"],
  },
  {
    id: "staff_records",
    title: "Fichas de colaboradores",
    documentKinds: ["food_handling_course", "medical_fitness_exam"],
  },
  {
    id: "chemical_products",
    title: "Fichas de productos químicos",
    documentKinds: ["chemical_technical_sheet", "chemical_safety_sheet"],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  documentKinds: readonly BranchSanitaryDocumentKind[];
}[];

export type CurrentDocumentCategoryId = (typeof currentDocumentCategories)[number]["id"];

export const historyDocumentCategories = [
  {
    id: "pest_control",
    title: "Control de plagas",
    documentKind: "pest_control_certificate",
    fileSingular: "certificado",
    filePlural: "certificados",
  },
  {
    id: "water_tank_cleaning",
    title: "Lavado de tanques de agua potable",
    documentKind: "water_tank_cleaning_certificate",
    fileSingular: "certificado",
    filePlural: "certificados",
  },
  {
    id: "acu_final_disposal",
    title: "Disposición final de aceites (ACU)",
    documentKind: "acu_final_disposal_certificate",
    fileSingular: "certificado",
    filePlural: "certificados",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  documentKind: BranchSanitaryDocumentKind;
  fileSingular: string;
  filePlural: string;
}[];

export type HistoryDocumentCategoryId = (typeof historyDocumentCategories)[number]["id"];

export function isCurrentDocumentCategoryId(value: string): value is CurrentDocumentCategoryId {
  return currentDocumentCategories.some((category) => category.id === value);
}

export function isHistoryDocumentCategoryId(value: string): value is HistoryDocumentCategoryId {
  return historyDocumentCategories.some((category) => category.id === value);
}

export function getCurrentDocumentCategoryLabel(categoryId: CurrentDocumentCategoryId) {
  return currentDocumentCategories.find((category) => category.id === categoryId)?.title ?? categoryId;
}

export function getHistoryDocumentCategory(categoryId: HistoryDocumentCategoryId) {
  return historyDocumentCategories.find((category) => category.id === categoryId) ?? historyDocumentCategories[0];
}
