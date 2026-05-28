"use client";

import { useActionState } from "react";

import { submitPublicOperationalForm, type PublicFormState } from "@/app/f/[token]/actions";
import { operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";

type CatalogItem = {
  id: string;
  name: string;
};

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
  const label = operationalFormLabels[formType];
  const missingThermalCatalog = formType === "thermal_control" && equipment.length === 0;
  const missingAreaCatalog = formType === "area_sanitation" && sanitationAreas.length === 0;
  const isDisabled = isPending || missingThermalCatalog || missingAreaCatalog;

  return (
    <main className="min-h-screen bg-[#f2f7f5] px-4 py-5 text-[#111816]">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col justify-center">
        <section className="overflow-hidden rounded-[2rem] border border-[#cfe0dc] bg-white shadow-[0_24px_80px_rgba(17,24,22,0.12)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#d6fff4_0%,#f5fffb_42%,#ffffff_100%)] px-5 py-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#147060]">Quimly publico</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#111816]">{label.title}</h1>
            <p className="mt-3 text-base leading-7 text-[#51645f]">{label.description}</p>
            <div className="mt-4 rounded-2xl border border-[#cfe0dc] bg-white/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#147060]">{companyName}</p>
              <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#111816]">{branchName}</p>
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
                        {item.name}
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
                  <span className="text-sm font-black text-[#111816]">Producto recibido</span>
                  <input
                    name="productName"
                    required
                    placeholder="Ej. Pechuga de pollo"
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Proveedor</span>
                  <input
                    name="providerName"
                    required
                    placeholder="Nombre del proveedor"
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#111816]">Fecha de vencimiento</span>
                  <input
                    name="expirationDate"
                    type="date"
                    required
                    className="min-h-14 rounded-2xl border border-[#c7d8d4] bg-[#fbfffd] px-4 text-lg font-bold text-[#111816] outline-none transition focus:border-[#147060] focus:bg-white"
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
