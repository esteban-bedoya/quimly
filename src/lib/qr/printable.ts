import type { OperationalFormType } from "@/lib/operational-forms";

export type PrintableQrInstructionItem = {
  label: string;
  value: string;
};

export const printableQrInstructions: Record<OperationalFormType, PrintableQrInstructionItem[]> = {
  thermal_control: [
    { label: "Frecuencia de registro:", value: "Mínimo 2 veces al día por equipo." },
    { label: "Aplica para:", value: "Equipos de refrigeración y congelación." },
  ],
  area_sanitation: [
    { label: "Frecuencia de registro:", value: "Después de cada limpieza o desinfección." },
    {
      label: "Aplica para:",
      value: "Áreas, equipos y utensilios incluidos en el Plan de Saneamiento Básico.",
    },
  ],
  supply_reception: [
    { label: "Frecuencia de registro:", value: "En cada ingreso de proveedores." },
    {
      label: "Aplica para:",
      value: "Carnes, pescados, huevos, lácteos y demás productos de alto riesgo sanitario.",
    },
  ],
  water_quality: [
    { label: "Frecuencia de registro:", value: "Diariamente al inicio de la jornada." },
    { label: "Aplica para:", value: "Medición de cloro libre residual y pH del agua." },
  ],
};
