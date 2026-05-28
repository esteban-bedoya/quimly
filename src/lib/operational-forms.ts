export const operationalFormTypes = [
  "thermal_control",
  "area_sanitation",
  "supply_reception",
  "water_quality",
] as const;

export type OperationalFormType = (typeof operationalFormTypes)[number];

export const operationalFormLabels: Record<
  OperationalFormType,
  {
    title: string;
    shortTitle: string;
    description: string;
  }
> = {
  thermal_control: {
    title: "Control termico",
    shortTitle: "Control termico",
    description: "Registro rapido de temperatura para equipos de refrigeracion.",
  },
  area_sanitation: {
    title: "Saneamiento de areas",
    shortTitle: "Saneamiento",
    description: "Checklist de conformidad para limpieza de areas operativas.",
  },
  supply_reception: {
    title: "Recepcion de insumos",
    shortTitle: "Recepcion",
    description: "Registro de producto, proveedor y vencimiento recibido.",
  },
  water_quality: {
    title: "Calidad del agua",
    shortTitle: "Agua",
    description: "Medicion de cloro libre con rango valido entre 0.3 y 2.0 ppm.",
  },
};

export function isOperationalFormType(value: string): value is OperationalFormType {
  return operationalFormTypes.includes(value as OperationalFormType);
}

export function createPublicFormPath(token: string) {
  return `/f/${encodeURIComponent(token)}`;
}

export function createPublicFormUrl(origin: string, token: string) {
  return new URL(createPublicFormPath(token), origin).toString();
}

