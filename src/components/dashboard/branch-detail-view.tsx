"use client";

import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  archiveBranchRefrigerationEquipmentAction,
  archiveBranchSanitationAreaAction,
  createBranchRefrigerationEquipmentStateAction,
  createBranchSanitationAreaStateAction,
  createBranchDocumentAction,
  deleteBranchDocumentAction,
  toggleBranchRefrigerationEquipmentAction,
  toggleBranchSanitationAreaAction,
  updateBranchDocumentAction,
  type AdminActionState,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import { operationalFormLabels, operationalFormTypes } from "@/lib/operational-forms";
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

type BranchSectionKey = "home" | "operational" | "compliance";

const sectionLabels: Record<BranchDocumentSectionKey, BranchSectionMeta> = {
  manuals_protocols: {
    title: "Manuales y Protocolos",
    subtitle: "Saneamiento + Quimicos",
    hint: "Repositorio base para auditorias y procedimientos operativos.",
  },
  plant_certifications: {
    title: "Certificaciones de Planta",
    subtitle: "Fumigación y Tanques",
    hint: "Incluye control visual de fecha de vencimiento.",
  },
  traceability_supplies: {
    title: "Trazabilidad de Insumos",
    subtitle: "Fichas técnicas + Hojas de seguridad",
    hint: "Centraliza soportes por producto y respaldo tecnico.",
  },
  staff_records: {
    title: "Fichas del Personal",
    subtitle: "Curso de manipulación + Exámenes médicos",
    hint: "Registros con semaforo de vencimiento.",
  },
};

const productCardSurface =
  "border border-white/80 bg-white/74 shadow-[0_-18px_40px_rgba(18,17,15,0.08),0_18px_40px_rgba(18,17,15,0.08)] backdrop-blur-xl";
