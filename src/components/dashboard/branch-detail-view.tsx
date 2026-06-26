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
  toggleBranchRefrigerationEquipmentStateAction,
  toggleBranchSanitationAreaStateAction,
  type AdminActionState,
} from "@/app/dashboard/actions";
import { CompanyAdminDocumentsView } from "@/components/dashboard/company-admin-documents-view";
import { BranchReportsPanel } from "@/components/dashboard/branch-reports-panel";
import { OperationalRecordStatusDot } from "@/components/ui/operational-record-status-dot";
import { logout } from "@/app/login/actions";
import { createPublicFormPath, operationalFormLabels, operationalFormTypes } from "@/lib/operational-forms";
import type { OperationalRecordDateStatus } from "@/lib/operational-record-dates";
import { printableQrInstructions } from "@/lib/qr/printable";
import type { BranchReportPanelData } from "@/lib/branch-reports/types";
import type {
  BranchCatalogItemSummary,
  BranchChemicalProductSummary,
  BranchDocumentSummary,
  BranchFormQrSummary,
  BranchRefrigerationEquipmentType,
  BranchSanitaryDocumentCategoryStatusMap,
  BranchSanitaryDocumentFileSummary,
  BranchStaffMemberSummary,
  CompanySummary,
  OperationalFormType,
} from "@/types/auth";

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
  documents: BranchDocumentSummary[];
  qrCodes: BranchFormQrSummary[];
  operationalRecordDateStatuses: Partial<Record<OperationalFormType, OperationalRecordDateStatus>>;
  refrigerationEquipment: BranchCatalogItemSummary[];
  sanitationAreas: BranchCatalogItemSummary[];
  chemicalProducts: BranchChemicalProductSummary[];
  staffMembers: BranchStaffMemberSummary[];
  sanitaryDocumentFiles: BranchSanitaryDocumentFileSummary[];
  sanitaryDocumentCategoryStatuses: BranchSanitaryDocumentCategoryStatusMap;
};

type BranchSectionKey = "home" | "operational" | "compliance";

const branchHeaderDescriptions: Record<BranchSectionKey, string | null> = {
  home: "Exporta los reportes periódicos y unifica la documentación en un PDF para descargar.",
  operational: "Diligencia los formatos normativos y gestiona los puntos de acceso QR para la operación.",
  compliance: "Monitorea vencimientos, visualiza y gestiona los archivos normativos del establecimiento.",
};
const DOCUMENTS_HOME_EVENT = "quimly:documents-home";

