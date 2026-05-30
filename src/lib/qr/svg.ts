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
  const width = 1050;
  const height = 1400;
  const cutMargin = 28;
  const innerPadding = 84;
  const qrBoxSize = 470;
  const qrBoxX = Math.round((width - qrBoxSize) / 2);
  const qrBoxY = 530;
  const qrPadding = 34;
  const qrSize = qrBoxSize - qrPadding * 2;
  const { path, viewBoxSize } = createQrPathData(value);

  const branchLines = wrapText(branchName, 28).slice(0, 2);
  const companyLines = wrapText(companyName, 34).slice(0, 2);
  const formTitleLines = wrapText(formTitle, 22).slice(0, 3);
  const instructionLines = wrapText("Escanee este código para registrar el control correspondiente.", 38).slice(0, 2);

  let currentY = 150;
  const branchText = branchLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#12110f">${escapeXml(line)}</text>`;
      currentY += 40;
      return text;
    })
    .join("");

  currentY += 12;

  const companyText = companyLines
    .map((line) => {
      const text = `<text x="${innerPadding}" y="${currentY}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="400" fill="#5e6770">${escapeXml(line)}</text>`;
      currentY += 32;
      return text;
    })
    .join("");

  currentY += 62;

  const formTitleText = formTitleLines
    .map((line, index) => {
      const text = `<text x="${width / 2}" y="${currentY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${index === 0 ? 32 : 30}" font-weight="700" letter-spacing="4.8" fill="#2a7f86">${escapeXml(line)}</text>`;
      currentY += 42;
      return text;
    })
    .join("");

  const instructionStartY = qrBoxY + qrBoxSize + 92;
  const instructionText = instructionLines
    .map((line, index) => {
      return `<text x="${width / 2}" y="${instructionStartY + index * 34}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="500" fill="#3e4a52">${escapeXml(line)}</text>`;
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="10.5cm" height="14cm" viewBox="0 0 ${width} ${height}" role="img" aria-label="QR imprimible para ${escapeXml(formTitle)}" shape-rendering="geometricPrecision">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<rect x="${cutMargin}" y="${cutMargin}" width="${width - cutMargin * 2}" height="${height - cutMargin * 2}" rx="24" fill="none" stroke="#cfd8db" stroke-width="2" stroke-dasharray="8 6"/>`,
    `<rect x="58" y="58" width="${width - 116}" height="${height - 116}" rx="38" fill="#ffffff" stroke="#dde6e8" stroke-width="2"/>`,
    `<line x1="${innerPadding}" y1="272" x2="${width - innerPadding}" y2="272" stroke="#e6eded" stroke-width="2"/>`,
    branchText,
    companyText,
    formTitleText,
    `<rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxSize}" height="${qrBoxSize}" rx="36" fill="#ffffff" stroke="#e2eaea" stroke-width="2.5"/>`,
    `<rect x="${qrBoxX + 20}" y="${qrBoxY + 20}" width="${qrBoxSize - 40}" height="${qrBoxSize - 40}" rx="24" fill="#fbfbfb"/>`,
    `<g transform="translate(${qrBoxX + qrPadding} ${qrBoxY + qrPadding}) scale(${qrSize / viewBoxSize})">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#12110f"/>`,
    `</g>`,
    instructionText,
    `<text x="${width - innerPadding}" y="${height - 92}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="500" fill="#8a9498">Powered by Quimly</text>`,
    `</svg>`,
  ].join("");
}
