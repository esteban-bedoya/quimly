const QR_VERSION = 5;
const QR_SIZE = 17 + QR_VERSION * 4;
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;
const FORMAT_BITS_LOW_MASK_0 = 0b111011111000100;

function appendBits(target: number[], value: number, bitCount: number) {
  for (let index = bitCount - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function createGaloisTables() {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let value = 1;

  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }

  for (let index = 255; index < 512; index += 1) {
    exp[index] = exp[index - 255];
  }

  return { exp, log };
}

const gf = createGaloisTables();

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return gf.exp[gf.log[left] + gf.log[right]];
}

function createGeneratorPolynomial(degree: number) {
  let coefficients = [1];

  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(coefficients.length + 1).fill(0);

    for (let coefficientIndex = 0; coefficientIndex < coefficients.length; coefficientIndex += 1) {
      next[coefficientIndex] ^= coefficients[coefficientIndex];
      next[coefficientIndex + 1] ^= gfMultiply(coefficients[coefficientIndex], gf.exp[index]);
    }

    coefficients = next;
  }

  return coefficients;
}

const generatorPolynomial = createGeneratorPolynomial(ECC_CODEWORDS);

function createErrorCorrection(dataCodewords: number[]) {
  const result = new Array<number>(ECC_CODEWORDS).fill(0);

  for (const codeword of dataCodewords) {
    const factor = codeword ^ result[0];
    result.copyWithin(0, 1);
    result[ECC_CODEWORDS - 1] = 0;

    for (let index = 0; index < ECC_CODEWORDS; index += 1) {
      result[index] ^= gfMultiply(generatorPolynomial[index + 1], factor);
    }
  }

  return result;
}

function createDataCodewords(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));

  if (bytes.length > 100) {
    throw new Error("La URL publica es demasiado larga para el QR local.");
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);

  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const capacityBits = DATA_CODEWORDS * 8;
  const terminatorLength = Math.min(4, capacityBits - bits.length);
  appendBits(bits, 0, terminatorLength);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords: number[] = [];

  for (let index = 0; index < bits.length; index += 8) {
    let codeword = 0;

    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      codeword = (codeword << 1) | bits[index + bitIndex];
    }

    dataCodewords.push(codeword);
  }

  for (let padIndex = 0; dataCodewords.length < DATA_CODEWORDS; padIndex += 1) {
    dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return dataCodewords;
}

function setModule(
  modules: boolean[][],
  reserved: boolean[][],
  row: number,
  column: number,
  isDark: boolean,
  isReserved = true,
) {
  if (row < 0 || column < 0 || row >= QR_SIZE || column >= QR_SIZE) {
    return;
  }

  modules[row][column] = isDark;
  if (isReserved) {
    reserved[row][column] = true;
  }
}

function drawFinder(modules: boolean[][], reserved: boolean[][], row: number, column: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const targetRow = row + dy;
      const targetColumn = column + dx;
      const isInFinder = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      const isBorder = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const isCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;

      setModule(modules, reserved, targetRow, targetColumn, isInFinder && (isBorder || isCenter));
    }
  }
}

function drawAlignment(modules: boolean[][], reserved: boolean[][], row: number, column: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dy), Math.abs(dx));
      setModule(modules, reserved, row + dy, column + dx, distance !== 1);
    }
  }
}

function reserveFormatAreas(reserved: boolean[][]) {
  for (let index = 0; index < 9; index += 1) {
    reserved[8][index] = true;
    reserved[index][8] = true;
    reserved[QR_SIZE - 1 - index][8] = true;
    reserved[8][QR_SIZE - 1 - index] = true;
  }
}

function drawFunctionPatterns(modules: boolean[][], reserved: boolean[][]) {
  drawFinder(modules, reserved, 0, 0);
  drawFinder(modules, reserved, 0, QR_SIZE - 7);
  drawFinder(modules, reserved, QR_SIZE - 7, 0);
  drawAlignment(modules, reserved, 30, 30);

  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    setModule(modules, reserved, 6, index, index % 2 === 0);
    setModule(modules, reserved, index, 6, index % 2 === 0);
  }

  setModule(modules, reserved, QR_SIZE - 8, 8, true);
  reserveFormatAreas(reserved);
}

function drawFormatBits(modules: boolean[][], reserved: boolean[][]) {
  for (let index = 0; index < 15; index += 1) {
    const bit = ((FORMAT_BITS_LOW_MASK_0 >>> index) & 1) === 1;

    if (index < 6) {
      setModule(modules, reserved, 8, index, bit);
    } else if (index < 8) {
      setModule(modules, reserved, 8, index + 1, bit);
    } else {
      setModule(modules, reserved, 14 - index, 8, bit);
    }

    if (index < 8) {
      setModule(modules, reserved, QR_SIZE - 1 - index, 8, bit);
    } else {
      setModule(modules, reserved, 8, QR_SIZE - 15 + index, bit);
    }
  }

  setModule(modules, reserved, QR_SIZE - 8, 8, true);
}

function shouldMask(row: number, column: number) {
  return (row + column) % 2 === 0;
}

function placeData(modules: boolean[][], reserved: boolean[][], codewords: number[]) {
  const bits = codewords.flatMap((codeword) => {
    const codewordBits: number[] = [];
    appendBits(codewordBits, codeword, 8);
    return codewordBits;
  });
  let bitIndex = 0;
  let upward = true;

  for (let column = QR_SIZE - 1; column > 0; column -= 2) {
    if (column === 6) {
      column -= 1;
    }

    for (let offset = 0; offset < QR_SIZE; offset += 1) {
      const row = upward ? QR_SIZE - 1 - offset : offset;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const targetColumn = column - columnOffset;

        if (reserved[row][targetColumn]) {
          continue;
        }

        const rawBit = bits[bitIndex] === 1;
        modules[row][targetColumn] = rawBit !== shouldMask(row, targetColumn);
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createQrSvg(value: string) {
  const modules = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  const reserved = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  const dataCodewords = createDataCodewords(value);
  const codewords = [...dataCodewords, ...createErrorCorrection(dataCodewords)];

  drawFunctionPatterns(modules, reserved);
  placeData(modules, reserved, codewords);
  drawFormatBits(modules, reserved);

  const quietZone = 4;
  const viewBoxSize = QR_SIZE + quietZone * 2;
  const paths: string[] = [];

  for (let row = 0; row < QR_SIZE; row += 1) {
    for (let column = 0; column < QR_SIZE; column += 1) {
      if (modules[row][column]) {
        paths.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges" role="img" aria-label="QR ${escapeXml(value)}">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>`,
    `<path d="${paths.join("")}" fill="#12110f"/>`,
    `</svg>`,
  ].join("");
}
