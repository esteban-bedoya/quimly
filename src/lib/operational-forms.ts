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
    title: "CONTROL DE TEMPERATURAS",
    shortTitle: "CONTROL DE TEMPERATURAS",
    description:
      "Monitoreo diario obligatorio para garantizar la cadena de frio y asegurar la correcta conservacion de materias primas y alimentos.",
  },
  area_sanitation: {
    title: "LIMPIEZA Y DESINFECCION",
    shortTitle: "LIMPIEZA Y DESINFECCION",
    description:
      "Verificacion diaria del cumplimiento de los protocolos higienicos y sanitarios en las zonas operativas de la sede.",
  },
  supply_reception: {
    title: "RECEPCION DE MATERIAS PRIMAS",
    shortTitle: "RECEPCION DE MATERIAS PRIMAS",
    description:
      "Inspeccion obligatoria de condiciones sanitarias, empaque, fechas de vencimiento y temperaturas de los productos al momento del ingreso.",
  },
  water_quality: {
    title: "CONTROL DE AGUA POTABLE",
    shortTitle: "CONTROL DE AGUA POTABLE",
    description:
      "Registro obligatorio para la medicion diaria de cloro libre residual (rango normativo: 0.3 a 2.0 ppm) para garantizar el abastecimiento seguro.",
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
