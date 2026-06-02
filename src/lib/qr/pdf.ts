import { operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import { createPublicFormUrl } from "@/lib/operational-forms";
import { createQrModuleData } from "@/lib/qr/core";
import { printableQrInstructions } from "@/lib/qr/printable";

type BranchOperationalPdfForm = {
  formType: OperationalFormType;
  token: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 28;
const GRID_GAP = 14;
const TEXT_BAND_HEIGHT = 82;
const HEADER_TEXT_FONT_SIZE = 11;
const HEADER_TEXT_TOP = 43;
const CSS_SHADOW_BLUR = 40;
const CSS_SHADOW_LAYER_COUNT = 24;
const CSS_SHADOW_OPACITY = 0.08;

function pdfEscapeText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapTextByWidth(value: string, maxWidth: number, fontSize: number) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  const widthFactor = 0.54;

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length * fontSize * widthFactor <= maxWidth || !currentLine) {
      currentLine = nextLine;
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

function estimateTextWidth(value: string, fontSize: number) {
  const units = [...value].reduce((total, character) => {
    if (character === " ") {
      return total + 278;
    }

    if ("MWÁÉÍÓÚÑ".includes(character)) {
      return total + 900;
    }

    if ("IJÍ".includes(character)) {
      return total + 330;
    }

    return total + 720;
  }, 0);

  return (units / 1000) * fontSize;
}

function yFromTop(topOffset: number) {
  return PAGE_HEIGHT - topOffset;
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const c = 0.5522847498 * r;
  const right = x + width;
  const top = y + height;

  return [
    `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
    `${(right - r).toFixed(2)} ${y.toFixed(2)} l`,
    `${(right - r + c).toFixed(2)} ${y.toFixed(2)} ${right.toFixed(2)} ${(y + r - c).toFixed(2)} ${right.toFixed(2)} ${(y + r).toFixed(2)} c`,
    `${right.toFixed(2)} ${(top - r).toFixed(2)} l`,
    `${right.toFixed(2)} ${(top - r + c).toFixed(2)} ${(right - r + c).toFixed(2)} ${top.toFixed(2)} ${(right - r).toFixed(2)} ${top.toFixed(2)} c`,
    `${(x + r).toFixed(2)} ${top.toFixed(2)} l`,
    `${(x + r - c).toFixed(2)} ${top.toFixed(2)} ${x.toFixed(2)} ${(top - r + c).toFixed(2)} ${x.toFixed(2)} ${(top - r).toFixed(2)} c`,
    `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
    `${x.toFixed(2)} ${(y + r - c).toFixed(2)} ${(x + r - c).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
    "h",
  ].join(" ");
}

function centeredTextXInBox(boxX: number, boxWidth: number, text: string, fontSize: number) {
  return boxX + (boxWidth - estimateTextWidth(text, fontSize)) / 2;
}

function fontSizeToFitText(value: string, maxWidth: number, fontSize: number) {
  const textWidth = estimateTextWidth(value, fontSize);

  if (textWidth <= maxWidth) {
    return fontSize;
  }

  return (maxWidth / textWidth) * fontSize;
}

function pushCompanyBranchLine({
  commands,
  x,
  y,
  maxWidth,
  companyName,
  branchName,
  fontSize,
  companyColor = "0.07 0.07 0.06",
  branchColor = "0.36 0.4 0.44",
}: {
  commands: string[];
  x: number;
  y: number;
  maxWidth: number;
  companyName: string;
  branchName: string;
  fontSize: number;
  companyColor?: string;
  branchColor?: string;
}) {
  const branchText = ` | ${branchName}`;
  const lineFontSize = fontSizeToFitText(`${companyName}${branchText}`, maxWidth, fontSize);

  commands.push(`${companyColor} rg`);
  commands.push("BT");
  commands.push(`/F2 ${lineFontSize.toFixed(2)} Tf`);
  commands.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
  commands.push(`(${pdfEscapeText(companyName)}) Tj`);
  commands.push(`/F1 ${lineFontSize.toFixed(2)} Tf`);
  commands.push(`${branchColor} rg`);
  commands.push(`(${pdfEscapeText(branchText)}) Tj`);
  commands.push("ET");
}

function shadowGStateName(index: number) {
  return `GS${index + 1}`;
}

function shadowLayerOpacity(index: number) {
  const progress = (index + 1) / CSS_SHADOW_LAYER_COUNT;
  return (CSS_SHADOW_OPACITY / CSS_SHADOW_LAYER_COUNT) * (0.32 + progress * progress * 1.68);
}

function createShadowGStates() {
  const shadowStates = Array.from({ length: CSS_SHADOW_LAYER_COUNT }, (_, index) => {
    const opacity = shadowLayerOpacity(index).toFixed(5);

    return `/${shadowGStateName(index)} << /ca ${opacity} /CA ${opacity} >>`;
  }).join(" ");

  return `/GS0 << /ca 1 /CA 1 >> ${shadowStates}`;
}

function pushCardShadow(commands: string[], x: number, y: number, width: number, height: number, radius: number) {
  [-18, 18].forEach((offsetY) => {
    for (let index = 0; index < CSS_SHADOW_LAYER_COUNT; index += 1) {
      const progress = (index + 1) / CSS_SHADOW_LAYER_COUNT;
      const spread = CSS_SHADOW_BLUR * (1 - progress);

      commands.push(`/${shadowGStateName(index)} gs`);
      commands.push("0.071 0.067 0.059 rg");
      commands.push(
        roundedRectPath(
          x - spread,
          y - spread + offsetY,
          width + spread * 2,
          height + spread * 2,
          radius + spread,
        ) + " f",
      );
    }
  });

  commands.push("/GS0 gs");
}

function buildPdf(contentCommands: string[]) {
  const content = contentCommands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ExtGState << ${createShadowGStates()} >> >> >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export function createBranchOperationalFormsPdf({
  origin,
  companyName,
  branchName,
  forms,
}: {
  origin: string;
  companyName: string;
  branchName: string;
  forms: BranchOperationalPdfForm[];
}) {
  const cardWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - GRID_GAP) / 2;
  const gridTopOffset = TEXT_BAND_HEIGHT;
  const totalGridHeight = PAGE_HEIGHT - gridTopOffset - TEXT_BAND_HEIGHT;
  const cardHeight = (totalGridHeight - GRID_GAP) / 2;
  const textBlockWidth = 210;
  const qrSize = 114;
  const cardRadius = 18;
  const instructionFontSize = 10;
  const instructionLabelGap = 13;
  const instructionLineGap = 12.5;

  const commands: string[] = [
    "1 1 1 rg",
    `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`,
    "/GS0 gs",
  ];

  pushCompanyBranchLine({
    commands,
    x: PAGE_MARGIN,
    y: yFromTop(HEADER_TEXT_TOP),
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    companyName,
    branchName,
    fontSize: HEADER_TEXT_FONT_SIZE,
  });

  const cardLayouts = forms.map((form, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cardX = PAGE_MARGIN + column * (cardWidth + GRID_GAP);
    const cardTopY = yFromTop(gridTopOffset) - row * (cardHeight + GRID_GAP);
    const cardBottomY = cardTopY - cardHeight;

    return {
      cardBottomY,
      cardTopY,
      cardX,
      form,
    };
  });

  cardLayouts.forEach(({ cardBottomY, cardX }) => {
    pushCardShadow(commands, cardX, cardBottomY, cardWidth, cardHeight, cardRadius);
  });

  cardLayouts.forEach(({ cardBottomY, cardTopY, cardX, form }) => {
    const cardCenterX = cardX + cardWidth / 2;
    const textBlockX = cardCenterX - textBlockWidth / 2;
    const contentTop = cardTopY - 36;
    const label = operationalFormLabels[form.formType];
    const instructions = printableQrInstructions[form.formType];
    const maxTextWidth = textBlockWidth;

    commands.push("1 1 1 rg");
    commands.push(roundedRectPath(cardX, cardBottomY, cardWidth, cardHeight, cardRadius) + " f");

    pushCompanyBranchLine({
      commands,
      x: cardX + 16,
      y: cardTopY - 18,
      maxWidth: cardWidth - 32,
      companyName,
      branchName,
      fontSize: 8.5,
      branchColor: "0.42 0.46 0.48",
    });

    commands.push("0.165 0.498 0.525 rg");
    commands.push("BT /F2 12 Tf");
    commands.push(`${centeredTextXInBox(cardX, cardWidth, label.title, 12).toFixed(2)} ${(contentTop - 2).toFixed(2)} Td`);
    commands.push(`(${pdfEscapeText(label.title)}) Tj ET`);

    const qrTopY = contentTop - 28;
    const qrBottomY = qrTopY - qrSize;
    const qrX = cardCenterX - qrSize / 2;
    commands.push("1 1 1 rg");
    commands.push(`${qrX.toFixed(2)} ${qrBottomY.toFixed(2)} ${qrSize.toFixed(2)} ${qrSize.toFixed(2)} re f`);

    const publicUrl = createPublicFormUrl(origin, form.token);
    const qr = createQrModuleData(publicUrl);
    const moduleSize = qrSize / qr.viewBoxSize;
    commands.push("0.07 0.07 0.06 rg");
    qr.darkModules.forEach(({ x, y }) => {
      const rectX = qrX + x * moduleSize;
      const rectY = qrBottomY + (qr.viewBoxSize - y - 1) * moduleSize;
      commands.push(`${rectX.toFixed(3)} ${rectY.toFixed(3)} ${moduleSize.toFixed(3)} ${moduleSize.toFixed(3)} re f`);
    });

    let textY = qrBottomY - 20;

    instructions.forEach((item) => {
      commands.push("0.07 0.07 0.06 rg");
      commands.push(`BT /F2 ${instructionFontSize} Tf`);
      commands.push(`${textBlockX.toFixed(2)} ${textY.toFixed(2)} Td`);
      commands.push(`(${pdfEscapeText(item.label)}) Tj ET`);
      textY -= instructionLabelGap;

      commands.push("0.36 0.4 0.44 rg");
      const valueLines = wrapTextByWidth(item.value, maxTextWidth, instructionFontSize);
      valueLines.forEach((line) => {
        commands.push(`BT /F1 ${instructionFontSize} Tf`);
        commands.push(`${textBlockX.toFixed(2)} ${textY.toFixed(2)} Td`);
        commands.push(`(${pdfEscapeText(line)}) Tj ET`);
        textY -= instructionLineGap;
      });

      textY -= 10;
    });

    commands.push("0.56 0.59 0.61 rg");
    commands.push("BT /F1 6.5 Tf");
    commands.push(
      `${(cardX + cardWidth - 14 - estimateTextWidth("Powered by Quimly", 6.5)).toFixed(2)} ${(cardBottomY + 8).toFixed(2)} Td`,
    );
    commands.push(`(${pdfEscapeText("Powered by Quimly")}) Tj ET`);
  });

  return buildPdf(commands);
}
