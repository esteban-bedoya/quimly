import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

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

type BranchModuleItem = {
  title: string;
  detail: string;
  badge?: string;
};

type BranchDetailViewProps = {
  company: CompanySummary;
  branch: {
    id: string;
    companyId: string;
    name: string;
    slug: string;
    isMain: boolean;
    isActive: boolean;
  };
  operationalItems?: BranchModuleItem[];
  complianceItems?: BranchModuleItem[];
  documents: BranchDocumentSummary[];
  qrCodes: BranchFormQrSummary[];
  refrigerationEquipment: BranchCatalogItemSummary[];
  sanitationAreas: BranchCatalogItemSummary[];
};

type BranchSectionMeta = {
  title: string;
  subtitle: string;
  hint: string;
};

const sectionLabels: Record<BranchDocumentSectionKey, BranchSectionMeta> = {
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

function getExpirationTone(expiresAt: string | null) {
  if (!expiresAt) {
    return "border-[#d8e5e6] bg-white text-[#66727a]";
  }

  const expirationDate = new Date(`${expiresAt}T00:00:00`);
  const currentTime = new Date().getTime();
  const diffInDays = Math.ceil((expirationDate.getTime() - currentTime) / (1000 * 60 * 60 * 24));

  if (diffInDays <= 10) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (diffInDays <= 30) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function DocumentStatusBadge({ expiresAt }: { expiresAt: string | null }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${getExpirationTone(expiresAt)}`}
    >
      {expiresAt ? `Vence ${formatDate(expiresAt)}` : "Sin vencimiento"}
    </span>
  );
}

function BranchLayout({
  company,
  branch,
  currentSection,
  children,
}: {
  company: CompanySummary;
  branch: BranchDetailViewProps["branch"];
  currentSection: "home" | "operational" | "compliance";
  children: ReactNode;
}) {
  const basePath = `/dashboard/sedes/${company.slug}/${branch.slug}`;
  const navigation = [
    { key: "home", href: basePath, label: "Resumen" },
    { key: "operational", href: `${basePath}/operacion`, label: "Control operativo" },
    { key: "compliance", href: `${basePath}/cumplimiento`, label: "Cumplimiento normativo" },
  ] as const;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafb_45%,#edf4f2_100%)] px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#d8e5e6] bg-white shadow-[0_20px_60px_rgba(18,17,15,0.06)]">
          <div className="border-b border-[#d8e5e6] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f7fcfb_48%,#edf7f5_100%)] px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#12110f] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#8fe3d5]">
                    Sede
                  </span>
                  {branch.isMain ? (
                    <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#1c6a71]">
                      Principal
                    </span>
                  ) : null}
                  <span className="rounded-full border border-[#d8e5e6] bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#66727a]">
                    {branch.isActive ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-[#2a7f86]">{company.name}</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#12110f] sm:text-5xl">
                    {branch.name}
                  </h1>
                </div>

                <nav className="flex flex-wrap gap-2">
                  {navigation.map((item) => {
                    const isActive = item.key === currentSection;

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
                          isActive
                            ? "bg-[#12110f] text-white"
                            : "border border-[#d8e5e6] bg-white text-[#12110f] hover:bg-[#f7fbfb]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8e5e6] bg-white px-5 py-2.5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f8fbfb]"
                >
                  Volver al dashboard
                </Link>
                <form action={logout} className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d1b18]"
                  >
                    Cerrar sesion
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}

function SummaryStat({
  label,
  value,
  tone = "light",
}: {
  label: string;
  value: string | number;
  tone?: "light" | "accent";
}) {
  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-4 ${
        tone === "accent" ? "border-[#c7ece4] bg-[#f1fbf8]" : "border-[#d8e5e6] bg-white"
      }`}
    >
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#6d7a7f]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">{value}</p>
    </div>
  );
}

