import QRCode from "qrcode";

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
}: PrintableQrCardInput) {
  const width = 1040;
  const height = 1140;
  const cutMargin = 18;
  const innerPadding = 86;
  const { path, viewBoxSize } = createQrPathData(value);

  const branchLines = wrapText(branchName, 28).slice(0, 2);
  const companyLines = wrapText(companyName, 34).slice(0, 2);
  const formTitleLines = wrapText(formTitle, 14).slice(0, 3);
  const instructionLines = wrapText("Escanee este código para registrar el control correspondiente.", 38).slice(0, 2);

  const branchFontSize = 31;
  const branchLineHeight = 29;
  const companyFontSize = 41;
  const companyLineHeight = 38;
  const formTitleFirstLineFontSize = 52;
  const formTitleNextLineFontSize = 48;
  const formTitleLineHeight = 43;
  const qrBoxMaxSize = 640;
  const qrPadding = 24;
  const gapBeforeQr = 26;
  const instructionFontSize = 27;
  const instructionLineHeight = 35;
  const instructionTopGap = 36;
  const poweredByFontSize = 24;
  const poweredByY = 1084;
  const poweredByGap = 26;

  let currentY = 94;
  const branchText = branchLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="${branchFontSize}" font-weight="500" fill="#526168">${escapeXml(line)}</text>`;
      currentY += branchLineHeight;
      return text;
    })
    .join("");

  currentY += 6;

  const companyText = companyLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="${companyFontSize}" font-weight="700" fill="#12110f">${escapeXml(line)}</text>`;
      currentY += companyLineHeight;
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

  const instructionBlockHeight = Math.max(1, instructionLines.length) * instructionLineHeight;
  const qrBoxX = Math.round((width - qrBoxMaxSize) / 2);
  const qrBoxY = currentY + gapBeforeQr;
  const qrBoxSize = Math.min(
    qrBoxMaxSize,
    poweredByY - poweredByGap - instructionBlockHeight - instructionTopGap - qrBoxY,
  );
  const qrSize = qrBoxSize - qrPadding * 2;
  const instructionStartY = qrBoxY + qrBoxSize + instructionTopGap;
  const instructionText = instructionLines
    .map((line, index) => {
      return `<text x="${width / 2}" y="${instructionStartY + index * instructionLineHeight}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${instructionFontSize}" font-weight="500" fill="#3e4a52">${escapeXml(line)}</text>`;
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="10.4cm" height="11.4cm" viewBox="0 0 ${width} ${height}" role="img" aria-label="QR imprimible para ${escapeXml(formTitle)}" shape-rendering="geometricPrecision">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<rect x="${cutMargin}" y="${cutMargin}" width="${width - cutMargin * 2}" height="${height - cutMargin * 2}" rx="24" fill="none" stroke="#cfd8db" stroke-width="2" stroke-dasharray="8 6"/>`,
    `<rect x="42" y="42" width="${width - 84}" height="${height - 84}" rx="38" fill="#ffffff" stroke="#dde6e8" stroke-width="2"/>`,
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