const productCardSurface = "dashboard-card-surface";
const mutedActionCompact = "ui-muted-action ui-muted-action-compact";
const refrigerationEquipmentTypeLabels: Record<BranchRefrigerationEquipmentType, string> = {
  refrigerator: "Refrigerador",
  freezer: "Congelador",
};

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
    { key: "home", href: basePath, label: "Reportes" },
    { key: "operational", href: `${basePath}/operacion`, label: "Formularios" },
    { key: "compliance", href: `${basePath}/cumplimiento`, label: "Documentos" },
  ] as const;
  const headerDescription = branchHeaderDescriptions[currentSection];

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
            <div className="w-full space-y-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[#8fe3d5]">{branch.name}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#e5ecec] sm:text-4xl">
                  {company.name}
                </h1>
              </div>

              <nav className="w-full max-w-xl">
                <div className="relative grid h-12 w-full grid-cols-3 rounded-[1.45rem] border border-white/10 bg-[rgba(68,66,62,0.72)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-1 top-1 rounded-[1.05rem] bg-[#f1f1f1] shadow-[0_10px_24px_rgba(18,17,15,0.22)] transition-transform duration-300 ease-out"
                    style={{
                      width: "calc((100% - 0.5rem) / 3)",
                      transform: `translateX(calc(${activeIndex} * 100%))`,
                    }}
                  />

                  {navigation.map((item) => {
                    const isActive = item.key === currentSection;

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => {
                          if (item.key === "compliance" && currentSection === "compliance") {
                            window.dispatchEvent(new Event(DOCUMENTS_HOME_EVENT));
                          }
                        }}
                        className={`relative z-10 inline-flex h-10 min-w-0 items-center justify-center rounded-[1rem] px-2 text-center text-sm transition duration-300 hover:scale-[1.04] sm:px-4 ${
                          isActive ? "font-semibold text-[#12110f]" : "font-medium text-white/68 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>

              <p
                className={`max-w-2xl text-sm leading-6 text-white/72 sm:text-base sm:leading-7 ${
                  headerDescription ? "" : "invisible"
                }`}
              >
                {headerDescription}
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[74rem]">{children}</div>
      </div>
    </main>
  );
}

function OperationalActionsBlock({ formPath }: { formPath?: string }) {
  if (!formPath) {
    return (
      <button
        type="button"
        disabled
        className={`${mutedActionCompact} cursor-not-allowed opacity-55`}
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

  return (
    <Link
      href={formPath}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
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
    </Link>
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
  const listClassName = [
    "grid gap-2",
    sortedItems.length > 4 ? "catalog-scroll-list" : null,
  ]
    .filter(Boolean)
    .join(" ");

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

        <div className={listClassName}>
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
  formPath,
  recordDateStatus,
}: {
  formType: OperationalFormType;
  configuration?: ReactNode;
  formPath?: string;
  recordDateStatus?: OperationalRecordDateStatus;
}) {
  const label = operationalFormLabels[formType];
  const instructions = printableQrInstructions[formType];

  return (
    <article className={`relative rounded-[1.45rem] p-5 ${productCardSurface} dashboard-card-surface-operational`}>
      {recordDateStatus ? (
        <span className="absolute right-4 top-4">
          <OperationalRecordStatusDot status={recordDateStatus} />
        </span>
      ) : null}
      <div className="space-y-4">
        <div>
          <p className="pr-8 text-sm font-semibold leading-5 tracking-[0.08em] text-[#2a7f86]">
            {label.title}
          </p>

          <div className="my-3">
            <OperationalActionsBlock formPath={formPath} />
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

export function BranchLandingView({
  company,
  branch,
  reportPanelData,
}: Pick<BranchDetailViewProps, "company" | "branch"> & { reportPanelData: BranchReportPanelData }) {
  return (
    <BranchLayout company={company} branch={branch} currentSection="home">
      <section aria-label="Reportes de la sede" className="min-h-[32rem]">
        <BranchReportsPanel companySlug={company.slug} branchSlug={branch.slug} data={reportPanelData} />
      </section>
    </BranchLayout>
  );
}

export function BranchOperationalView({
  company,
  branch,
  qrCodes,
  refrigerationEquipment,
  sanitationAreas,
  operationalRecordDateStatuses,
}: BranchDetailViewProps) {
  const activeOperationalQrCodes = qrCodes.filter((qrCode) => qrCode.isActive);
  const allOperationalFormsPdfPath = `/dashboard/sedes/${encodeURIComponent(company.slug)}/${encodeURIComponent(branch.slug)}/operacion/formularios-operarios.pdf`;
  const operationalCards = operationalFormTypes.map((formType) => {
    let configuration: ReactNode | undefined;
    const activeQrCode = activeOperationalQrCodes.find((qrCode) => qrCode.formType === formType);
    const formPath = activeQrCode ? `${createPublicFormPath(activeQrCode.token)}?source=dashboard&admin=1` : undefined;

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
        formPath={formPath}
        recordDateStatus={operationalRecordDateStatuses[formType]}
        configuration={configuration}
      />
    );
  });

  const leftColumnCards = operationalCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = operationalCards.filter((_, index) => index % 2 === 1);

  return (
    <BranchLayout company={company} branch={branch} currentSection="operational">
      <div className="operational-toolbar mt-3 mb-10 flex w-full items-center justify-center gap-3 sm:mt-4 sm:mb-12 sm:gap-4 lg:items-end">
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
  chemicalProducts,
  staffMembers,
  sanitaryDocumentFiles,
  sanitaryDocumentCategoryStatuses,
}: BranchDetailViewProps) {
  return (
    <BranchLayout company={company} branch={branch} currentSection="compliance">
      <CompanyAdminDocumentsView
        branchId={branch.id}
        companySlug={company.slug}
        branchSlug={branch.slug}
        initialChemicalProducts={chemicalProducts}
        initialStaffMembers={staffMembers}
        initialSanitaryDocumentFiles={sanitaryDocumentFiles}
        initialSanitaryDocumentCategoryStatuses={sanitaryDocumentCategoryStatuses}
      />
    </BranchLayout>
  );
}
