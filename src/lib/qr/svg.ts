import QRCode from "qrcode";

import type { OperationalFormType } from "@/lib/operational-forms";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createQrPathData(value: string) {
  const qrCode = QRCode.create(value, {
    errorCorrectionLevel: "M",
  });
  const quietZone = 4;
  const qrSize = qrCode.modules.size;
  const viewBoxSize = qrSize + quietZone * 2;
  const paths: string[] = [];

  for (let row = 0; row < qrSize; row += 1) {
    for (let column = 0; column < qrSize; column += 1) {
      if (qrCode.modules.get(row, column)) {
        paths.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }

  return {
    path: paths.join(""),
    viewBoxSize,
  };
}

export function createQrSvg(value: string) {
  const { path, viewBoxSize } = createQrPathData(value);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges" role="img" aria-label="QR ${escapeXml(value)}">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#12110f"/>`,
    `</svg>`,
  ].join("");
}

type PrintableQrCardInput = {
  value: string;
  branchName: string;
  companyName: string;
  formTitle: string;
  formType: OperationalFormType;
};

type PrintableQrInstructionItem = {
  label: string;
  value: string;
};

const printableQrInstructions: Record<OperationalFormType, PrintableQrInstructionItem[]> = {
  thermal_control: [
    { label: "Frecuencia de registro:", value: "Mínimo 2 veces al día por equipo." },
    { label: "Aplica para:", value: "Equipos de refrigeración y congelación." },
  ],
  area_sanitation: [
    { label: "Frecuencia de registro:", value: "Después de cada limpieza o desinfección." },
    {
      label: "Aplica para:",
      value: "Áreas, equipos y utensilios incluidos en el Plan de Saneamiento Básico.",
    },
  ],
  supply_reception: [
    { label: "Frecuencia de registro:", value: "En cada ingreso de proveedores." },
    {
      label: "Aplica para:",
      value: "Carnes, pescados, huevos, lácteos y demás productos de alto riesgo sanitario.",
    },
  ],
  water_quality: [
    { label: "Frecuencia de registro:", value: "Diariamente al inicio de la jornada." },
    { label: "Aplica para:", value: "Medición de cloro libre residual y pH del agua." },
  ],
};

function wrapText(value: string, maxCharsPerLine: number) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine || !currentLine) {
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

export function createPrintableQrSvg({
  value,
  branchName,
  companyName,
  formTitle,
  formType,
}: PrintableQrCardInput) {
  const width = 1140;
  const height = 1320;
  const cutMargin = 20;
  const innerPadding = 94;
  const { path, viewBoxSize } = createQrPathData(value);

  const branchLines = wrapText(branchName, 28).slice(0, 2);
  const companyLines = wrapText(companyName, 34).slice(0, 2);
  const formTitleLines = wrapText(formTitle, 14).slice(0, 3);
  const instructionItems = printableQrInstructions[formType].map((item) => ({
    label: item.label,
    valueLines: wrapText(item.value, 56),
  }));

  const branchFontSize = 33;
  const branchLineHeight = 31;
  const companyFontSize = 45;
  const companyLineHeight = 42;
  const formTitleFirstLineFontSize = 56;
  const formTitleNextLineFontSize = 52;
  const formTitleLineHeight = 47;
  const qrBoxMaxSize = 680;
  const qrPadding = 24;
  const gapBeforeQr = 34;
  const instructionLabelFontSize = 33;
  const instructionLabelLineHeight = companyLineHeight;
  const instructionValueFontSize = branchFontSize;
  const instructionValueLineHeight = branchLineHeight;
  const instructionItemGap = 18;
  const instructionTopGap = 72;
  const poweredByFontSize = 27;
  const poweredByY = 1242;
  const poweredByGap = 42;

  let currentY = 100;
  const companyText = companyLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="${companyFontSize}" font-weight="700" fill="#12110f">${escapeXml(line)}</text>`;
      currentY += companyLineHeight;
      return text;
    })
    .join("");

  currentY += 6;

  const branchText = branchLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="${branchFontSize}" font-weight="500" fill="#526168">${escapeXml(line)}</text>`;
      currentY += branchLineHeight;
      return text;
    })
    .join("");

  currentY += 16;

  const formTitleText = formTitleLines
    .map((line, index) => {
      const text = `<text x="${width / 2}" y="${currentY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${index === 0 ? formTitleFirstLineFontSize : formTitleNextLineFontSize}" font-weight="700" letter-spacing="5" fill="#2a7f86">${escapeXml(line)}</text>`;
      currentY += formTitleLineHeight;
      return text;
    })
    .join("");

  const instructionBlockHeight = instructionItems.reduce((totalHeight, item, index) => {
    const itemHeight = instructionLabelLineHeight + item.valueLines.length * instructionValueLineHeight;
    return totalHeight + itemHeight + (index === instructionItems.length - 1 ? 0 : instructionItemGap);
  }, 0);
  const qrBoxX = Math.round((width - qrBoxMaxSize) / 2);
  const qrBoxY = currentY + gapBeforeQr;
  const qrBoxSize = Math.min(
    qrBoxMaxSize,
    poweredByY - poweredByGap - instructionBlockHeight - instructionTopGap - qrBoxY,
  );
  const qrSize = qrBoxSize - qrPadding * 2;
  const instructionStartY = qrBoxY + qrBoxSize + instructionTopGap;
  let instructionCurrentY = instructionStartY;
  const instructionText = instructionItems
    .map((item, itemIndex) => {
      const labelText = `<text x="${innerPadding}" y="${instructionCurrentY}" font-family="Arial, Helvetica, sans-serif" font-size="${instructionLabelFontSize}" font-weight="700" fill="#12110f">${escapeXml(item.label)}</text>`;
      instructionCurrentY += instructionLabelLineHeight;

      const valueText = item.valueLines
        .map((line) => {
          const text = `<text x="${innerPadding}" y="${instructionCurrentY}" font-family="Arial, Helvetica, sans-serif" font-size="${instructionValueFontSize}" font-weight="500" fill="#526168">${escapeXml(line)}</text>`;
          instructionCurrentY += instructionValueLineHeight;
          return text;
        })
        .join("");

      if (itemIndex < instructionItems.length - 1) {
        instructionCurrentY += instructionItemGap;
      }

      return `${labelText}${valueText}`;
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="11.4cm" height="13.2cm" viewBox="0 0 ${width} ${height}" role="img" aria-label="QR imprimible para ${escapeXml(formTitle)}" shape-rendering="geometricPrecision">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<rect x="${cutMargin}" y="${cutMargin}" width="${width - cutMargin * 2}" height="${height - cutMargin * 2}" rx="24" fill="none" stroke="#cfd8db" stroke-width="2" stroke-dasharray="8 6"/>`,
    `<rect x="48" y="48" width="${width - 96}" height="${height - 96}" rx="40" fill="#ffffff" stroke="#dde6e8" stroke-width="2"/>`,
    branchText,
    companyText,
    formTitleText,
    `<rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxSize}" height="${qrBoxSize}" rx="32" fill="#ffffff" stroke="#e2eaea" stroke-width="2.5"/>`,
    `<rect x="${qrBoxX + 18}" y="${qrBoxY + 18}" width="${qrBoxSize - 36}" height="${qrBoxSize - 36}" rx="22" fill="#fbfbfb"/>`,
    `<g transform="translate(${qrBoxX + qrPadding} ${qrBoxY + qrPadding}) scale(${qrSize / viewBoxSize})">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#12110f"/>`,
    `</g>`,
    instructionText,
    `<text x="${width - innerPadding}" y="${poweredByY}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${poweredByFontSize}" font-weight="500" fill="#8a9498">Powered by Quimly</text>`,
    `</svg>`,
  ].join("");
}