function LandingModuleCard({
  title,
  description,
  href,
  metrics,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  metrics: Array<{ label: string; value: string | number }>;
  accent: "operational" | "compliance";
}) {
  return (
    <article
      className={`rounded-[1.8rem] border p-5 shadow-[0_16px_44px_rgba(18,17,15,0.05)] ${
        accent === "operational"
          ? "border-[#d7ebe7] bg-[linear-gradient(180deg,#ffffff_0%,#f4fbf8_100%)]"
          : "border-[#d8e5e6] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfb_100%)]"
      }`}
    >
      <div className="flex h-full flex-col gap-5">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-[#c9e8e5] bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#2a7f86]">
            {accent === "operational" ? "Macro modulo" : "Repositorio"}
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">{title}</h2>
            <p className="mt-2 text-sm leading-7 text-[#5e6770]">{description}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {metrics.map((metric) => (
            <SummaryStat key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>

        <Link
          href={href}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#12110f] px-5 text-sm font-semibold text-white transition hover:bg-[#1d1b18] sm:w-fit"
        >
          Abrir modulo
        </Link>
      </div>
    </article>
  );
}

function CompactModuleList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: BranchModuleItem[];
}) {
  return (
    <section className="rounded-[1.7rem] border border-[#d8e5e6] bg-[#fbfdfd] p-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#12110f]">{title}</h2>
        <p className="text-sm leading-6 text-[#5e6770]">{subtitle}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-[1.2rem] border border-[#d8e5e6] bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold tracking-[-0.02em] text-[#12110f]">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-[#5e6770]">{item.detail}</p>
              </div>
              {item.badge ? (
                <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
                  {item.badge}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
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
          className="h-32 w-32 rounded-2xl border border-[#d8e5e6] bg-white p-2"
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

          <p className="text-xs leading-5 text-[#7a838a]">Token permanente: {qrCode.token}.</p>
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

function BranchDocumentEditor({
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
    <details className="rounded-[1.2rem] border border-dashed border-[#d8e5e6] bg-[#fbfdfe] px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[#12110f]">Editar documento</summary>

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
  );
}

function CompactBranchDocumentRow({
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
    <div className="rounded-[1.25rem] border border-[#d8e5e6] bg-white px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-[-0.02em] text-[#161412]">{document.title}</p>
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

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
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

      <div className="mt-4">
        <BranchDocumentEditor
          document={document}
          branchId={branchId}
          companySlug={companySlug}
          branchSlug={branchSlug}
        />
      </div>
    </div>
  );
}

function CreateDocumentForm({
  branchId,
  companySlug,
  branchSlug,
  sectionKey,
}: {
  branchId: string;
  companySlug: string;
  branchSlug: string;
  sectionKey: BranchDocumentSectionKey;
}) {
  return (
    <details className="rounded-[1.25rem] border border-[#d8e5e6] bg-white px-4 py-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[#12110f]">Agregar documento</summary>

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
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-[#c9c0b6]" />
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
  );
}

function ComplianceSectionRepository({
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
  const requiresExpiration = sectionKey === "plant_certifications" || sectionKey === "staff_records";
  const activeDocuments = documents.filter((document) => document.isActive).length;

  return (
    <details className="rounded-[1.7rem] border border-[#d8e5e6] bg-[#fbfdfd] p-5">
      <summary className="flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#12110f]">{label.title}</h3>
            {requiresExpiration ? (
              <span className="rounded-full border border-[#bde5e7] bg-[#effbfb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
                Vencimiento
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-[#5e6770]">{label.subtitle}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#2a7f86]">{label.hint}</p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:w-[220px]">
          <SummaryStat label="Documentos" value={documents.length} />
          <SummaryStat label="Activos" value={activeDocuments} tone="accent" />
        </div>
      </summary>

      <div className="mt-5 grid gap-3">
        {documents.length ? (
          documents.map((document) => (
            <CompactBranchDocumentRow
              key={document.id}
              document={document}
              branchId={branchId}
              companySlug={companySlug}
              branchSlug={branchSlug}
            />
          ))
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-[#d8e5e6] bg-white px-4 py-5 text-sm leading-7 text-[#5e6770]">
            Todavia no hay documentos cargados en esta seccion.
          </div>
        )}

        <CreateDocumentForm
          branchId={branchId}
          companySlug={companySlug}
          branchSlug={branchSlug}
          sectionKey={sectionKey}
        />
      </div>
    </details>
  );
}

function getOperationalFallbackItems(): BranchModuleItem[] {
  return [
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
  ];
}

function getComplianceFallbackItems(): BranchModuleItem[] {
  return [
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
  ];
}

function countDocumentsExpiring(documents: BranchDocumentSummary[]) {
  const now = new Date().getTime();

  return documents.filter((document) => {
    if (!document.expiresAt) {
      return false;
    }

    const expirationDate = new Date(`${document.expiresAt}T00:00:00`);
    const diffInDays = Math.ceil((expirationDate.getTime() - now) / (1000 * 60 * 60 * 24));
    return diffInDays <= 30;
  }).length;
}

export function BranchLandingView({
  company,
  branch,
  qrCodes,
  documents,
  refrigerationEquipment,
  sanitationAreas,
}: BranchDetailViewProps) {
  const basePath = `/dashboard/sedes/${company.slug}/${branch.slug}`;

  return (
    <BranchLayout company={company} branch={branch} currentSection="home">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[1.8rem] border border-[#d8e5e6] bg-[#fbfdfd] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2a7f86]">Resumen de sede</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
            Elige el frente que quieres gestionar
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5e6770]">
            Esta vista concentra solo el contexto esencial. La operacion diaria y el cumplimiento documental viven en
            modulos separados para reducir scroll y hacer mas clara la gestion.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <SummaryStat label="QR publicos" value={qrCodes.length} tone="accent" />
            <SummaryStat label="Documentos" value={documents.length} />
            <SummaryStat label="Vencen pronto" value={countDocumentsExpiring(documents)} />
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-[#d8e5e6] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2a7f86]">Cobertura actual</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryStat label="Equipos" value={refrigerationEquipment.length} />
            <SummaryStat label="Areas" value={sanitationAreas.length} />
            <SummaryStat label="Secciones normativas" value={Object.keys(sectionLabels).length} />
            <SummaryStat label="Estado sede" value={branch.isActive ? "Activa" : "Inactiva"} />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <LandingModuleCard
          title="Control operativo"
          description="Gestiona QR publicos, formularios operativos y catalogos rapidos para uso diario en sede."
          href={`${basePath}/operacion`}
          accent="operational"
          metrics={[
            { label: "QR", value: qrCodes.length },
            { label: "Equipos", value: refrigerationEquipment.length },
            { label: "Areas", value: sanitationAreas.length },
            { label: "Formularios", value: operationalFormTypes.length },
          ]}
        />
        <LandingModuleCard
          title="Cumplimiento normativo"
          description="Administra repositorio PDF, vencimientos y documentos por seccion con una vista compacta."
          href={`${basePath}/cumplimiento`}
          accent="compliance"
          metrics={[
            { label: "Documentos", value: documents.length },
            { label: "Vencen pronto", value: countDocumentsExpiring(documents) },
            { label: "Secciones", value: Object.keys(sectionLabels).length },
            { label: "Activos", value: documents.filter((document) => document.isActive).length },
          ]}
        />
      </div>
    </BranchLayout>
  );
}

export function BranchOperationalView({
  company,
  branch,
  operationalItems,
  qrCodes,
  refrigerationEquipment,
  sanitationAreas,
}: BranchDetailViewProps) {
  const moduleItems = operationalItems ?? getOperationalFallbackItems();

  return (
    <BranchLayout company={company} branch={branch} currentSection="operational">
      <div className="grid gap-6">
        <CompactModuleList
          title="Control operativo"
          subtitle="Todo lo relacionado con operacion diaria vive aqui: formularios publicos, QR permanentes y catalogos de apoyo."
          items={moduleItems}
        />

        <section className="rounded-[1.7rem] border border-[#d8e5e6] bg-white p-5">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">QR publicos</p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
              Formularios operativos sin login
            </h2>
            <p className="text-sm leading-7 text-[#5e6770]">
              Cada codigo abre un formulario publico limitado a crear registros para esta sede. El token es
              permanente y el QR descargado puede imprimirse sin riesgo de cambio.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {operationalFormTypes.map((formType) => {
              const qrCode = qrCodes.find((candidate) => candidate.formType === formType);

              return qrCode ? (
                <BranchQrCard key={formType} qrCode={qrCode} />
              ) : (
                <MissingBranchQrCard key={formType} formType={formType} />
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.7rem] border border-[#d8e5e6] bg-[#fbfdfd] p-5">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">Catalogos rapidos</p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">Selectores de la sede</h2>
            <p className="text-sm leading-7 text-[#5e6770]">
              Equipos y areas alimentan los formularios operativos. Mantenerlos compactos facilita el uso diario en
              cocina y reduce errores de captura.
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
        </section>
      </div>
    </BranchLayout>
  );
}

export function BranchComplianceView({
  company,
  branch,
  complianceItems,
  documents,
}: BranchDetailViewProps) {
  const moduleItems = complianceItems ?? getComplianceFallbackItems();
  const documentsBySection = {
    manuals_protocols: documents.filter((document) => document.sectionKey === "manuals_protocols"),
    plant_certifications: documents.filter((document) => document.sectionKey === "plant_certifications"),
    traceability_supplies: documents.filter((document) => document.sectionKey === "traceability_supplies"),
    staff_records: documents.filter((document) => document.sectionKey === "staff_records"),
  } satisfies Record<BranchDocumentSectionKey, BranchDocumentSummary[]>;

  return (
    <BranchLayout company={company} branch={branch} currentSection="compliance">
      <div className="grid gap-6">
        <CompactModuleList
          title="Cumplimiento normativo"
          subtitle="Repositorio documental organizado por seccion, con vencimientos visibles y detalle editable solo cuando hace falta."
          items={moduleItems}
        />

        <section className="rounded-[1.7rem] border border-[#d8e5e6] bg-white p-5">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">Repositorio PDF</p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Gestion documental compacta
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Cada seccion se abre solo cuando necesitas trabajarla. Asi evitamos tarjetas enormes repetidas y la
                sede deja de sentirse como un dashboard infinito.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryStat label="Documentos" value={documents.length} />
              <SummaryStat label="Activos" value={documents.filter((document) => document.isActive).length} />
              <SummaryStat label="Vencen pronto" value={countDocumentsExpiring(documents)} tone="accent" />
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {(Object.keys(sectionLabels) as BranchDocumentSectionKey[]).map((sectionKey) => (
              <ComplianceSectionRepository
                key={sectionKey}
                branchId={branch.id}
                companySlug={company.slug}
                branchSlug={branch.slug}
                sectionKey={sectionKey}
                documents={documentsBySection[sectionKey]}
              />
            ))}
          </div>
        </section>
      </div>
    </BranchLayout>
  );
}
