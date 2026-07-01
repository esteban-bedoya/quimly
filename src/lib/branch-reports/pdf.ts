import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { formatCompactDateTimeForDisplay, formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/branch-reports/dates";
import type {
  BranchReportDocumentBundle,
  BranchReportDocumentEntry,
  OperationalReportRecord,
  OperationalReportSection,
} from "@/lib/branch-reports/types";

type PdfTextBuilder = {
  document: PDFDocument;
  regularFont: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
  footerDrawnPages: Set<PDFPage>;
};

export type PdfFileAttachment = {
  entry: BranchReportDocumentEntry;
  bytes: Uint8Array;
};

export type PdfDocumentBundleWithFiles = Omit<BranchReportDocumentBundle, "entries" | "groups"> & {
  entries: PdfFileAttachment[];
  groups?: Array<{
    title: string;
    entries: PdfFileAttachment[];
  }>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 52;
const TEXT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const TEXT_COLOR = rgb(0, 0, 0);
const METADATA_LABEL_COLOR = rgb(0.28, 0.31, 0.34);
const RECORD_TITLE_COLOR = rgb(0.165, 0.498, 0.525);
const FOOTER_TEXT_COLOR = rgb(0.55, 0.58, 0.61);
const DIVIDER_COLOR = rgb(0.86, 0.88, 0.9);
const FOOTER_TEXT = "Powered by Quimly";
const PRESERVED_ACRONYMS = ["ACU"] as const;
const INDEX_DETAIL_WIDTH = 180;
const INDEX_COLUMN_GAP = 18;
const INDEX_TITLE_WIDTH = TEXT_WIDTH - INDEX_DETAIL_WIDTH - INDEX_COLUMN_GAP;
const HISTORY_DETAIL_INDENT = 18;
const RECORD_FIELD_INDENT = 10;
const RECORD_FIELD_LABEL_WIDTH = 132;
const RECORD_FIELD_COLUMN_GAP = 16;
const RECORD_FIELD_WIDTH = TEXT_WIDTH - RECORD_FIELD_INDENT;
const RECORD_FIELD_VALUE_WIDTH = RECORD_FIELD_WIDTH - RECORD_FIELD_LABEL_WIDTH - RECORD_FIELD_COLUMN_GAP;
const DIVIDER_SPACING = {
  defaultBefore: 14,
  defaultAfter: 28,
  coverDescriptionBefore: 8,
  coverDescriptionAfter: 24,
  coverMetadataBefore: 18,
  coverMetadataAfter: 32,
} as const;
const PDF_TYPE = {
  coverTitle: { size: 28, lineHeight: 34 },
  coverDescription: { size: 11.5, lineHeight: 17 },
  pageTitle: { size: 20, lineHeight: 26 },
  separatorTitle: { size: 23, lineHeight: 30 },
  metadataLabel: { size: 8, lineHeight: 11 },
  metadataValue: { size: 10.5 },
  indexTitle: { size: 10.5, lineHeight: 15 },
  indexDetail: { size: 9 },
  body: { size: 11, lineHeight: 16 },
  recordTitle: { size: 11, lineHeight: 15 },
  recordDate: { size: 9, lineHeight: 12 },
  recordField: { size: 9.5, lineHeight: 14 },
  detail: { size: 10, lineHeight: 14 },
  footer: { size: 8 },
} as const;

function normalizePdfText(value: string) {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const cleanText = normalizePdfText(text);

  if (!cleanText) {
    return [""];
  }

  const lines: string[] = [];
  const words = cleanText.split(" ");
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

async function createTextBuilder() {
  const document = await PDFDocument.create();
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  return {
    document,
    regularFont,
    boldFont,
    page,
    y: PAGE_HEIGHT - PAGE_MARGIN,
    footerDrawnPages: new Set<PDFPage>(),
  } satisfies PdfTextBuilder;
}

function addPage(builder: PdfTextBuilder) {
  drawFooter(builder);
  builder.page = builder.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  builder.y = PAGE_HEIGHT - PAGE_MARGIN;
}

function ensureSpace(builder: PdfTextBuilder, height: number) {
  if (builder.y - height < PAGE_MARGIN) {
    addPage(builder);
  }
}

function drawText(
  builder: PdfTextBuilder,
  text: string,
  {
    size = 10,
    font = "regular",
    color = TEXT_COLOR,
    lineHeight = size * 1.45,
    before = 0,
    after = 0,
    x = PAGE_MARGIN,
    width = TEXT_WIDTH,
  }: {
    size?: number;
    font?: "regular" | "bold";
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
    before?: number;
    after?: number;
    x?: number;
    width?: number;
  } = {},
) {
  const selectedFont = font === "bold" ? builder.boldFont : builder.regularFont;
  const lines = wrapText(text, selectedFont, size, width);
  const blockHeight = before + lines.length * lineHeight + after;

  ensureSpace(builder, blockHeight);
  builder.y -= before;

  for (const line of lines) {
    builder.page.drawText(line, {
      x,
      y: builder.y,
      size,
      font: selectedFont,
      color,
    });
    builder.y -= lineHeight;
  }

  builder.y -= after;
}

function drawDivider(
  builder: PdfTextBuilder,
  before: number = DIVIDER_SPACING.defaultBefore,
  after: number = DIVIDER_SPACING.defaultAfter,
) {
  ensureSpace(builder, before + after + 1);
  builder.y -= before;
  builder.page.drawLine({
    start: { x: PAGE_MARGIN, y: builder.y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: builder.y },
    thickness: 1,
    color: DIVIDER_COLOR,
  });
  builder.y -= after;
}

function drawFooter(builder: PdfTextBuilder) {
  if (builder.footerDrawnPages.has(builder.page)) {
    return;
  }

  const size = PDF_TYPE.footer.size;
  const textWidth = builder.regularFont.widthOfTextAtSize(FOOTER_TEXT, size);

  builder.page.drawText(FOOTER_TEXT, {
    x: PAGE_WIDTH - PAGE_MARGIN - textWidth,
    y: 26,
    size,
    font: builder.regularFont,
    color: FOOTER_TEXT_COLOR,
  });
  builder.footerDrawnPages.add(builder.page);
}

function drawMetadataItem(builder: PdfTextBuilder, label: string, value: string) {
  drawText(builder, label.toLocaleUpperCase("es-CO"), {
    size: PDF_TYPE.metadataLabel.size,
    color: METADATA_LABEL_COLOR,
    lineHeight: PDF_TYPE.metadataLabel.lineHeight,
  });
  drawText(builder, value, { size: PDF_TYPE.metadataValue.size, after: 8 });
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatSentenceTitle(title: string) {
  const lowerTitle = normalizePdfText(title).toLocaleLowerCase("es-CO");
  const [firstCharacter = "", ...restCharacters] = Array.from(lowerTitle);

  return PRESERVED_ACRONYMS.reduce(
    (formattedTitle, acronym) => formattedTitle.replaceAll(`(${acronym.toLocaleLowerCase("es-CO")})`, `(${acronym})`),
    `${firstCharacter.toLocaleUpperCase("es-CO")}${restCharacters.join("")}`,
  );
}

function drawOverviewIndexTitle(builder: PdfTextBuilder, title: string, subtitle: string) {
  drawText(builder, title, {
    size: PDF_TYPE.pageTitle.size,
    font: "bold",
    lineHeight: PDF_TYPE.pageTitle.lineHeight,
    after: 8,
  });
  drawText(builder, subtitle, {
    size: PDF_TYPE.body.size,
    lineHeight: PDF_TYPE.body.lineHeight,
    after: 8,
  });
}

function drawOverviewIndex(
  builder: PdfTextBuilder,
  {
    title,
    subtitle,
    items,
  }: {
    title: string;
    subtitle: string;
    items: Array<{ title: string; detail: string }>;
  },
) {
  drawOverviewIndexTitle(builder, title, subtitle);

  items.forEach((item, index) => {
    const titleSize = PDF_TYPE.indexTitle.size;
    const detailSize = PDF_TYPE.indexDetail.size;
    const lineHeight = PDF_TYPE.indexTitle.lineHeight;
    const before = 12;
    const after = 8;
    const titleLines = wrapText(`${index + 1}. ${formatSentenceTitle(item.title)}`, builder.regularFont, titleSize, INDEX_TITLE_WIDTH);
    const detailLines = wrapText(item.detail, builder.regularFont, detailSize, INDEX_DETAIL_WIDTH);
    const rowLineCount = Math.max(titleLines.length, detailLines.length);
    const rowHeight = before + rowLineCount * lineHeight + after;

    ensureSpace(builder, rowHeight);
    builder.y -= before;

    titleLines.forEach((line, lineIndex) => {
      builder.page.drawText(line, {
        x: PAGE_MARGIN,
        y: builder.y - lineIndex * lineHeight,
        size: titleSize,
        font: builder.regularFont,
        color: TEXT_COLOR,
      });
    });

    detailLines.forEach((line, lineIndex) => {
      const lineWidth = builder.regularFont.widthOfTextAtSize(line, detailSize);
      builder.page.drawText(line, {
        x: PAGE_WIDTH - PAGE_MARGIN - lineWidth,
        y: builder.y - lineIndex * lineHeight,
        size: detailSize,
        font: builder.regularFont,
        color: TEXT_COLOR,
      });
    });

    builder.y -= rowLineCount * lineHeight + after;
  });
}

function drawReportOverviewPage(builder: PdfTextBuilder, {
  title,
  description,
  companyName,
  branchName,
  generatedAt,
  metadata,
  index,
}: {
  title: string;
  description: string;
  companyName: string;
  branchName: string;
  generatedAt: string;
  metadata: Array<{ label: string; value: string }>;
  index: {
    title: string;
    subtitle: string;
    items: Array<{ title: string; detail: string }>;
  };
}) {
  builder.y = PAGE_HEIGHT - 76;
  drawText(builder, title, {
    size: PDF_TYPE.coverTitle.size,
    font: "bold",
    lineHeight: PDF_TYPE.coverTitle.lineHeight,
    after: 8,
  });
  drawText(builder, description, {
    size: PDF_TYPE.coverDescription.size,
    lineHeight: PDF_TYPE.coverDescription.lineHeight,
    after: 10,
  });
  drawDivider(builder, DIVIDER_SPACING.coverDescriptionBefore, DIVIDER_SPACING.coverDescriptionAfter);
  drawMetadataItem(builder, "Empresa", companyName);
  drawMetadataItem(builder, "Sede", branchName);
  drawMetadataItem(builder, "Fecha de generación", formatDateTimeForDisplay(generatedAt));
  metadata.forEach((item) => drawMetadataItem(builder, item.label, item.value));
  drawDivider(builder, DIVIDER_SPACING.coverMetadataBefore, DIVIDER_SPACING.coverMetadataAfter);
  drawOverviewIndex(builder, index);
}

function drawSimplePageTitle(builder: PdfTextBuilder, title: string, subtitle?: string) {
  drawText(builder, title, {
    size: PDF_TYPE.pageTitle.size,
    lineHeight: PDF_TYPE.pageTitle.lineHeight,
    after: 8,
  });

  if (subtitle) {
    drawText(builder, subtitle, {
      size: PDF_TYPE.body.size,
      lineHeight: PDF_TYPE.body.lineHeight,
      after: 8,
    });
  }

  drawDivider(builder);
}

function getOperationalRecordTime(value: string) {
  const time = Date.parse(value);

  return Number.isNaN(time) ? 0 : time;
}

function sortOperationalRecordsNewestFirst(records: OperationalReportRecord[]) {
  return [...records].sort((left, right) => {
    const recordedAtDelta = getOperationalRecordTime(right.recordedAt) - getOperationalRecordTime(left.recordedAt);

    if (recordedAtDelta !== 0) {
      return recordedAtDelta;
    }

    const createdAtDelta = getOperationalRecordTime(right.createdAt) - getOperationalRecordTime(left.createdAt);

    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

function normalizeRecordFieldLabel(label: string) {
  const normalizedLabel = normalizePdfText(label);
  const normalizedKey = normalizedLabel.toLocaleLowerCase("es-CO");

  if (normalizedKey === "fecha y hora") {
    return null;
  }

  if (normalizedKey === "responsable") {
    return "Ejecutor";
  }

  return normalizedLabel;
}

function getRecordFields(fields: Array<{ label: string; value: string }>) {
  return fields
    .map((field) => ({
      label: normalizeRecordFieldLabel(field.label),
      value: normalizePdfText(field.value),
    }))
    .filter((field): field is { label: string; value: string } => Boolean(field.label) && Boolean(field.value));
}

function drawTwoColumnFields(builder: PdfTextBuilder, fields: Array<{ label: string; value: string }>, after = 0) {
  const size = PDF_TYPE.recordField.size;
  const lineHeight = PDF_TYPE.recordField.lineHeight;
  const x = PAGE_MARGIN + RECORD_FIELD_INDENT;
  const valueX = x + RECORD_FIELD_LABEL_WIDTH + RECORD_FIELD_COLUMN_GAP;

  for (const field of fields) {
    const labelLines = wrapText(field.label, builder.regularFont, size, RECORD_FIELD_LABEL_WIDTH);
    const valueLines = wrapText(field.value, builder.regularFont, size, RECORD_FIELD_VALUE_WIDTH);
    const rowLineCount = Math.max(labelLines.length, valueLines.length);
    const rowHeight = rowLineCount * lineHeight;

    ensureSpace(builder, rowHeight);

    labelLines.forEach((line, lineIndex) => {
      builder.page.drawText(line, {
        x,
        y: builder.y - lineIndex * lineHeight,
        size,
        font: builder.regularFont,
        color: TEXT_COLOR,
      });
    });

    valueLines.forEach((line, lineIndex) => {
      builder.page.drawText(line, {
        x: valueX,
        y: builder.y - lineIndex * lineHeight,
        size,
        font: builder.regularFont,
        color: TEXT_COLOR,
      });
    });

    builder.y -= rowHeight;
  }

  builder.y -= after;
}

function drawRecordSignature(builder: PdfTextBuilder, record: OperationalReportRecord) {
  const reportedByValue = normalizePdfText(record.reportedBy || "No registrado");
  const hasAdminSuffix = /\s*\(admin\)$/i.test(reportedByValue);
  const reportedByName = reportedByValue.replace(/\s*\(admin\)$/i, "").trim() || "No registrado";
  const reportedBy = `${reportedByName.toLocaleUpperCase("es-CO")}${hasAdminSuffix ? " (Admin)" : ""}`;

  drawText(builder, "Firma del registro", {
    size: PDF_TYPE.recordField.size,
    font: "bold",
    lineHeight: PDF_TYPE.recordField.lineHeight,
    after: 2,
    x: PAGE_MARGIN + RECORD_FIELD_INDENT,
    width: RECORD_FIELD_WIDTH,
  });
  drawTwoColumnFields(
    builder,
    [
      { label: "Responsable del reporte", value: reportedBy },
      { label: "Fecha del registro", value: formatCompactDateTimeForDisplay(record.createdAt) },
    ],
    10,
  );
}

function drawRecordBlock(builder: PdfTextBuilder, record: OperationalReportRecord) {
  ensureSpace(builder, 90);
  drawText(builder, `Acción ejecutada: ${formatCompactDateTimeForDisplay(record.recordedAt)}`, {
    size: PDF_TYPE.recordTitle.size,
    color: RECORD_TITLE_COLOR,
    lineHeight: PDF_TYPE.recordTitle.lineHeight,
    after: 4,
  });
  drawTwoColumnFields(builder, getRecordFields(record.fields), 6);
  drawRecordSignature(builder, record);
}

async function saveGeneratedPdf(builder: PdfTextBuilder) {
  drawFooter(builder);

  return Buffer.from(await builder.document.save());
}

export async function createOperationalFormsReportPdf({
  companyName,
  branchName,
  periodLabel,
  generatedAt,
  sections,
}: {
  companyName: string;
  branchName: string;
  periodLabel: string;
  generatedAt: string;
  sections: OperationalReportSection[];
}) {
  const builder = await createTextBuilder();

  drawReportOverviewPage(builder, {
    title: "Reporte de formularios",
    description: "Registros operativos incluidos en el periodo consultado.",
    companyName,
    branchName,
    generatedAt,
    metadata: [{ label: "Periodo consultado", value: periodLabel }],
    index: {
      title: "Índice",
      subtitle: "Formularios incluidos en este reporte.",
      items: sections.map((section) => ({
        title: section.title,
        detail: formatCount(section.records.length, "registro", "registros"),
      })),
    },
  });

  for (const section of sections) {
    addPage(builder);
    const sortedRecords = sortOperationalRecordsNewestFirst(section.records);
    drawSimplePageTitle(builder, formatSentenceTitle(section.title), `${formatCount(sortedRecords.length, "registro", "registros")} en el periodo.`);

    if (!sortedRecords.length) {
      drawText(builder, "No se encontraron registros para este formulario en el periodo seleccionado.", {
        size: PDF_TYPE.body.size,
      });
      continue;
    }

    sortedRecords.forEach((record) => {
      drawRecordBlock(builder, record);
    });
  }

  return saveGeneratedPdf(builder);
}

async function appendPdfBytes(target: PDFDocument, sourceBytes: Uint8Array) {
  const source = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: true,
  });
  const pages = await target.copyPages(source, source.getPageIndices());

  pages.forEach((page) => target.addPage(page));
}

function getBundleFileCount(bundle: Pick<PdfDocumentBundleWithFiles, "entries">) {
  return bundle.entries.length;
}

function getGroupedBundleOwnerLabel(bundle: Pick<PdfDocumentBundleWithFiles, "id">) {
  if (bundle.id === "staff_records") {
    return { singular: "colaborador", plural: "colaboradores" };
  }

  if (bundle.id === "chemical_products") {
    return { singular: "producto", plural: "productos" };
  }

  return null;
}

function formatBundleFileSummary(
  bundle: Pick<PdfDocumentBundleWithFiles, "id" | "entries" | "groups">,
  { includeIncluded = false }: { includeIncluded?: boolean } = {},
) {
  const fileCount = getBundleFileCount(bundle);
  const ownerLabel = getGroupedBundleOwnerLabel(bundle);

  if (ownerLabel && bundle.groups?.length) {
    return `${formatCount(fileCount, "archivo", "archivos")} de ${formatCount(
      bundle.groups.length,
      ownerLabel.singular,
      ownerLabel.plural,
    )}`;
  }

  if (includeIncluded) {
    return formatCount(fileCount, "archivo incluido", "archivos incluidos");
  }

  return formatCount(fileCount, "archivo", "archivos");
}

async function createGeneratedDocumentBase({
  title,
  description,
  companyName,
  branchName,
  generatedAt,
  metadata,
  indexSubtitle,
  bundles,
}: {
  title: string;
  description: string;
  companyName: string;
  branchName: string;
  generatedAt: string;
  metadata: Array<{ label: string; value: string }>;
  indexSubtitle: string;
  bundles: PdfDocumentBundleWithFiles[];
}) {
  const builder = await createTextBuilder();

  drawReportOverviewPage(builder, {
    title,
    description,
    companyName,
    branchName,
    generatedAt,
    metadata,
    index: {
      title: "Índice",
      subtitle: indexSubtitle,
      items: bundles.map((bundle) => ({
        title: bundle.title,
        detail: formatBundleFileSummary(bundle),
      })),
    },
  });

  return builder;
}

function addSeparatorPage(
  builder: PdfTextBuilder,
  title: string,
  subtitle?: string,
  details: string[] = [],
) {
  addPage(builder);
  builder.y = PAGE_HEIGHT - 180;
  drawText(builder, title, {
    size: PDF_TYPE.separatorTitle.size,
    lineHeight: PDF_TYPE.separatorTitle.lineHeight,
    after: 12,
  });

  if (subtitle) {
    drawText(builder, subtitle, {
      size: PDF_TYPE.body.size,
      lineHeight: PDF_TYPE.body.lineHeight,
      after: 16,
    });
  }

  details.forEach((detail) => {
    drawText(builder, detail, {
      size: PDF_TYPE.detail.size,
      lineHeight: PDF_TYPE.detail.lineHeight,
      after: 4,
    });
  });

  drawFooter(builder);
}

function drawDocumentHistoryList(builder: PdfTextBuilder, details: string[]) {
  const x = PAGE_MARGIN + HISTORY_DETAIL_INDENT;
  const width = TEXT_WIDTH - HISTORY_DETAIL_INDENT;

  builder.y -= 2;

  details.forEach((detail) => {
    drawText(builder, detail, {
      size: PDF_TYPE.detail.size,
      lineHeight: PDF_TYPE.detail.lineHeight,
      after: 4,
      x,
      width,
    });
  });
}

export async function createSanitaryDossierPdf({
  companyName,
  branchName,
  generatedAt,
  bundles,
}: {
  companyName: string;
  branchName: string;
  generatedAt: string;
  bundles: PdfDocumentBundleWithFiles[];
}) {
  const builder = await createGeneratedDocumentBase({
    title: "Documentos sanitarios",
    description: "Documentos sanitarios actuales incluidos en este reporte.",
    companyName,
    branchName,
    generatedAt,
    metadata: [],
    indexSubtitle: "Documentos incluidos en este reporte.",
    bundles,
  });

  for (const bundle of bundles) {
    addSeparatorPage(builder, bundle.title, formatBundleFileSummary(bundle, { includeIncluded: true }));

    if (bundle.groups?.length) {
      for (const group of bundle.groups) {
        addSeparatorPage(
          builder,
          group.title,
          undefined,
          group.entries.map((entry) => entry.entry.label),
        );

        for (const attachment of group.entries) {
          await appendPdfBytes(builder.document, attachment.bytes);
        }
      }
      continue;
    }

    for (const attachment of bundle.entries) {
      await appendPdfBytes(builder.document, attachment.bytes);
    }
  }

  return saveGeneratedPdf(builder);
}

export async function createHistoricalDocumentPdf({
  companyName,
  branchName,
  generatedAt,
  periodLabel,
  bundle,
}: {
  companyName: string;
  branchName: string;
  generatedAt: string;
  periodLabel: string;
  bundle: PdfDocumentBundleWithFiles;
}) {
  const builder = await createGeneratedDocumentBase({
    title: "Historial documental",
    description: "Documentos históricos incluidos en el periodo consultado.",
    companyName,
    branchName,
    generatedAt,
    metadata: [{ label: "Periodo consultado", value: periodLabel }],
    indexSubtitle: "Documentos incluidos en este reporte.",
    bundles: [bundle],
  });

  drawDocumentHistoryList(
    builder,
    bundle.entries.map((attachment) => {
      if (!attachment.entry.date) {
        return "Certificado sin fecha de expedición registrada";
      }

      return `Certificado expedido el ${formatDateForDisplay(attachment.entry.date)}`;
    }),
  );

  for (const attachment of bundle.entries) {
    await appendPdfBytes(builder.document, attachment.bytes);
  }

  return saveGeneratedPdf(builder);
}
