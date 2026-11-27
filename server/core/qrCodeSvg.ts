/**
 * Zero-dependency ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC Level L, Versions 1..10).
 * Produces a crisp vector <svg> string for local LAN pairing URLs without external packages.
 */

interface QrVersionInfo {
  version: number;
  size: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocksGroup1: number;
  dataCodewordsGroup1: number;
  numBlocksGroup2: number;
  dataCodewordsGroup2: number;
  alignmentPatterns: number[];
}

// ISO/IEC 18004 Table 9 (ECC Level L) for Versions 1..10
const QR_VERSIONS_L: QrVersionInfo[] = [
  { version: 1, size: 21, totalCodewords: 26, ecCodewordsPerBlock: 7, numBlocksGroup1: 1, dataCodewordsGroup1: 19, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [] },
  { version: 2, size: 25, totalCodewords: 44, ecCodewordsPerBlock: 10, numBlocksGroup1: 1, dataCodewordsGroup1: 34, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, ecCodewordsPerBlock: 15, numBlocksGroup1: 1, dataCodewordsGroup1: 55, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, ecCodewordsPerBlock: 20, numBlocksGroup1: 1, dataCodewordsGroup1: 80, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, ecCodewordsPerBlock: 26, numBlocksGroup1: 1, dataCodewordsGroup1: 108, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 34] },
  { version: 7, size: 45, totalCodewords: 196, ecCodewordsPerBlock: 20, numBlocksGroup1: 2, dataCodewordsGroup1: 78, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22, 38] },
  { version: 8, size: 49, totalCodewords: 242, ecCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 97, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 24, 42] },
  { version: 9, size: 53, totalCodewords: 292, ecCodewordsPerBlock: 30, numBlocksGroup1: 2, dataCodewordsGroup1: 116, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 26, 46] },
  { version: 10, size: 57, totalCodewords: 346, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 2, dataCodewordsGroup2: 69, alignmentPatterns: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = buildGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j += 1) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function pickVersion(byteLength: number): QrVersionInfo {
  for (const info of QR_VERSIONS_L) {
    const totalDataCodewords =
      info.numBlocksGroup1 * info.dataCodewordsGroup1 +
      info.numBlocksGroup2 * info.dataCodewordsGroup2;
    const countBits = info.version <= 9 ? 8 : 16;
    const maxBytes = Math.floor((totalDataCodewords * 8 - 4 - countBits) / 8);
    if (byteLength <= maxBytes) {
      return info;
    }
  }
  throw new Error(`Payload QR terlalu panjang (${byteLength} byte).`);
}

function encodeDataCodewords(bytes: Uint8Array, info: QrVersionInfo): Uint8Array {
  const totalDataCodewords =
    info.numBlocksGroup1 * info.dataCodewordsGroup1 +
    info.numBlocksGroup2 * info.dataCodewordsGroup2;
  const totalBitsCapacity = totalDataCodewords * 8;
  const bits: number[] = [];

  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >>> i) & 1);
    }
  };

  // Mode indicator for Byte mode: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for v1..9, 16 bits for v10+)
  pushBits(bytes.length, info.version <= 9 ? 8 : 16);

  for (let i = 0; i < bytes.length; i += 1) {
    pushBits(bytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, totalBitsCapacity - bits.length);
  pushBits(0, terminatorLen);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalDataCodewords);
  const filledBytes = bits.length / 8;
  for (let i = 0; i < filledBytes; i += 1) {
    let b = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      b = (b << 1) | bits[i * 8 + bit];
    }
    codewords[i] = b;
  }

  const padBytes = [0xec, 0x11];
  for (let i = filledBytes; i < totalDataCodewords; i += 1) {
    codewords[i] = padBytes[(i - filledBytes) % 2];
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: Uint8Array, info: QrVersionInfo): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < info.numBlocksGroup1; b += 1) {
    const slice = dataCodewords.slice(offset, offset + info.dataCodewordsGroup1);
    offset += info.dataCodewordsGroup1;
    dataBlocks.push(slice);
    ecBlocks.push(computeReedSolomon(slice, info.ecCodewordsPerBlock));
  }

  for (let b = 0; b < info.numBlocksGroup2; b += 1) {
    const slice = dataCodewords.slice(offset, offset + info.dataCodewordsGroup2);
    offset += info.dataCodewordsGroup2;
    dataBlocks.push(slice);
    ecBlocks.push(computeReedSolomon(slice, info.ecCodewordsPerBlock));
  }

  const result = new Uint8Array(info.totalCodewords);
  let outIdx = 0;
  const maxDataLen = Math.max(info.dataCodewordsGroup1, info.dataCodewordsGroup2);

  for (let i = 0; i < maxDataLen; i += 1) {
    for (let b = 0; b < dataBlocks.length; b += 1) {
      if (i < dataBlocks[b].length) {
        result[outIdx] = dataBlocks[b][i];
        outIdx += 1;
      }
    }
  }

  for (let i = 0; i < info.ecCodewordsPerBlock; i += 1) {
    for (let b = 0; b < ecBlocks.length; b += 1) {
      result[outIdx] = ecBlocks[b][i];
      outIdx += 1;
    }
  }

  return result;
}