const productCardSurfaceSoft =
  "border border-white/55 bg-white/48 shadow-[0_14px_32px_rgba(18,17,15,0.06)] backdrop-blur-xl";

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
  currentSection: BranchSectionKey;
  children: ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const basePath = `/dashboard/sedes/${company.slug}/${branch.slug}`;
  const navigation = [
    { key: "home", href: basePath, label: "Panel" },
    { key: "operational", href: `${basePath}/operacion`, label: "Formularios" },
    { key: "compliance", href: `${basePath}/cumplimiento`, label: "Documentos" },
  ] as const;

  useEffect(() => {
    const closeMenu = () => setIsMenuOpen(false);

    window.addEventListener("scroll", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("scroll", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, []);

  const activeIndex = navigation.findIndex((item) => item.key === currentSection);

  return (
    <main className="min-h-screen bg-white px-4 py-5 text-[#12110f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="relative rounded-[1.75rem] border border-[#2a2926] bg-[#12110f] px-5 py-5 text-white shadow-[0_20px_60px_rgba(18,17,15,0.16)] sm:px-8 sm:py-6">
          <div className="absolute right-5 top-5 sm:right-8 sm:top-6">
            <div className="relative">
              <button
                type="button"
                aria-expanded={isMenuOpen}
                aria-label="Abrir menú"
                onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 text-white transition duration-300 hover:scale-[1.04] hover:bg-[#48c7d2]/16"
              >
                <span className="flex flex-col gap-1">
                  <span
                    className={`block h-0.5 w-4 rounded-full bg-current transition ${
                      isMenuOpen ? "translate-y-1.5 rotate-45" : ""
                    }`}
                  />
                  <span
                    className={`block h-0.5 w-4 rounded-full bg-current transition ${
                      isMenuOpen ? "opacity-0" : ""
                    }`}
                  />
                  <span
                    className={`block h-0.5 w-4 rounded-full bg-current transition ${
                      isMenuOpen ? "-translate-y-1.5 -rotate-45" : ""
                    }`}
                  />
                </span>
              </button>

              {isMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-20 flex min-w-[220px] flex-col gap-2 rounded-[1.5rem] border border-[#48c7d2]/30 bg-[#12110f] p-3 shadow-[0_18px_45px_rgba(18,17,15,0.24)]">
                  <Link
                    href="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16"
                  >
                    Cambiar de sede
                  </Link>
                  <form action={logout} className="flex">
                    <button
                      type="submit"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#48c7d2]/30 bg-[#48c7d2]/10 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:bg-[#48c7d2]/16"
                    >
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:items-start">
            <div className="space-y-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[#8fe3d5]">{branch.name}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#e5ecec] sm:text-4xl">
                  {company.name}
                </h1>
              </div>

              <p className="max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
                Elige la opción que deseas gestionar
              </p>

              <nav className="origin-left pr-14 max-[420px]:scale-[0.94] sm:pr-16 sm:scale-100">
                <div className="relative grid min-h-12 grid-cols-3 rounded-[1.45rem] border border-white/10 bg-[rgba(68,66,62,0.72)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-1 top-1 rounded-[1.05rem] bg-[#f1f1f1] shadow-[0_10px_24px_rgba(18,17,15,0.22)] transition-transform duration-300 ease-out"
                    style={{
                      width: "calc((100% - 0.5rem) / 3)",
                      transform: `translateX(calc(${activeIndex} * 100% + ${activeIndex} * 0.25rem))`,
                    }}
                  />

                  {navigation.map((item) => {
                    const isActive = item.key === currentSection;

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`relative z-10 inline-flex min-h-10 min-w-0 items-center justify-center rounded-[1rem] px-3 text-center text-sm transition duration-300 hover:scale-[1.04] sm:px-4 ${
                          isActive ? "font-semibold text-[#12110f]" : "font-medium text-white/68 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[74rem]">{children}</div>
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
      className={`rounded-[1.4rem] px-4 py-4 ${tone === "accent" ? productCardSurface : productCardSurfaceSoft}`}
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
      className={`rounded-[1.8rem] p-5 ${accent === "operational" ? productCardSurface : productCardSurfaceSoft}`}
    >
      <div className="flex h-full flex-col gap-5">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#2a7f86]">
            {accent === "operational" ? "Macro módulo" : "Repositorio"}
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
          Abrir módulo
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
    <section className={`rounded-[1.7rem] p-5 ${productCardSurface}`}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#12110f]">{title}</h2>
        <p className="text-sm leading-6 text-[#5e6770]">{subtitle}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className={`rounded-[1.2rem] px-4 py-4 ${productCardSurfaceSoft}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold tracking-[-0.02em] text-[#12110f]">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-[#5e6770]">{item.detail}</p>
              </div>
              {item.badge ? (
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
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

function OperationalActionsBlock({ qrCode }: { qrCode: BranchFormQrSummary | undefined }) {
  if (!qrCode) {
    return (
      <div className="rounded-[1.25rem] border border-dashed border-white/70 bg-white/55 px-4 py-5 text-sm leading-6 text-[#5e6770] backdrop-blur-xl">
        El QR administrativo de este módulo estará disponible en unos segundos si la sede acaba de ser creada.
      </div>
    );
  }

  const qrImagePath = `/api/qr/${encodeURIComponent(qrCode.token)}`;

  return (
    <div className="grid min-h-9 grid-cols-2 rounded-full border border-[#12110f]/12 bg-[#fbfbfb] p-1">
      <a
        href={qrImagePath}
        download={`quimly-${qrCode.formType}-${qrCode.token}.svg`}
        className="inline-flex min-h-7 w-full items-center justify-center rounded-full border-r border-[#12110f]/10 px-2.5 py-1.5 text-center text-[0.72rem] font-semibold text-[#12110f] transition duration-300 hover:scale-[1.04] hover:bg-[#f1f1f1] sm:text-xs"
      >
        Descargar QR
      </a>
      <button
        type="button"
        className="min-h-7 w-full rounded-full px-2.5 py-1.5 text-center text-[0.72rem] font-semibold text-[#12110f] transition duration-300 hover:scale-[1.04] hover:bg-[#f1f1f1] sm:text-xs"
      >
        Agregar registro
      </button>
    </div>
  );
}

function InlineCatalogManager({
  title,
  formLabel,
  branchId,
  companySlug,
  branchSlug,
  items,
  createStateAction,
  toggleAction,
  archiveAction,
  activeSummarySingular,
  activeSummaryPlural,
  inactiveSummarySingular,
  inactiveSummaryPlural,
}: {
  title: string;
  formLabel: string;
  branchId: string;
  companySlug: string;
  branchSlug: string;
  items: BranchCatalogItemSummary[];
  createStateAction: (
    state: AdminActionState | undefined,
    formData: FormData,
  ) => Promise<AdminActionState>;
  toggleAction: (formData: FormData) => AdminActionState | Promise<AdminActionState | void> | void;
  archiveAction: (formData: FormData) => AdminActionState | Promise<AdminActionState | void> | void;
  activeSummarySingular: string;
  activeSummaryPlural: string;
  inactiveSummarySingular: string;
  inactiveSummaryPlural: string;
}) {
  const [itemPendingArchive, setItemPendingArchive] = useState<BranchCatalogItemSummary | null>(null);
  const [createState, createFormAction] = useActionState<AdminActionState | undefined, FormData>(createStateAction, undefined);
  const sortedItems = [...items].sort((leftItem, rightItem) => {
    if (leftItem.isActive !== rightItem.isActive) {
      return leftItem.isActive ? -1 : 1;
    }

    return leftItem.name.localeCompare(rightItem.name, "es");
  });
  const activeCount = items.filter((item) => item.isActive).length;
  const inactiveCount = items.length - activeCount;
  const activeSummary = `${activeCount} ${
    activeCount === 1 ? activeSummarySingular : activeSummaryPlural
  }`;
  const inactiveSummary =
    inactiveCount > 0
      ? `${inactiveCount} ${inactiveCount === 1 ? inactiveSummarySingular : inactiveSummaryPlural}`
      : null;

  return (
    <details className="group rounded-[1.25rem] border border-white/70 bg-white/55 px-4 py-4 backdrop-blur-xl">
      <summary className="cursor-pointer list-none transition duration-300 hover:scale-[1.01] hover:text-[#1f8f99]">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
          <span className="inline-flex h-6 w-6 items-center justify-center self-center text-[#12110f]/70 transition-transform duration-200 group-open:rotate-180">
            <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3.5 w-3.5">
              <path
                d="M2.25 4.5 6 8.25 9.75 4.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <div className="space-y-1">
            <p className="text-xs font-semibold leading-5 text-[#5e6770]">
              {activeSummary}
              {inactiveSummary ? ` - ${inactiveSummary}` : ""}
            </p>
            <span className="block text-sm font-semibold text-[#12110f]">{`Configurar ${title.toLowerCase()}`}</span>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-3">
        <div className="grid gap-2">
          {items.length ? (
            sortedItems.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between ${
                  item.isActive
                    ? "border-emerald-100 bg-emerald-50/75"
                    : "border-rose-100 bg-rose-50/80"
                }`}
              >
                <div>
                  <p className="text-sm text-[#12110f]">{item.name}</p>
                  <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#7a838a]">
                    {item.isActive ? "Activo" : "Inactivo"}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <form action={toggleAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="branchId" value={branchId} />
                    <input type="hidden" name="companySlug" value={companySlug} />
                    <input type="hidden" name="branchSlug" value={branchSlug} />
                    {item.isActive ? null : <input type="hidden" name="nextIsActive" value="on" />}
                    <button
                      type="submit"
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#12110f]/12 bg-[#fbfbfb] px-4 text-sm font-semibold text-[#12110f] transition duration-300 hover:scale-[1.04] hover:bg-[#f1f1f1]"
                    >
                      {item.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </form>

                  {item.status === "inactive" ? (
                    <button
                      type="button"
                      aria-label={`Archivar ${item.name}`}
                      onClick={() => setItemPendingArchive(item)}
                      className="inline-flex h-10 items-center justify-center text-[#8a2d1f] transition duration-300 hover:scale-[1.08] hover:text-[#6f2116]"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
                        <path
                          d="M9 3.75h6m-8.25 3h10.5m-9.75 0 .75 11.25a1.5 1.5 0 0 0 1.5 1.4h4.5a1.5 1.5 0 0 0 1.5-1.4l.75-11.25m-6 2.25v6.75m3-6.75v6.75"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-white/70 bg-white/55 px-4 py-4 text-sm leading-6 text-[#5e6770] backdrop-blur-xl">
              Todavía no hay elementos registrados.
            </p>
          )}
        </div>

        <form action={createFormAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="branchSlug" value={branchSlug} />
          <input
            name="name"
            placeholder="Agregar opción"
            className="min-h-11 rounded-2xl border border-[#2a7f86]/35 bg-white/80 px-4 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#12110f] px-5 text-sm font-semibold text-white transition duration-300 hover:scale-[1.04] hover:bg-[#2b2824]"
          >
            Agregar
          </button>

          {createState?.error ? (
            <p className="sm:col-span-2 rounded-2xl border border-[#c66b5c]/22 bg-[#fff1ee] px-4 py-3 text-sm text-[#8a2d1f]">
              {createState.error}
            </p>
          ) : null}
        </form>
      </div>

      {typeof document !== "undefined" && itemPendingArchive
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 backdrop-blur-md">
              <div className="w-full max-w-md rounded-[1.7rem] border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(18,17,15,0.22)]">
                <div className="space-y-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f8dfda] text-[#8a2d1f]">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path
                        d="M9 3.75h6m-8.25 3h10.5m-9.75 0 .75 11.25a1.5 1.5 0 0 0 1.5 1.4h4.5a1.5 1.5 0 0 0 1.5-1.4l.75-11.25m-6 2.25v6.75m3-6.75v6.75"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f]">¿Eliminar opción?</h3>
                    <div className="space-y-3 text-sm leading-6 text-[#5e6770]">
                      <p>
                        • Si eliminas{" "}
                        <span className="font-semibold uppercase text-[#12110f]">
                          &quot;{itemPendingArchive.name}&quot;
                        </span>{" "}
                        del formulario <span className="font-semibold text-[#12110f]">&quot;{formLabel}&quot;</span>, ya no
                        se podrá restaurar.
                      </p>
                      <p>• Pero se mantendrá en los registros ya realizados.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setItemPendingArchive(null)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f]/12 px-5 text-sm font-semibold text-[#12110f] transition hover:bg-[#f3eee6]"
                  >
                    Cancelar
                  </button>
                  <form
                    action={async (formData) => {
                      setItemPendingArchive(null);
                      await archiveAction(formData);
                    }}
                  >
                    <input type="hidden" name="itemId" value={itemPendingArchive.id} />
                    <input type="hidden" name="branchId" value={branchId} />
                    <input type="hidden" name="companySlug" value={companySlug} />
                    <input type="hidden" name="branchSlug" value={branchSlug} />
                    <ArchiveConfirmButton />
                  </form>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </details>
  );
}

function ArchiveConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#8a2d1f] px-5 text-sm font-semibold text-white transition hover:bg-[#6f2116] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {pending ? "Eliminando..." : "Confirmar eliminación"}
    </button>
  );
}

function OperationalFlowCard({
  formType,
  qrCode,
  configuration,
}: {
  formType: OperationalFormType;
  qrCode: BranchFormQrSummary | undefined;
  configuration?: ReactNode;
}) {
  const label = operationalFormLabels[formType];
  const qrImagePath = qrCode ? `/api/qr/${encodeURIComponent(qrCode.token)}` : null;

  return (
    <article className={`rounded-[1.7rem] p-5 ${productCardSurface} border-[#2a7f86]/35`}>
      <div className="space-y-5">
        <div className="grid grid-cols-[1fr_auto] items-start gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2a7f86]">{label.title}</p>
            <p className="mt-2 text-sm leading-6 text-[#5e6770]">{label.description}</p>
            <div className="mt-4 max-w-md">
              <OperationalActionsBlock qrCode={qrCode} />
            </div>
          </div>

          {qrImagePath ? (
            <Image
              src={qrImagePath}
              alt={`QR administrativo para ${label.title}`}
              width={144}
              height={144}
              unoptimized
              className="h-24 w-24 p-1 sm:h-28 sm:w-28"
            />
          ) : null}
        </div>

        <div className="border-t border-black/8" />

        {configuration ? (
          configuration
        ) : (
          <div className="rounded-[1.25rem] border border-white/70 bg-white/55 px-4 py-4 text-sm font-medium text-[#5e6770] backdrop-blur-xl">
            Sin opciones configurables para el formulario
          </div>
        )}

      </div>
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
    <details className="rounded-[1.2rem] border border-dashed border-white/70 bg-white/55 px-4 py-3 backdrop-blur-xl">
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
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            >
              {Object.entries(sectionLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Título</label>
            <input
              name="title"
              defaultValue={document.title}
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Descripción</label>
            <input
              name="description"
              defaultValue={document.description ?? ""}
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">URL del PDF</label>
            <input
              name="fileUrl"
              defaultValue={document.fileUrl ?? ""}
              placeholder="https://..."
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
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
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Orden</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={document.sortOrder}
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#3f3831] backdrop-blur-xl">
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
    <div className={`rounded-[1.25rem] px-4 py-4 ${productCardSurfaceSoft}`}>
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
                ? "border-white/80 bg-white/80 text-[#66727a]"
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
    <details className={`rounded-[1.25rem] px-4 py-4 ${productCardSurfaceSoft}`}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-[#12110f]">Agregar documento</summary>

      <form action={createBranchDocumentAction} className="mt-4 grid gap-4">
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="companySlug" value={companySlug} />
        <input type="hidden" name="branchSlug" value={branchSlug} />
        <input type="hidden" name="sectionKey" value={sectionKey} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Título</label>
            <input
              name="title"
              placeholder="Nombre del PDF"
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Descripción</label>
            <input
              name="description"
              placeholder="Resumen breve"
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-medium text-[#12110f]">URL del PDF</label>
            <input
              name="fileUrl"
              placeholder="https://..."
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Orden</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={0}
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#12110f]">Vencimiento</label>
            <input
              name="expiresAt"
              type="date"
              className="min-h-11 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#2a7f86]/35"
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-[#3f3831] backdrop-blur-xl">
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
            Puedes subir el archivo o pegar una URL. Si subes archivo, Quimly publicará el PDF en Storage.
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
    <details className={`rounded-[1.7rem] p-5 ${productCardSurface}`}>
      <summary className="flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#12110f]">{label.title}</h3>
            {requiresExpiration ? (
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#1c6a71]">
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
          <div className="rounded-[1.25rem] border border-dashed border-white/70 bg-white/55 px-4 py-5 text-sm leading-7 text-[#5e6770] backdrop-blur-xl">
            Todavía no hay documentos cargados en esta sección.
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

function getComplianceFallbackItems(): BranchModuleItem[] {
  return [
    {
      title: "Manuales y Protocolos",
      detail: "Saneamiento + Quimicos, organizados para consulta rapida y trazable.",
    },
    {
      title: "Certificaciones de Planta",
      detail: "Fumigación y Tanques con control visual de fecha de vencimiento.",
      badge: "Vencimiento",
    },
    {
      title: "Trazabilidad de Insumos",
      detail: "Fichas técnicas de productos + hojas de seguridad indexadas por lote.",
    },
    {
      title: "Fichas del Personal",
      detail: "Curso de manipulación + exámenes médicos con semáforo de vencimiento.",
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
        <section className={`rounded-[1.8rem] p-5 ${productCardSurface}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2a7f86]">Resumen de sede</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
            Elige el frente que deseas gestionar
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5e6770]">
            Esta vista concentra solo el contexto esencial. La operación diaria y el cumplimiento documental viven en
            módulos separados para reducir scroll y hacer más clara la gestión.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <SummaryStat label="QR públicos" value={qrCodes.length} tone="accent" />
            <SummaryStat label="Documentos" value={documents.length} />
            <SummaryStat label="Vencen pronto" value={countDocumentsExpiring(documents)} />
          </div>
        </section>

        <section className={`rounded-[1.8rem] p-5 ${productCardSurfaceSoft}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2a7f86]">Cobertura actual</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryStat label="Equipos" value={refrigerationEquipment.length} />
            <SummaryStat label="Áreas" value={sanitationAreas.length} />
            <SummaryStat label="Secciones normativas" value={Object.keys(sectionLabels).length} />
            <SummaryStat label="Estado sede" value={branch.isActive ? "Activa" : "Inactiva"} />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <LandingModuleCard
          title="Control operativo"
          description="Gestiona QR públicos, formularios operativos y catálogos rápidos para uso diario en sede."
          href={`${basePath}/operacion`}
          accent="operational"
          metrics={[
            { label: "QR", value: qrCodes.length },
            { label: "Equipos", value: refrigerationEquipment.length },
            { label: "Áreas", value: sanitationAreas.length },
            { label: "Formularios", value: operationalFormTypes.length },
          ]}
        />
        <LandingModuleCard
          title="Cumplimiento normativo"
          description="Administra repositorio PDF, vencimientos y documentos por sección con una vista compacta."
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
  qrCodes,
  refrigerationEquipment,
  sanitationAreas,
}: BranchDetailViewProps) {
  const operationalCards = operationalFormTypes.map((formType) => {
    const qrCode = qrCodes.find((candidate) => candidate.formType === formType);

    let configuration: ReactNode | undefined;

    if (formType === "thermal_control") {
      configuration = (
        <InlineCatalogManager
          title="EQUIPOS DE REFRIGERACIÓN Y CONGELACIÓN"
          formLabel={operationalFormLabels[formType].title}
          branchId={branch.id}
          companySlug={company.slug}
          branchSlug={branch.slug}
          items={refrigerationEquipment}
          createStateAction={createBranchRefrigerationEquipmentStateAction}
          toggleAction={toggleBranchRefrigerationEquipmentAction}
          archiveAction={archiveBranchRefrigerationEquipmentAction}
          activeSummarySingular="equipo activo"
          activeSummaryPlural="equipos activos"
          inactiveSummarySingular="equipo inactivo"
          inactiveSummaryPlural="equipos inactivos"
        />
      );
    }

    if (formType === "area_sanitation") {
      configuration = (
        <InlineCatalogManager
          title="ÁREAS, EQUIPOS Y UTENSILIOS"
          formLabel={operationalFormLabels[formType].title}
          branchId={branch.id}
          companySlug={company.slug}
          branchSlug={branch.slug}
          items={sanitationAreas}
          createStateAction={createBranchSanitationAreaStateAction}
          toggleAction={toggleBranchSanitationAreaAction}
          archiveAction={archiveBranchSanitationAreaAction}
          activeSummarySingular="área activa"
          activeSummaryPlural="áreas activas"
          inactiveSummarySingular="área inactiva"
          inactiveSummaryPlural="áreas inactivas"
        />
      );
    }

    return (
      <OperationalFlowCard
        key={formType}
        formType={formType}
        qrCode={qrCode}
        configuration={configuration}
      />
    );
  });

  const leftColumnCards = operationalCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = operationalCards.filter((_, index) => index % 2 === 1);

  return (
    <BranchLayout company={company} branch={branch} currentSection="operational">
      <p className="mb-10 mt-3 max-w-[68rem] text-base leading-7 text-[#12110f] sm:mb-12 sm:mt-4 sm:text-lg sm:leading-8">
        Formularios obligatorios de control sanitario para esta sede. Acá puedes configurar sus opciones y descargar su código QR.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">{leftColumnCards}</div>
        <div className="space-y-4">{rightColumnCards}</div>
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
          subtitle="Repositorio documental organizado por sección, con vencimientos visibles y detalle editable solo cuando hace falta."
          items={moduleItems}
        />

        <section className={`rounded-[1.7rem] p-5 ${productCardSurface}`}>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a7f86]">Repositorio PDF</p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#12110f]">
                Gestion documental compacta
              </h2>
              <p className="text-sm leading-7 text-[#5e6770]">
                Cada sección se abre solo cuando necesitas trabajarla. Así evitamos tarjetas enormes repetidas y la
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
