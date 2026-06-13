"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  archiveBranchRefrigerationEquipmentStateAction,
  archiveBranchSanitationAreaStateAction,
  createBranchRefrigerationEquipmentStateAction,
  createBranchSanitationAreaStateAction,
  createBranchDocumentAction,
  deleteBranchDocumentAction,
  toggleBranchRefrigerationEquipmentStateAction,
  toggleBranchSanitationAreaStateAction,
  updateBranchDocumentAction,
  type AdminActionState,
} from "@/app/dashboard/actions";
import { logout } from "@/app/login/actions";
import { operationalFormLabels, operationalFormTypes } from "@/lib/operational-forms";
import { printableQrInstructions } from "@/lib/qr/printable";
import type {
  BranchCatalogItemSummary,
  BranchDocumentSectionKey,
  BranchDocumentSummary,
  BranchFormQrSummary,
  BranchRefrigerationEquipmentType,
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

const productCardSurface = "dashboard-card-surface";
const productCardSurfaceSoft = "dashboard-card-surface-soft";
const mutedActionCompact = "ui-muted-action ui-muted-action-compact";
const refrigerationEquipmentTypeLabels: Record<BranchRefrigerationEquipmentType, string> = {
  refrigerator: "Refrigerador",
  freezer: "Congelador",
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
                <p className="ui-item-title">{item.title}</p>
                <p className="ui-copy-compact mt-1">{item.detail}</p>
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

function OperationalActionsBlock() {
  return (
    <button
      type="button"
      className={mutedActionCompact}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
        <path
          d="M5 2.5h4l2 2V13a.5.5 0 0 1-.5.5h-5A.5.5 0 0 1 5 13V2.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
        <path d="M9 2.5v2h2" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
      Registrar control interno
    </button>
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
  toggleStateAction,
  archiveStateAction,
  activeSummarySingular,
  activeSummaryPlural,
  inactiveSummarySingular,
  inactiveSummaryPlural,
  showRefrigerationEquipmentType = false,
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
  toggleStateAction: (
    state: AdminActionState | undefined,
    formData: FormData,
  ) => Promise<AdminActionState>;
  archiveStateAction: (
    state: AdminActionState | undefined,
    formData: FormData,
  ) => Promise<AdminActionState>;
  activeSummarySingular: string;
  activeSummaryPlural: string;
  inactiveSummarySingular: string;
  inactiveSummaryPlural: string;
  showRefrigerationEquipmentType?: boolean;
}) {
  const [itemPendingArchive, setItemPendingArchive] = useState<BranchCatalogItemSummary | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const [createState, createFormAction] = useActionState<AdminActionState | undefined, FormData>(createStateAction, undefined);
  const [toggleState, toggleFormAction] = useActionState<AdminActionState | undefined, FormData>(
    toggleStateAction,
    undefined,
  );
  const [archiveState, archiveFormAction] = useActionState<AdminActionState | undefined, FormData>(
    archiveStateAction,
    undefined,
  );
  const sortedItems = [...items].sort((leftItem, rightItem) => {
    if (leftItem.isActive !== rightItem.isActive) {
      return leftItem.isActive ? -1 : 1;
    }

    return leftItem.name.localeCompare(rightItem.name, "es");
  });
  const activeCount = items.filter((item) => item.isActive).length;
  const inactiveCount = items.length - activeCount;
  const getStatusLabel = (summary: string) => {
    const words = summary.trim().split(" ");
    return words[words.length - 1] ?? summary;
  };
  const activeSummary = `${activeCount} ${getStatusLabel(
    activeCount === 1 ? activeSummarySingular : activeSummaryPlural,
  )}`;
  const inactiveSummary =
    inactiveCount > 0
      ? `${inactiveCount} ${getStatusLabel(inactiveCount === 1 ? inactiveSummarySingular : inactiveSummaryPlural)}`
      : null;
  const isEquipmentManager = showRefrigerationEquipmentType;
  const creationHeading = isEquipmentManager ? "Registrar nuevo equipo" : "Registrar nuevo elemento";
  const inputLabel = isEquipmentManager ? "Nombre del equipo" : "Nombre";
  const inputPlaceholder = isEquipmentManager
    ? "Ej. Nevera de carnes"
    : formLabel === "LIMPIEZA Y DESINFECCIÓN"
      ? "Ej. Trampa de grasa"
      : "Agregar opción";
  const creationButtonLabel = isEquipmentManager ? "+ Agregar equipo" : "+ Agregar elemento";

  useEffect(() => {
    if (!createState?.success) {
      return;
    }

    const successMessage = createState.success;
    const frameId = window.requestAnimationFrame(() => {
      createFormRef.current?.reset();
      setIsCreateModalOpen(false);
      setStatusToast(successMessage);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [createState]);

  useEffect(() => {
    if (!toggleState?.success) {
      return;
    }

    const successMessage = toggleState.success;
    const frameId = window.requestAnimationFrame(() => setStatusToast(successMessage));

    return () => window.cancelAnimationFrame(frameId);
  }, [toggleState]);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none transition duration-300 hover:text-[#1f8f99]">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center self-center text-[#12110f]/42 transition-transform duration-200 group-open:rotate-180">
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
          <div className="space-y-0.5">
            <span className="type-accordion-title block text-[#12110f]">{title}</span>
          <p className="text-xs font-medium leading-5 text-[#8a9298]">
            {activeSummary}
            {inactiveSummary ? ` · ${inactiveSummary}` : ""}
          </p>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-3.5">
        {toggleState?.error ? (
          <p className="ui-inline-alert ui-inline-alert-error">
            {toggleState.error}
          </p>
        ) : null}

        {archiveState?.error ? (
          <p className="ui-inline-alert ui-inline-alert-error">
            {archiveState.error}
          </p>
        ) : null}

        <div className="grid gap-2">
          {items.length ? (
            sortedItems.map((item) => {
              const statusFormId = `catalog-status-${item.id}`;

              return (
                <div
                  key={item.id}
                  className="catalog-item-surface flex items-center justify-between gap-3 rounded-[1rem] px-3.5 py-2.5 transition duration-300"
                >
                  <div className="min-w-0 flex-1">
                    <p className="type-metadata font-medium text-[#12110f]">{item.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#7f878d]">
                      {showRefrigerationEquipmentType && item.equipmentType ? (
                        <span>{refrigerationEquipmentTypeLabels[item.equipmentType]}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <form id={statusFormId} action={toggleFormAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="branchId" value={branchId} />
                      <input type="hidden" name="companySlug" value={companySlug} />
                      <input type="hidden" name="branchSlug" value={branchSlug} />
                      <input type="hidden" name="nextIsActive" value={item.isActive ? "on" : "off"} />
                      <CatalogItemStatusSelect
                        isActive={item.isActive}
                        formId={statusFormId}
                        onDelete={() => setItemPendingArchive(item)}
                      />
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="ui-empty-state px-1 py-1">
              Todavía no hay elementos registrados.
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="ui-list-action"
          >
            {creationButtonLabel}
          </button>
        </div>
      </div>

      {typeof document !== "undefined" && isCreateModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 backdrop-blur-md">
              <div className="ui-modal-surface w-full max-w-lg rounded-[1.7rem] p-6">
                <div className="space-y-2">
                  <h3 className="ui-modal-title">{creationHeading}</h3>
                  <p className="ui-modal-copy">
                    {isEquipmentManager ? (
                      <>
                        Este equipo estará disponible para el formulario de{" "}
                        <span className="font-semibold text-[#12110f]">control de temperaturas</span>.
                      </>
                    ) : (
                      <>
                        Este elemento estará disponible para el formulario de{" "}
                        <span className="font-semibold text-[#12110f]">limpieza y desinfección</span>.
                      </>
                    )}
                  </p>
                </div>

                <form ref={createFormRef} action={createFormAction} className="mt-4 grid gap-3">
                  <input type="hidden" name="branchId" value={branchId} />
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="branchSlug" value={branchSlug} />

                  <label className="ui-form-field">
                    <span className="ui-form-label">{inputLabel}</span>
                    <input
                      name="name"
                      required
                      placeholder={inputPlaceholder}
                      className="ui-form-control"
                    />
                  </label>

                  {showRefrigerationEquipmentType ? (
                    <div className="ui-form-field min-w-0">
                      <span className="ui-form-label">Tipo de equipo</span>
                      <EquipmentTypeSelect />
                    </div>
                  ) : null}

                  {createState?.error ? (
                    <p className="ui-inline-alert ui-inline-alert-error">
                      {createState.error}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="ui-pill-button-secondary ui-modal-action-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="ui-pill-button-primary ui-modal-action-primary"
                    >
                      Agregar
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && statusToast
        ? createPortal(
            <div className="fixed inset-0 z-[110] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/32 px-4 backdrop-blur-md">
              <div className="ui-modal-surface w-full max-w-sm rounded-[1.7rem] px-6 py-7 text-center">
                <div className="space-y-5">
                  <p className="text-sm font-semibold text-[#12110f]">{statusToast}</p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setStatusToast(null)}
                      className="ui-pill-button-secondary ui-modal-action-secondary min-w-28 bg-[#f1f1f1] border-[#12110f]/18 text-[#12110f] hover:bg-[#dcdcdc] hover:border-[#12110f]/34"
                    >
                      Aceptar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && itemPendingArchive
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 backdrop-blur-md">
              <div className="ui-modal-surface w-full max-w-md rounded-[1.7rem] p-6">
                <div className="space-y-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f2e4e0] text-[#7b5750]">
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
                    <h3 className="ui-modal-title">¿Eliminar opción?</h3>
                    <div className="ui-modal-copy space-y-3">
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
                    className="ui-pill-button-secondary ui-modal-action-secondary"
                  >
                    Cancelar
                  </button>
                  <form
                    action={async (formData) => {
                      setItemPendingArchive(null);
                      await archiveFormAction(formData);
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
      className="ui-pill-button-danger w-full sm:w-auto"
    >
      {pending ? "Eliminando..." : "Confirmar eliminación"}
    </button>
  );
}

function CatalogItemStatusSelect({
  isActive,
  formId,
  onDelete,
}: {
  isActive: boolean;
  formId: string;
  onDelete: () => void;
}) {
  const { pending } = useFormStatus();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const submitStatusChange = (nextIsActive: "on" | "off") => {
    const formElement = document.getElementById(formId);

    if (!(formElement instanceof HTMLFormElement)) {
      return;
    }

    const nextIsActiveInput = formElement.elements.namedItem("nextIsActive");

    if (!(nextIsActiveInput instanceof HTMLInputElement)) {
      return;
    }

    nextIsActiveInput.value = nextIsActive;
    formElement.requestSubmit();
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) {
      return;
    }

    const updateMenuPosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setMenuPosition({
        top: rect.bottom + 7,
        left: rect.right - 132,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Cambiar estado del elemento"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={`status-select-trigger ${
          isActive ? "status-select-trigger-active" : "status-select-trigger-inactive"
        }`}
      >
        <span>{isActive ? "Activo" : "Inactivo"}</span>
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5">
          <path
            d="M2.25 4.5 6 8.25 9.75 4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={menuRef}
          style={{ top: menuPosition.top, left: menuPosition.left }}
          className="status-select-menu"
        >
          <button
            type="button"
            disabled={pending}
            onClick={() => submitStatusChange("on")}
            className={`status-select-option ${
              isActive ? "status-select-option-active" : "status-select-option-active-hover"
            }`}
          >
            <span>{isActive ? "✓ Activo" : "Activar"}</span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submitStatusChange("off")}
            className={`status-select-option ${
              isActive ? "status-select-option-inactive-hover" : "status-select-option-inactive"
            }`}
          >
            <span>{!isActive ? "✓ Inactivo" : "Inactivar"}</span>
          </button>
          <div className="status-select-divider my-1" />
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
            className="status-select-option status-select-delete"
          >
            Eliminar
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function EquipmentTypeSelect() {
  const { pending } = useFormStatus();
  const options = Object.entries(refrigerationEquipmentTypeLabels) as Array<
    [BranchRefrigerationEquipmentType, string]
  >;
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<BranchRefrigerationEquipmentType | "">("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const selectedIndex = selectedType ? options.findIndex(([value]) => value === selectedType) : -1;
    const nextActiveIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const frameId = window.requestAnimationFrame(() => setActiveIndex(nextActiveIndex));

    return () => window.cancelAnimationFrame(frameId);
  }, [options, selectedType]);

  const openMenu = () => {
    setIsOpen(true);
    if (selectedType) {
      const selectedIndex = options.findIndex(([value]) => value === selectedType);
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else {
      setActiveIndex(0);
    }
  };

  const selectOption = (value: BranchRefrigerationEquipmentType) => {
    setSelectedType(value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(options[index][0]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="equipmentType" value={selectedType} required />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label="Seleccionar tipo de equipo"
        data-select-trigger="true"
        disabled={pending}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className="neutral-select-trigger"
      >
        <span className={selectedType ? "" : "neutral-select-trigger-placeholder"}>
          {selectedType ? refrigerationEquipmentTypeLabels[selectedType] : "Selecciona un tipo"}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            d="M2.25 4.5 6 8.25 9.75 4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {isOpen ? (
        <div id={listboxId} role="listbox" aria-label="Tipo de equipo" className="neutral-select-menu absolute inset-x-0 top-[calc(100%+0.35rem)]">
          {options.map(([value, label], index) => {
            const isSelected = selectedType === value;

            return (
              <button
                key={value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={activeIndex === index ? 0 : -1}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(value)}
                className={`neutral-select-option ${isSelected ? "neutral-select-option-selected" : ""}`}
              >
                <span>{isSelected ? `✓ ${label}` : label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function OperationalFlowCard({
  formType,
  configuration,
}: {
  formType: OperationalFormType;
  configuration?: ReactNode;
}) {
  const label = operationalFormLabels[formType];
  const instructions = printableQrInstructions[formType];

  return (
    <article className={`rounded-[1.45rem] p-5 ${productCardSurface} dashboard-card-surface-operational`}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold leading-5 tracking-[0.08em] text-[#2a7f86]">
            {label.title}
          </p>

          <div className="my-3">
            <OperationalActionsBlock />
          </div>

          <div className="type-metadata space-y-1 text-[#7f878d]">
            {instructions.map((instruction) => (
              <p key={instruction.label}>
                <span className="font-semibold text-[#606a72]">{instruction.label}</span>{" "}
                <span>{instruction.value}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="border-t border-[#12110f]/[0.22]" />

        {configuration ? (
          configuration
        ) : (
          <p className="ui-empty-state">
            No requiere configuración
          </p>
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
            <label className="ui-document-form-label block">Seccion</label>
            <select
              name="sectionKey"
              defaultValue={document.sectionKey}
              className="ui-document-form-control rounded-2xl"
            >
              {Object.entries(sectionLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="ui-document-form-label block">Título</label>
            <input
              name="title"
              defaultValue={document.title}
              className="ui-document-form-control rounded-2xl"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="ui-document-form-label block">Descripción</label>
            <input
              name="description"
              defaultValue={document.description ?? ""}
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <label className="ui-document-form-label block">URL del PDF</label>
            <input
              name="fileUrl"
              defaultValue={document.fileUrl ?? ""}
              placeholder="https://..."
              className="ui-document-form-control rounded-2xl"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="ui-document-form-label block">Vencimiento</label>
            <input
              name="expiresAt"
              type="date"
              defaultValue={document.expiresAt ?? ""}
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <label className="ui-document-form-label block">Orden</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={document.sortOrder}
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <label className="ui-checkbox-surface rounded-2xl">
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
          <label className="ui-document-form-label block">Reemplazar PDF</label>
          <input
            type="file"
            name="pdfFile"
            accept="application/pdf"
            className="ui-file-input"
          />
        </div>

        <button
          type="submit"
          className="ui-pill-button-primary ui-pill-button-primary-soft"
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
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddc7c1] bg-[#f7efed] px-5 py-2.5 text-sm font-semibold text-[#7b5750] transition hover:bg-[#f0e4e0]"
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
          <p className="ui-item-title text-[#161412]">{document.title}</p>
          <p className="ui-copy-compact mt-1">
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
            <label className="ui-document-form-label block">Título</label>
            <input
              name="title"
              placeholder="Nombre del PDF"
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <label className="ui-document-form-label block">Descripción</label>
            <input
              name="description"
              placeholder="Resumen breve"
              className="ui-document-form-control rounded-2xl"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <label className="ui-document-form-label block">URL del PDF</label>
            <input
              name="fileUrl"
              placeholder="https://..."
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <label className="ui-document-form-label block">Orden</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={0}
              className="ui-document-form-control rounded-2xl"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="ui-document-form-label block">Vencimiento</label>
            <input
              name="expiresAt"
              type="date"
              className="ui-document-form-control rounded-2xl"
            />
          </div>

          <label className="ui-checkbox-surface ui-checkbox-surface-soft rounded-2xl">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-[#c9c0b6]" />
            <span>Documento activo</span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="ui-document-form-label block">Subir PDF</label>
          <input
            type="file"
            name="pdfFile"
            accept="application/pdf"
            className="ui-file-input"
          />
          <p className="text-xs leading-6 text-[#7a838a]">
            Puedes subir el archivo o pegar una URL. Si subes archivo, Quimly publicará el PDF en Storage.
          </p>
        </div>

        <button
          type="submit"
          className="ui-pill-button-primary ui-pill-button-primary-soft w-fit"
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
          <div className="ui-empty-state-block">
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
          <h2 className="ui-card-title mt-3">
            Elige el frente que deseas gestionar
          </h2>
          <p className="ui-card-copy mt-3 max-w-2xl">
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
  const activeOperationalQrCodes = qrCodes.filter((qrCode) => qrCode.isActive);
  const allOperationalFormsPdfPath = `/dashboard/sedes/${encodeURIComponent(company.slug)}/${encodeURIComponent(branch.slug)}/operacion/formularios-operarios.pdf`;
  const operationalCards = operationalFormTypes.map((formType) => {
    let configuration: ReactNode | undefined;

    if (formType === "thermal_control") {
      configuration = (
        <InlineCatalogManager
          title="Administrar equipos"
          formLabel={operationalFormLabels[formType].title}
          branchId={branch.id}
          companySlug={company.slug}
          branchSlug={branch.slug}
          items={refrigerationEquipment}
          createStateAction={createBranchRefrigerationEquipmentStateAction}
          toggleStateAction={toggleBranchRefrigerationEquipmentStateAction}
          archiveStateAction={archiveBranchRefrigerationEquipmentStateAction}
          activeSummarySingular="equipo activo"
          activeSummaryPlural="equipos activos"
          inactiveSummarySingular="equipo inactivo"
          inactiveSummaryPlural="equipos inactivos"
          showRefrigerationEquipmentType
        />
      );
    }

    if (formType === "area_sanitation") {
      configuration = (
        <InlineCatalogManager
          title="Administrar elementos"
          formLabel={operationalFormLabels[formType].title}
          branchId={branch.id}
          companySlug={company.slug}
          branchSlug={branch.slug}
          items={sanitationAreas}
          createStateAction={createBranchSanitationAreaStateAction}
          toggleStateAction={toggleBranchSanitationAreaStateAction}
          archiveStateAction={archiveBranchSanitationAreaStateAction}
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
        configuration={configuration}
      />
    );
  });

  const leftColumnCards = operationalCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = operationalCards.filter((_, index) => index % 2 === 1);

  return (
    <BranchLayout company={company} branch={branch} currentSection="operational">
      <div className="operational-toolbar mt-3 mb-10 flex w-full items-center justify-between gap-3 sm:mt-4 sm:mb-12 sm:gap-4 lg:items-end">
        <p className="operational-toolbar-copy min-w-0">
          Formularios de control sanitario para esta sede.
          <br />
          Configura, registra y descarga los códigos QR desde aquí.
        </p>

        {activeOperationalQrCodes.length ? (
          <a
            href={allOperationalFormsPdfPath}
            className="ui-muted-action ui-muted-action-large operational-toolbar-action shrink-0"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0">
              <path
                d="M8 2.5v7m0 0 2.5-2.5M8 9.5 5.5 7M3 11.5h10"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.4"
              />
            </svg>
            <span className="operational-toolbar-action-label-short">QR</span>
            <span className="operational-toolbar-action-label-full">Descargar formularios QR operativos</span>
          </a>
        ) : (
          <span className="operational-toolbar-empty">
            No hay formularios activos para descargar
          </span>
        )}
      </div>

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
              <h2 className="ui-card-title">
                Gestion documental compacta
              </h2>
              <p className="ui-card-copy">
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