function createBaseMatrix(info: QrVersionInfo): {
  modules: Uint8Array[];
  isFunction: boolean[][];
} {
  const size = info.size;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunction = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark ? 1 : 0;
    isFunction[r][c] = true;
  };

  // Finder patterns + separators (top-left, top-right, bottom-left)
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter =
          dr >= 0 &&
          dr <= 6 &&
          dc >= 0 &&
          dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter || inInner);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = info.alignmentPatterns;
  for (let i = 0; i < align.length; i += 1) {
    for (let j = 0; j < align.length; j += 1) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === align.length - 1) ||
        (i === align.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = align[i];
      const cc = align[j];
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dark =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFunctionModule(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Dark module
  setFunctionModule(4 * info.version + 9, 8, true);

  // Reserve format info areas
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      if (!isFunction[8][i]) setFunctionModule(8, i, false);
      if (!isFunction[i][8]) setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (i < 7 && !isFunction[size - 1 - i][8]) {
      setFunctionModule(size - 1 - i, 8, false);
    }
  }

  // Version info for v >= 7
  if (info.version >= 7) {
    let rem = info.version;
    for (let i = 0; i < 12; i += 1) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const vBits = (info.version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((vBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(b, a, dark);
      setFunctionModule(a, b, dark);
    }
  }

  return { modules, isFunction };
}

function drawFormatBits(modules: Uint8Array[], size: number, mask: number): void {
  // ECC Level L = 01
  const data = (0b01 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bit = (i: number) => ((bits >>> i) & 1) as 0 | 1;

  // Top-left vertical
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);

  // Top-right & bottom-left
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = 1;
}

function placeDataBits(
  modules: Uint8Array[],
  isFunction: boolean[][],
  codewords: Uint8Array,
  size: number
): void {
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c] && bitIdx < totalBits) {
          const dark =
            ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          modules[r][c] = dark ? 1 : 0;
          bitIdx += 1;
        }
      }
    }
  }
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function computePenalty(modules: Uint8Array[], size: number): number {
  let penalty = 0;

  // Rule 1 & Rule 3 along rows and columns
  const scoreLine = (getCell: (idx: number) => number) => {
    let runColor = getCell(0);
    let runLen = 1;
    for (let i = 1; i < size; i += 1) {
      const c = getCell(i);
      if (c === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = c;
        runLen = 1;
      }
    }
  };

  for (let r = 0; r < size; r += 1) scoreLine((c) => modules[r][c]);
  for (let c = 0; c < size; c += 1) scoreLine((r) => modules[r][c]);

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (
        v === modules[r][c + 1] &&
        v === modules[r + 1][c] &&
        v === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  return penalty;
}

export function generateQrCodeMatrix(text: string): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const info = pickVersion(bytes.length);
  const dataCodewords = encodeDataCodewords(bytes, info);
  const allCodewords = interleaveCodewords(dataCodewords, info);
  const { modules: baseModules, isFunction } = createBaseMatrix(info);
  placeDataBits(baseModules, isFunction, allCodewords, info.size);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestMatrix: Uint8Array[] = baseModules;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = baseModules.map((row) => new Uint8Array(row));
    for (let r = 0; r < info.size; r += 1) {
      for (let c = 0; c < info.size; c += 1) {
        if (!isFunction[r][c] && maskBit(mask, r, c)) {
          candidate[r][c] ^= 1;
        }
      }
    }
    drawFormatBits(candidate, info.size, mask);
    const p = computePenalty(candidate, info.size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }

  drawFormatBits(bestMatrix, info.size, bestMask);
  return bestMatrix;
}

export function generateQrCodeSvg(
  text: string,
  options?: { darkColor?: string; lightColor?: string; margin?: number }
): string {
  const matrix = generateQrCodeMatrix(text);
  const size = matrix.length;
  const margin = options?.margin ?? 3;
  const darkColor = options?.darkColor ?? '#1A1415';
  const lightColor = options?.lightColor ?? '#FFFFFF';
  const total = size + margin * 2;

  const paths: string[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c] === 1) {
        paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code Remote Control CPGP"><rect width="${total}" height="${total}" fill="${lightColor}" rx="2"/><path d="${paths.join('')}" fill="${darkColor}"/></svg>`;
}
