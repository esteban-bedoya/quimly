import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/branch-reports/dates";
import type {
  BranchReportDocumentBundle,
  BranchReportDocumentEntry,
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
const BRAND_DARK = rgb(0.071, 0.067, 0.059);
const BRAND_ACCENT = rgb(0.165, 0.498, 0.525);
const TEXT_MUTED = rgb(0.36, 0.4, 0.44);
const TEXT_SOFT = rgb(0.55, 0.58, 0.61);
const LINE_SOFT = rgb(0.86, 0.88, 0.9);
const FOOTER_TEXT = "Powered by Quimly";
const INDEX_DETAIL_WIDTH = 112;
const INDEX_COLUMN_GAP = 18;
const INDEX_TITLE_WIDTH = TEXT_WIDTH - INDEX_DETAIL_WIDTH - INDEX_COLUMN_GAP;
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
    color = BRAND_DARK,
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

function drawDivider(builder: PdfTextBuilder, before = 8, after = 14) {
  ensureSpace(builder, before + after + 1);
  builder.y -= before;
  builder.page.drawLine({
    start: { x: PAGE_MARGIN, y: builder.y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: builder.y },
    thickness: 1,
    color: LINE_SOFT,
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
    color: TEXT_SOFT,
  });
  builder.footerDrawnPages.add(builder.page);
}

function drawMetadataItem(builder: PdfTextBuilder, label: string, value: string) {
  drawText(builder, label.toLocaleUpperCase("es-CO"), {
    size: PDF_TYPE.metadataLabel.size,
    font: "bold",
    color: TEXT_SOFT,
    lineHeight: PDF_TYPE.metadataLabel.lineHeight,
  });
  drawText(builder, value, { size: PDF_TYPE.metadataValue.size, color: TEXT_MUTED, after: 8 });
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function drawOverviewIndexTitle(builder: PdfTextBuilder, title: string, subtitle: string) {
  drawText(builder, title, {
    size: PDF_TYPE.pageTitle.size,
    font: "bold",
    color: BRAND_DARK,
    lineHeight: PDF_TYPE.pageTitle.lineHeight,
    after: 8,
  });
  drawText(builder, subtitle, {
    size: PDF_TYPE.body.size,
    color: TEXT_MUTED,
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
    const before = 10;
    const after = 10;
    const titleLines = wrapText(`${index + 1}. ${item.title}`, builder.boldFont, titleSize, INDEX_TITLE_WIDTH);
    const detailLines = wrapText(item.detail, builder.regularFont, detailSize, INDEX_DETAIL_WIDTH);
    const rowLineCount = Math.max(titleLines.length, detailLines.length);
    const hasDivider = index < items.length - 1;
    const rowHeight = before + rowLineCount * lineHeight + after + (hasDivider ? 1 : 0);

    ensureSpace(builder, rowHeight);
    builder.y -= before;

    titleLines.forEach((line, lineIndex) => {
      builder.page.drawText(line, {
        x: PAGE_MARGIN,
        y: builder.y - lineIndex * lineHeight,
        size: titleSize,
        font: builder.boldFont,
        color: BRAND_DARK,
      });
    });

    detailLines.forEach((line, lineIndex) => {
      const lineWidth = builder.regularFont.widthOfTextAtSize(line, detailSize);
      builder.page.drawText(line, {
        x: PAGE_WIDTH - PAGE_MARGIN - lineWidth,
        y: builder.y - lineIndex * lineHeight,
        size: detailSize,
        font: builder.regularFont,
        color: TEXT_SOFT,
      });
    });

    builder.y -= rowLineCount * lineHeight + after;

    if (hasDivider) {
      builder.page.drawLine({
        start: { x: PAGE_MARGIN, y: builder.y },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: builder.y },
        thickness: 0.6,
        color: LINE_SOFT,
      });
      builder.y -= 1;
    }
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
    color: TEXT_MUTED,
    lineHeight: PDF_TYPE.coverDescription.lineHeight,
    after: 22,
  });
  drawMetadataItem(builder, "Empresa", companyName);
  drawMetadataItem(builder, "Sede", branchName);
  drawMetadataItem(builder, "Fecha de generación", formatDateTimeForDisplay(generatedAt));
  metadata.forEach((item) => drawMetadataItem(builder, item.label, item.value));
  drawDivider(builder, 12, 24);
  drawOverviewIndex(builder, index);
}

function drawSimplePageTitle(builder: PdfTextBuilder, title: string, subtitle?: string) {
  drawText(builder, title, {
    size: PDF_TYPE.pageTitle.size,
    font: "bold",
    color: BRAND_DARK,
    lineHeight: PDF_TYPE.pageTitle.lineHeight,
    after: 8,
  });

  if (subtitle) {
    drawText(builder, subtitle, {
      size: PDF_TYPE.body.size,
      color: TEXT_MUTED,
      lineHeight: PDF_TYPE.body.lineHeight,
      after: 8,
    });
  }

  drawDivider(builder, 8, 16);
}

function drawRecordBlock(builder: PdfTextBuilder, index: number, recordDate: string, fields: Array<{ label: string; value: string }>) {
  const estimatedHeight = 34 + fields.length * 19;
  ensureSpace(builder, estimatedHeight);
  drawText(builder, `Registro ${index}`, {
    size: PDF_TYPE.recordTitle.size,
    font: "bold",
    color: BRAND_ACCENT,
    lineHeight: PDF_TYPE.recordTitle.lineHeight,
  });
  drawText(builder, recordDate, {
    size: PDF_TYPE.recordDate.size,
    color: TEXT_SOFT,
    lineHeight: PDF_TYPE.recordDate.lineHeight,
    after: 4,
  });

  for (const field of fields) {
    drawText(builder, `${field.label}: ${field.value}`, {
      size: PDF_TYPE.recordField.size,
      color: TEXT_MUTED,
      lineHeight: PDF_TYPE.recordField.lineHeight,
      x: PAGE_MARGIN + 10,
      width: TEXT_WIDTH - 10,
    });
  }

  builder.y -= 10;
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
    drawSimplePageTitle(builder, section.title, `${formatCount(section.records.length, "registro", "registros")} en el periodo.`);

    if (!section.records.length) {
      drawText(builder, "No se encontraron registros para este formulario en el periodo seleccionado.", {
        size: PDF_TYPE.body.size,
        color: TEXT_MUTED,
      });
      continue;
    }

    section.records.forEach((record, index) => {
      drawRecordBlock(builder, index + 1, formatDateTimeForDisplay(record.recordedAt), record.fields);
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
        detail: formatCount(getBundleFileCount(bundle), "archivo", "archivos"),
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
    font: "bold",
    lineHeight: PDF_TYPE.separatorTitle.lineHeight,
    after: 12,
  });

  if (subtitle) {
    drawText(builder, subtitle, {
      size: PDF_TYPE.body.size,
      color: TEXT_MUTED,
      lineHeight: PDF_TYPE.body.lineHeight,
      after: 16,
    });
  }

  details.forEach((detail) => {
    drawText(builder, detail, {
      size: PDF_TYPE.detail.size,
      color: TEXT_SOFT,
      lineHeight: PDF_TYPE.detail.lineHeight,
      after: 4,
    });
  });

  drawFooter(builder);
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
    addSeparatorPage(builder, bundle.title, formatCount(bundle.entries.length, "archivo incluido", "archivos incluidos"));

    if (bundle.groups?.length) {
      for (const group of bundle.groups) {
        addSeparatorPage(
          builder,
          group.title,
          bundle.title,
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
  categoryTitle,
  periodLabel,
  bundle,
}: {
  companyName: string;
  branchName: string;
  generatedAt: string;
  categoryTitle: string;
  periodLabel: string;
  bundle: PdfDocumentBundleWithFiles;
}) {
  const builder = await createGeneratedDocumentBase({
    title: "Historial documental",
    description: "Documentos incluidos en el periodo consultado.",
    companyName,
    branchName,
    generatedAt,
    metadata: [{ label: "Periodo consultado", value: periodLabel }],
    indexSubtitle: "Documentos incluidos en este reporte.",
    bundles: [bundle],
  });

  addSeparatorPage(
    builder,
    categoryTitle,
    periodLabel,
    bundle.entries.map((attachment) => {
      const date = attachment.entry.date ? formatDateForDisplay(attachment.entry.date) : "Sin fecha registrada";
      return `${attachment.entry.label} - ${date}`;
    }),
  );

  for (const attachment of bundle.entries) {
    await appendPdfBytes(builder.document, attachment.bytes);
  }

  return saveGeneratedPdf(builder);
}
