import QRCode from "qrcode";

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createQrModuleData(value: string) {
  const qrCode = QRCode.create(value, {
    errorCorrectionLevel: "M",
  });
  const quietZone = 4;
  const qrSize = qrCode.modules.size;
  const viewBoxSize = qrSize + quietZone * 2;
  const darkModules: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < qrSize; row += 1) {
    for (let column = 0; column < qrSize; column += 1) {
      if (qrCode.modules.get(row, column)) {
        darkModules.push({
          x: column + quietZone,
          y: row + quietZone,
        });
      }
    }
  }

  return {
    darkModules,
    viewBoxSize,
  };
}

export function createQrPathData(value: string) {
  const { darkModules, viewBoxSize } = createQrModuleData(value);

  return {
    path: darkModules.map(({ x, y }) => `M${x} ${y}h1v1h-1z`).join(""),
    viewBoxSize,
  };
}
