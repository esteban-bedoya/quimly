import Image from "next/image";
import Link from "next/link";

import {
  createBranchRefrigerationEquipmentAction,
  createBranchSanitationAreaAction,
  createBranchDocumentAction,
  deleteBranchDocumentAction,
  toggleBranchRefrigerationEquipmentAction,
  toggleBranchSanitationAreaAction,
  updateBranchDocumentAction,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import { createPublicFormPath, operationalFormLabels, operationalFormTypes } from "@/lib/operational-forms";
import type {
  BranchCatalogItemSummary,
  BranchDocumentSectionKey,
  BranchDocumentSummary,
  BranchFormQrSummary,
  CompanySummary,
  OperationalFormType,
} from "@/types/auth";

type BranchModule = {
  title: string;
  subtitle: string;
  items: Array<{
    title: string;
    detail: string;
    badge?: string;
  }>;
};

const sectionLabels: Record<
  BranchDocumentSectionKey,
  { title: string; subtitle: string; hint: string }
> = {
  manuals_protocols: {
    title: "Manuales y Protocolos",
    subtitle: "Saneamiento + Quimicos",
    hint: "Repositorio base para auditorias y procedimientos operativos.",
  },
  plant_certifications: {
    title: "Certificaciones de Planta",
    subtitle: "Fumigacion y Tanques",
    hint: "Incluye control visual de fecha de vencimiento.",
  },
  traceability_supplies: {
    title: "Trazabilidad de Insumos",
    subtitle: "Fichas tecnicas + Hojas de seguridad",
    hint: "Centraliza soportes por producto y respaldo tecnico.",
  },
  staff_records: {
    title: "Fichas del Personal",
    subtitle: "Curso de manipulacion + Examenes medicos",
    hint: "Registros con semaforo de vencimiento.",
  },
};

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return "Sin vencimiento";
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Fecha invalida";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function DocumentStatusBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) {
    return (
      <span className="rounded-full border border-[#d8e5e6] bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#66727a]">
        Sin vencimiento
      </span>
    );
  }

  const expirationDate = new Date(`${expiresAt}T00:00:00`);
  const currentTime = new Date().getTime();
  const diffInDays = Math.ceil((expirationDate.getTime() - currentTime) / (1000 * 60 * 60 * 24));

  let toneClassName = "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (diffInDays <= 30) {
    toneClassName = "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (diffInDays <= 10) {
    toneClassName = "border-rose-200 bg-rose-50 text-rose-700";
  }

  return (
    <span className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${toneClassName}`}>
      Vence {formatDate(expiresAt)}
    </span>
  );
}

function ModuleItem({
  title,
  detail,
  badge,
  tone,
}: {
  title: string;
  detail: string;
  badge?: string;
  tone: "dark" | "light";
}) {
  const subtitleClassName = tone === "dark" ? "text-[#5e6770]" : "text-[#5e6770]";
  const titleClassName = "text-[#12110f]";
  const cardClassName =
    tone === "dark"
      ? "border-[#d8e5e6] bg-white hover:border-[#bfcfd1] hover:bg-[#fbfdfe]"
      : "border-[#d8e5e6] bg-white hover:border-[#bfcfd1] hover:bg-[#fbfdfe]";

  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 transition duration-300 ${cardClassName}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className={`text-[0.95rem] font-semibold tracking-[-0.02em] ${titleClassName}`}>{title}</p>
          <p className={`text-sm leading-6 ${subtitleClassName}`}>{detail}</p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BranchModuleCard({
  module,
  variant,
}: {
  module: BranchModule;
  variant: "operational" | "compliance";
}) {
  const containerStyles =
    variant === "operational"
      ? "border-[#d8e5e6] bg-white"
      : "border-[#d8e5e6] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfb_100%)]";

  return (
    <section className={`rounded-[2rem] border p-6 shadow-[0_24px_70px_rgba(18,17,15,0.06)] ${containerStyles}`}>
      <div className="space-y-3">
        <span className="w-fit rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#1c6a71]">
          {variant === "operational" ? "Macro modulo A" : "Macro modulo B"}
        </span>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">{module.title}</h2>
          <p className="max-w-2xl text-sm leading-7 text-[#5e6770]">{module.subtitle}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {module.items.map((item) => (
          <ModuleItem key={item.title} {...item} tone="light" />
        ))}
      </div>
    </section>
  );
}

function BranchDocumentCard({
  document,
  branchId,
  companySlug,
  branchSlug,
}: {
  document: BranchDocumentSummary;
  branchId: string;
  companySlug: string;
  branchSlug: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[#d8e5e6] bg-white px-4 py-4 shadow-[0_10px_28px_rgba(18,17,15,0.05)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-base font-semibold tracking-[-0.02em] text-[#161412]">{document.title}</h4>
            <p className="mt-1 text-sm leading-6 text-[#5e6770]">
              {document.description || "Documento PDF indexado para la sede."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DocumentStatusBadge expiresAt={document.expiresAt} />
            <span
              className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${
                document.isActive
                  ? "border-[#d8e5e6] bg-white text-[#66727a]"
                  : "border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}
            >
              {document.isActive ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {document.fileUrl ? (
            <a
              href={document.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#12110f] underline decoration-[#2a7f86]/25 underline-offset-4 transition hover:text-[#2a7f86]"
            >
              Abrir PDF
            </a>
          ) : (
            <span className="text-[#8a8177]">Sin enlace cargado</span>
          )}
          <span className="text-[#8a8177]">Orden {document.sortOrder}</span>
        </div>

        <details className="rounded-[1.25rem] border border-dashed border-[#d8e5e6] bg-[#fbfdfe] px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[#12110f]">
            Editar documento
          </summary>

          <form action={updateBranchDocumentAction} className="mt-4 grid gap-4">
            <input type="hidden" name="documentId" value={document.id} />
            <input type="hidden" name="branchId" value={branchId} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="branchSlug" value={branchSlug} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">Seccion</label>
                <select
                  name="sectionKey"
                  defaultValue={document.sectionKey}
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                >
                  {Object.entries(sectionLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">Titulo</label>
                <input
                  name="title"
                  defaultValue={document.title}
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">Descripcion</label>
                <input
                  name="description"
                  defaultValue={document.description ?? ""}
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">URL del PDF</label>
                <input
                  name="fileUrl"
                  defaultValue={document.fileUrl ?? ""}
                  placeholder="https://..."
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">Vencimiento</label>
                <input
                  name="expiresAt"
                  type="date"
                  defaultValue={document.expiresAt ?? ""}
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#12110f]">Orden</label>
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue={document.sortOrder}
                  className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
                />
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#3f3831]">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={document.isActive}
                  className="h-4 w-4 rounded border-[#c9c0b6]"
                />
                <span>Documento activo</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#12110f]">Reemplazar PDF</label>
              <input
                type="file"
                name="pdfFile"
                accept="application/pdf"
                className="block w-full text-sm text-[#5e6770] file:mr-4 file:rounded-full file:border-0 file:bg-[#12110f] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1d1b18]"
              />
              <p className="text-xs leading-6 text-[#7a838a]">
                Si cargas un nuevo archivo, Quimly reemplaza el PDF anterior y actualiza el enlace.
              </p>
            </div>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
            >
              Guardar cambios
            </button>
          </form>

          <form action={deleteBranchDocumentAction} className="mt-3 flex justify-end">
            <input type="hidden" name="documentId" value={document.id} />
            <input type="hidden" name="branchId" value={branchId} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="branchSlug" value={branchSlug} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              Eliminar
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

function BranchSectionPanel({
  branchId,
  companySlug,
  branchSlug,
  sectionKey,
  documents,
}: {
  branchId: string;
  companySlug: string;
  branchSlug: string;
  sectionKey: BranchDocumentSectionKey;
  documents: BranchDocumentSummary[];
}) {
  const label = sectionLabels[sectionKey];
  const requiresExpiration =
    sectionKey === "plant_certifications" || sectionKey === "staff_records";

  return (
    <article className="rounded-[1.9rem] border border-[#d8e5e6] bg-[#fbfdfe] p-5 shadow-[0_16px_44px_rgba(18,17,15,0.05)]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold tracking-[-0.03em] text-[#161412]">{label.title}</p>
          {requiresExpiration ? (
            <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
              Vencimiento
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-[#5e6770]">{label.subtitle}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-[#2a7f86]">{label.hint}</p>
      </div>

      <div className="mt-5 grid gap-3">
        {documents.length ? (
          documents.map((document) => (
            <BranchDocumentCard
              key={document.id}
              document={document}
              branchId={branchId}
              companySlug={companySlug}
              branchSlug={branchSlug}
            />
          ))
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-[#d8e5e6] bg-white px-4 py-5 text-sm leading-7 text-[#5e6770]">
            Todavia no hay documentos cargados en esta seccion.
          </div>
        )}
      </div>

      <details className="mt-5 rounded-[1.4rem] border border-[#d8e5e6] bg-white px-4 py-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#12110f]">
          Cargar nuevo PDF
        </summary>

        <form action={createBranchDocumentAction} className="mt-4 grid gap-4">
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="branchSlug" value={branchSlug} />
          <input type="hidden" name="sectionKey" value={sectionKey} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#12110f]">Titulo</label>
              <input
                name="title"
                placeholder="Nombre del PDF"
                className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#12110f]">Descripcion</label>
              <input
                name="description"
                placeholder="Resumen breve"
                className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-[#12110f]">URL del PDF</label>
              <input
                name="fileUrl"
                placeholder="https://..."
                className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#12110f]">Orden</label>
              <input
                name="sortOrder"
                type="number"
                defaultValue={0}
                className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#12110f]">Vencimiento</label>
              <input
                name="expiresAt"
                type="date"
                className="min-h-11 w-full rounded-2xl border border-[#d8e5e6] bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-[#d8e5e6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#3f3831]">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="h-4 w-4 rounded border-[#c9c0b6]"
              />
              <span>Documento activo</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Subir PDF</label>
            <input
              type="file"
              name="pdfFile"
              accept="application/pdf"
              className="block w-full text-sm text-[#5e6770] file:mr-4 file:rounded-full file:border-0 file:bg-[#12110f] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1d1b18]"
            />
            <p className="text-xs leading-6 text-[#7a838a]">
              Puedes subir el archivo o pegar una URL. Si subes archivo, Quimly publicara el PDF en Storage.
            </p>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
          >
            Guardar PDF
          </button>
        </form>
      </details>
    </article>
  );
}

function CatalogAdminPanel({
  title,
  hint,
  branchId,
  companySlug,
  branchSlug,
  items,
  createAction,
  toggleAction,
}: {
  title: string;
  hint: string;
  branchId: string;
  companySlug: string;
  branchSlug: string;
  items: BranchCatalogItemSummary[];
  createAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article className="rounded-[1.6rem] border border-[#d8e5e6] bg-white p-4 shadow-[0_12px_34px_rgba(18,17,15,0.05)]">
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#5e6770]">{hint}</p>
      </div>

      <div className="mt-4 grid gap-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-2xl border border-[#d8e5e6] bg-[#fbfdfe] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-[#12110f]">{item.name}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a838a]">
                  {item.isActive ? "Activo" : "Inactivo"}
                </p>
              </div>
              <form action={toggleAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="branchId" value={branchId} />
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="branchSlug" value={branchSlug} />
                {item.isActive ? null : <input type="hidden" name="nextIsActive" value="on" />}
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#d8e5e6] bg-white px-4 text-sm font-semibold text-[#12110f] transition hover:bg-[#f8fbfb]"
                >
                  {item.isActive ? "Desactivar" : "Activar"}
                </button>
              </form>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-[#d8e5e6] bg-[#fbfdfe] px-4 py-4 text-sm leading-6 text-[#5e6770]">
            Todavia no hay elementos registrados.
          </p>
        )}
      </div>

      <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="companySlug" value={companySlug} />
        <input type="hidden" name="branchSlug" value={branchSlug} />
        <input
          name="name"
          placeholder="Nombre para el selector publico"
          className="min-h-11 rounded-2xl border border-[#d8e5e6] bg-white px-4 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
        >
          Agregar
        </button>
      </form>
    </article>
  );
}

function BranchQrCard({
  qrCode,
}: {
  qrCode: BranchFormQrSummary | undefined;
}) {
  const formType = qrCode?.formType;
  const label = formType ? operationalFormLabels[formType] : null;
  const publicPath = qrCode ? createPublicFormPath(qrCode.token) : "";
  const qrImagePath = qrCode ? `/api/qr/${encodeURIComponent(qrCode.token)}` : "";

  if (!qrCode || !label) {
    return null;
  }

  return (
    <article className="rounded-[1.6rem] border border-[#d8e5e6] bg-white p-4 shadow-[0_12px_34px_rgba(18,17,15,0.05)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Image
          src={qrImagePath}
          alt={`QR publico para ${label.title}`}
          width={144}
          height={144}
          unoptimized
          className="h-36 w-36 rounded-2xl border border-[#d8e5e6] bg-white p-2"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2a7f86]">{label.shortTitle}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#12110f]">{label.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#5e6770]">{label.description}</p>
          </div>

          <div className="rounded-2xl border border-[#d8e5e6] bg-[#fbfdfe] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#7a838a]">
              URL publica
            </p>
            <a
              href={publicPath}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-sm font-semibold text-[#12110f] underline decoration-[#2a7f86]/25 underline-offset-4"
            >
              {publicPath}
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={qrImagePath}
              download={`quimly-${qrCode.formType}-${qrCode.token}.svg`}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#12110f] px-4 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
            >
              Descargar QR
            </a>
          </div>

          <p className="text-xs leading-5 text-[#7a838a]">
            Token permanente: {qrCode.token}.
          </p>
        </div>
      </div>
    </article>
  );
}

function MissingBranchQrCard({
  formType,
}: {
  formType: OperationalFormType;
}) {
  const label = operationalFormLabels[formType];

  return (
    <article className="rounded-[1.6rem] border border-dashed border-[#d8e5e6] bg-white p-4">
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f]">{label.title}</h3>
      <p className="mt-1 text-sm leading-6 text-[#5e6770]">
        El QR permanente de este formulario se crea automaticamente. Recarga la sede en unos segundos si acaba de ser
        creada.
      </p>
    </article>
  );
}

export function BranchDetailView({
  company,
  branch,
  operationalItems,
  complianceItems,
  documents,
  qrCodes,
  refrigerationEquipment,
  sanitationAreas,
}: {
  company: CompanySummary;
  branch: {
    id: string;
    companyId: string;
    name: string;
    slug: string;
    isMain: boolean;
    isActive: boolean;
  };
  operationalItems?: BranchModule["items"];
  complianceItems?: BranchModule["items"];
  documents: BranchDocumentSummary[];
  qrCodes: BranchFormQrSummary[];
  refrigerationEquipment: BranchCatalogItemSummary[];
  sanitationAreas: BranchCatalogItemSummary[];
}) {
  const operationalModule: BranchModule = {
    title: "Control Operativo",
    subtitle: "Registros rapidos en cocina mediante escaneo de codigos QR. No requieren inicio de sesion.",
    items:
      operationalItems ?? [
        {
          title: "Saneamiento de Areas",
          detail: "Checklist de Limpieza para rutinas diarias y cierre operativo.",
        },
        {
          title: "Control Termico",
          detail: "Control de Frio para validar temperaturas en recepcion y conservacion.",
        },
        {
          title: "Recepcion de Insumos",
          detail: "Entrada de Mercancia para registrar materias primas y novedades de entrega.",
        },
        {
          title: "Calidad del Agua",
          detail: "Prueba de Cloro en Agua para control basico de inocuidad.",
        },
      ],
  };

  const complianceModule: BranchModule = {
    title: "Cumplimiento Normativo",
    subtitle: "Repositorio documental indexado por el administrador para soporte de auditorias.",
    items:
      complianceItems ?? [
        {
          title: "Manuales y Protocolos",
          detail: "Saneamiento + Quimicos, organizados para consulta rapida y trazable.",
        },
        {
          title: "Certificaciones de Planta",
          detail: "Fumigacion y Tanques con control visual de fecha de vencimiento.",
          badge: "Vencimiento",
        },
        {
          title: "Trazabilidad de Insumos",
          detail: "Fichas tecnicas de productos + hojas de seguridad indexadas por lote.",
        },
        {
          title: "Fichas del Personal",
          detail: "Curso de manipulacion + examenes medicos con semaforo de vencimiento.",
          badge: "Vencimiento",
        },
      ],
  };

  const documentsBySection = {
    manuals_protocols: documents.filter((document) => document.sectionKey === "manuals_protocols"),
    plant_certifications: documents.filter((document) => document.sectionKey === "plant_certifications"),
    traceability_supplies: documents.filter((document) => document.sectionKey === "traceability_supplies"),
    staff_records: documents.filter((document) => document.sectionKey === "staff_records"),
  } satisfies Record<BranchDocumentSectionKey, BranchDocumentSummary[]>;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafb_45%,#eef4f5_100%)] px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#d8e5e6] bg-white shadow-[0_20px_60px_rgba(18,17,15,0.06)]">
          <div className="border-b border-[#d8e5e6] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f9fbfb_45%,#eef7f7_100%)] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-fit rounded-full bg-[#12110f] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#7ad9dd]">
                    Sede operativa
                  </span>
                  {branch.isMain ? (
                    <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#1c6a71]">
                      Principal
                    </span>
                  ) : null}
                  <span className="rounded-full border border-[#d8e5e6] bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#66727a]">
                    {branch.isActive ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-[#2a7f86]">{company.name}</p>
                  <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[#12110f] sm:text-5xl">
                    {branch.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5e6770] sm:text-base">
                    Vista interna enfocada en operacion en vivo y respaldo normativo, presentada en dos macro
                    modulos equilibrados.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8e5e6] bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f8fbfb]"
                >
                  Volver al dashboard
                </Link>
                <form action={logout} className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-2">
            <BranchModuleCard module={operationalModule} variant="operational" />
            <BranchModuleCard module={complianceModule} variant="compliance" />
          </div>

          <div className="border-t border-[#d8e5e6] bg-white px-6 py-6 sm:px-8 sm:py-8">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">QR publicos</p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Formularios operativos sin login
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Cada codigo abre un formulario publico limitado a crear registros para esta sede. No muestra
                dashboard, historial ni enlaces internos.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {operationalFormTypes.map((formType) => {
                const qrCode = qrCodes.find((candidate) => candidate.formType === formType);

                return qrCode ? (
                  <BranchQrCard
                    key={formType}
                    qrCode={qrCode}
                  />
                ) : (
                  <MissingBranchQrCard
                    key={formType}
                    formType={formType}
                  />
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#d8e5e6] bg-[#fbfdfe] px-6 py-6 sm:px-8 sm:py-8">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">
                Selectores publicos
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Catalogos rapidos de la sede
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Estos elementos alimentan los selectores de control termico y saneamiento. Mantenerlos cortos ayuda a
                completar registros desde cocina en pocos toques.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <CatalogAdminPanel
                title="Equipos de refrigeracion"
                hint="Aparecen en el QR de control termico."
                branchId={branch.id}
                companySlug={company.slug}
                branchSlug={branch.slug}
                items={refrigerationEquipment}
                createAction={createBranchRefrigerationEquipmentAction}
                toggleAction={toggleBranchRefrigerationEquipmentAction}
              />
              <CatalogAdminPanel
                title="Areas o zonas"
                hint="Aparecen en el QR de saneamiento de areas."
                branchId={branch.id}
                companySlug={company.slug}
                branchSlug={branch.slug}
                items={sanitationAreas}
                createAction={createBranchSanitationAreaAction}
                toggleAction={toggleBranchSanitationAreaAction}
              />
            </div>
          </div>

          <div className="border-t border-[#d8e5e6] bg-[#fbfdfe] px-6 py-6 sm:px-8 sm:py-8">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">Repositorio PDF</p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Gestion documental de la sede
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Cada carpeta funciona como una seccion editable con creacion, actualizacion y eliminacion de
                documentos PDF.
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {(Object.keys(sectionLabels) as BranchDocumentSectionKey[]).map((sectionKey) => (
                <BranchSectionPanel
                  key={sectionKey}
                  branchId={branch.id}
                  companySlug={company.slug}
                  branchSlug={branch.slug}
                  sectionKey={sectionKey}
                  documents={documentsBySection[sectionKey]}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
