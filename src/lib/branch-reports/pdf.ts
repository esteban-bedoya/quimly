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
  } satisfies PdfTextBuilder;
}

function addPage(builder: PdfTextBuilder) {
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
  builder.page.drawText("Quimly", {
    x: PAGE_MARGIN,
    y: 26,
    size: 8,
    font: builder.boldFont,
    color: TEXT_SOFT,
  });
}

function drawCover(builder: PdfTextBuilder, {
  title,
  companyName,
  branchName,
  generatedAt,
  metadata,
}: {
  title: string;
  companyName: string;
  branchName: string;
  generatedAt: string;
  metadata: Array<{ label: string; value: string }>;
}) {
  builder.y = PAGE_HEIGHT - 112;
  drawText(builder, "Quimly", { size: 12, font: "bold", color: BRAND_ACCENT, after: 30 });
  drawText(builder, title, { size: 28, font: "bold", lineHeight: 34, after: 22 });
  drawText(builder, companyName, { size: 16, font: "bold", after: 4 });
  drawText(builder, branchName, { size: 12, color: TEXT_MUTED, after: 22 });
  drawDivider(builder, 6, 18);

  for (const item of metadata) {
    drawText(builder, item.label.toLocaleUpperCase("es-CO"), {
      size: 8,
      font: "bold",
      color: TEXT_SOFT,
      lineHeight: 11,
    });
    drawText(builder, item.value, { size: 11, color: TEXT_MUTED, after: 10 });
  }

  drawText(builder, "Fecha de generación", {
    size: 8,
    font: "bold",
    color: TEXT_SOFT,
    lineHeight: 11,
    before: 8,
  });
  drawText(builder, formatDateTimeForDisplay(generatedAt), { size: 11, color: TEXT_MUTED });
  drawFooter(builder);
}

function drawSimplePageTitle(builder: PdfTextBuilder, title: string, subtitle?: string) {
  drawText(builder, title, { size: 20, font: "bold", color: BRAND_DARK, lineHeight: 26, after: 8 });

  if (subtitle) {
    drawText(builder, subtitle, { size: 11, color: TEXT_MUTED, lineHeight: 16, after: 8 });
  }

  drawDivider(builder, 8, 16);
}

function drawRecordBlock(builder: PdfTextBuilder, index: number, recordDate: string, fields: Array<{ label: string; value: string }>) {
  const estimatedHeight = 34 + fields.length * 19;
  ensureSpace(builder, estimatedHeight);
  drawText(builder, `Registro ${index}`, { size: 11, font: "bold", color: BRAND_ACCENT, lineHeight: 15 });
  drawText(builder, recordDate, { size: 9, color: TEXT_SOFT, lineHeight: 12, after: 4 });

  for (const field of fields) {
    drawText(builder, `${field.label}: ${field.value}`, {
      size: 9.5,
      color: TEXT_MUTED,
      lineHeight: 14,
      x: PAGE_MARGIN + 10,
      width: TEXT_WIDTH - 10,
    });
  }

  builder.y -= 10;
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

  drawCover(builder, {
    title: "Reporte de formularios",
    companyName,
    branchName,
    generatedAt,
    metadata: [{ label: "Periodo consultado", value: periodLabel }],
  });

  addPage(builder);
  drawSimplePageTitle(builder, "Contenido", "Formularios incluidos en este reporte.");
  sections.forEach((section, index) => {
    drawText(builder, `${index + 1}. ${section.title}`, {
      size: 11,
      font: "bold",
      color: BRAND_DARK,
      after: 3,
    });
    drawText(builder, `${section.records.length} ${section.records.length === 1 ? "registro" : "registros"}`, {
      size: 9,
      color: TEXT_SOFT,
      after: 8,
    });
  });
  drawFooter(builder);

  for (const section of sections) {
    addPage(builder);
    drawSimplePageTitle(builder, section.title, `${section.records.length} ${section.records.length === 1 ? "registro" : "registros"} en el periodo.`);

    if (!section.records.length) {
      drawText(builder, "No se encontraron registros para este formulario en el periodo seleccionado.", {
        size: 11,
        color: TEXT_MUTED,
      });
      drawFooter(builder);
      continue;
    }

    section.records.forEach((record, index) => {
      drawRecordBlock(builder, index + 1, formatDateTimeForDisplay(record.recordedAt), record.fields);
    });
    drawFooter(builder);
  }

  return Buffer.from(await builder.document.save());
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
  companyName,
  branchName,
  generatedAt,
  metadata,
  bundles,
}: {
  title: string;
  companyName: string;
  branchName: string;
  generatedAt: string;
  metadata: Array<{ label: string; value: string }>;
  bundles: PdfDocumentBundleWithFiles[];
}) {
  const builder = await createTextBuilder();

  drawCover(builder, {
    title,
    companyName,
    branchName,
    generatedAt,
    metadata,
  });

  addPage(builder);
  drawSimplePageTitle(builder, "Índice", "Orden de los documentos incluidos.");
  bundles.forEach((bundle, index) => {
    drawText(builder, `${index + 1}. ${bundle.title}`, {
      size: 11,
      font: "bold",
      after: 3,
    });
    drawText(builder, `${getBundleFileCount(bundle)} ${getBundleFileCount(bundle) === 1 ? "archivo" : "archivos"}`, {
      size: 9,
      color: TEXT_SOFT,
      after: 8,
    });
  });
  drawFooter(builder);

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
  drawText(builder, title, { size: 23, font: "bold", lineHeight: 30, after: 12 });

  if (subtitle) {
    drawText(builder, subtitle, { size: 11, color: TEXT_MUTED, lineHeight: 16, after: 16 });
  }

  details.forEach((detail) => {
    drawText(builder, detail, { size: 10, color: TEXT_SOFT, lineHeight: 14, after: 4 });
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
    title: "Expediente sanitario",
    companyName,
    branchName,
    generatedAt,
    metadata: [{ label: "Tipo de archivo", value: "Documentos sanitarios actuales" }],
    bundles,
  });

  for (const bundle of bundles) {
    addSeparatorPage(builder, bundle.title, `${bundle.entries.length} ${bundle.entries.length === 1 ? "archivo incluido" : "archivos incluidos"}`);

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

  return Buffer.from(await builder.document.save());
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
    companyName,
    branchName,
    generatedAt,
    metadata: [
      { label: "Categoría", value: categoryTitle },
      { label: "Periodo consultado", value: periodLabel },
    ],
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

  return Buffer.from(await builder.document.save());
}
