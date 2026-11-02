/**
 * Pure JavaScript QR Code Generator (ISO/IEC 18004)
 * Supports Byte mode (UTF-8), Versions 1-40, Error Correction Levels L, M, Q, H.
 * Zero external dependencies. Works offline via file:// protocol.
 */
(function (global) {
  'use strict';

  // Error Correction Level constants
  const EC_LEVEL = { L: 0, M: 1, Q: 2, H: 3 };
  const EC_FORMAT_BITS = [1, 0, 3, 2]; // L=01, M=00, Q=11, H=10

  // Galois Field GF(2^8) tables (primitive polynomial 0x11D)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      const next = new Uint8Array(poly.length + 1);
      const root = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      for (let j = 0; j < ecLen - 1; j++) {
        rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      rem[ecLen - 1] = gfMul(gen[ecLen], factor);
    }
    return rem;
  }

  // Number of error correction codewords per block and block structure for versions 1..40
  // Format per version (1-indexed): [L, M, Q, H], where each entry is [ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
  const EC_BLOCKS = [
    null,
    [[7,1,19,0,0],[10,1,16,0,0],[13,1,13,0,0],[17,1,9,0,0]],
    [[10,1,34,0,0],[16,1,28,0,0],[22,1,22,0,0],[28,1,16,0,0]],
    [[15,1,55,0,0],[26,1,44,0,0],[18,2,17,0,0],[22,2,13,0,0]],
    [[20,1,80,0,0],[18,2,32,0,0],[26,2,24,0,0],[16,4,9,0,0]],
    [[26,1,108,0,0],[24,2,43,0,0],[18,2,15,2,16],[22,2,11,2,12]],
    [[18,2,68,0,0],[16,4,27,0,0],[24,4,19,0,0],[28,4,15,0,0]],
    [[20,2,78,0,0],[18,4,31,0,0],[18,2,14,4,15],[26,4,13,1,14]],
    [[24,2,97,0,0],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]],
    [[30,2,116,0,0],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]],
    [[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]],
    [[20,4,81,0,0],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]],
    [[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]],
    [[26,4,107,0,0],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]],
    [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
    [[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]],
    [[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]],
    [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
    [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
    [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
    [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
    [[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]],
    [[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]],
    [[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
    [[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
    [[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
    [[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
    [[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
    [[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
    [[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
    [[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
    [[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
    [[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
    [[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
    [[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
    [[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
    [[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
    [[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
    [[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
    [[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
    [[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]
  ];

  function getAlignmentPatternPositions(version) {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    let step;
    if (version === 32) {
      step = 26;
    } else {
      step = Math.ceil((size - 13) / (2 * numAlign - 2)) * 2;
    }
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  function getCharCountIndicatorBits(version) {
    return version < 10 ? 8 : 16;
  }

  function getTotalDataCodewords(version, ecLevel) {
    const b = EC_BLOCKS[version][ecLevel];
    return b[1] * b[2] + b[3] * b[4];
  }

  function encodeUTF8(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const utf8 = [];
    for (let i = 0; i < str.length; i++) {
      let charcode = str.charCodeAt(i);
      if (charcode < 0x80) utf8.push(charcode);
      else if (charcode < 0x800) {
        utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
      } else if (charcode < 0xd800 || charcode >= 0xe000) {
        utf8.push(
          0xe0 | (charcode >> 12),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f)
        );
      } else {
        i++;
        charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        utf8.push(
          0xf0 | (charcode >> 18),
          0x80 | ((charcode >> 12) & 0x3f),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f)
        );
      }
    }
    return new Uint8Array(utf8);
  }

  function selectVersion(dataBytesLen, ecLevel) {
    for (let v = 1; v <= 40; v++) {
      const capacityBits = getTotalDataCodewords(v, ecLevel) * 8;
      const neededBits = 4 + getCharCountIndicatorBits(v) + dataBytesLen * 8;
      if (neededBits <= capacityBits) return v;
    }
    throw new Error('데이터가 너무 길어 QR 코드로 변환할 수 없습니다.');
  }

  function buildDataCodewords(dataBytes, version, ecLevel) {
    const totalCodewords = getTotalDataCodewords(version, ecLevel);
    const totalBitsCapacity = totalCodewords * 8;
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }

    // Byte mode indicator (0100)
    pushBits(0b0100, 4);
    // Character count indicator
    pushBits(dataBytes.length, getCharCountIndicatorBits(version));
    // Data bytes
    for (let i = 0; i < dataBytes.length; i++) {
      pushBits(dataBytes[i], 8);
    }
    // Terminator (up to 4 zero bits)
    const terminatorLen = Math.min(4, totalBitsCapacity - bits.length);
    pushBits(0, terminatorLen);
    // Pad to byte boundary
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }
    // Pad codewords (0xEC, 0x11 alternating)
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < totalBitsCapacity) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    const codewords = new Uint8Array(totalCodewords);
    for (let i = 0; i < totalCodewords; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        byte = (byte << 1) | bits[i * 8 + b];
      }
      codewords[i] = byte;
    }
    return codewords;
  }

  function interleaveBlocks(dataCodewords, version, ecLevel) {
    const [ecLen, g1Blocks, g1DataLen, g2Blocks, g2DataLen] = EC_BLOCKS[version][ecLevel];
    const blocksData = [];
    const blocksEc = [];
    let offset = 0;

    for (let i = 0; i < g1Blocks; i++) {
      const slice = dataCodewords.subarray(offset, offset + g1DataLen);
      offset += g1DataLen;
      blocksData.push(slice);
      blocksEc.push(rsEncode(slice, ecLen));
    }
    for (let i = 0; i < g2Blocks; i++) {
      const slice = dataCodewords.subarray(offset, offset + g2DataLen);
      offset += g2DataLen;
      blocksData.push(slice);
      blocksEc.push(rsEncode(slice, ecLen));
    }

    const maxDataLen = Math.max(g1DataLen, g2DataLen);
    const result = [];

    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < blocksData.length; b++) {
        if (i < blocksData[b].length) {
          result.push(blocksData[b][i]);
        }
      }
    }
    for (let i = 0; i < ecLen; i++) {
      for (let b = 0; b < blocksEc.length; b++) {
        result.push(blocksEc[b][i]);
      }
    }

    return new Uint8Array(result);
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

    function setFunctionModule(r, c, isDark) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = isDark ? 1 : 0;
      isFunction[r][c] = 1;
    }

    function drawFinderPattern(centerR, centerC) {
      for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          const r = centerR + dr;
          const c = centerC + dc;
          if (r >= 0 && r < size && c >= 0 && c < size) {
            const isDark = dist !== 2 && dist !== 4;
            setFunctionModule(r, c, isDark);
          }
        }
      }
    }

    function drawAlignmentPattern(centerR, centerC) {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunctionModule(centerR + dr, centerC + dc, dist !== 1);
        }
      }
    }

    // Finder patterns
    drawFinderPattern(3, 3);
    drawFinderPattern(3, size - 4);
    drawFinderPattern(size - 4, 3);

    // Timing patterns
    for (let i = 0; i < size; i++) {
      if (!isFunction[6][i]) setFunctionModule(6, i, i % 2 === 0);
      if (!isFunction[i][6]) setFunctionModule(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    const alignPos = getAlignmentPatternPositions(version);
    for (let i = 0; i < alignPos.length; i++) {
      for (let j = 0; j < alignPos.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === alignPos.length - 1) ||
          (i === alignPos.length - 1 && j === 0)
        ) {
          continue;
        }
        drawAlignmentPattern(alignPos[i], alignPos[j]);
      }
    }

    // Reserve format information areas
    for (let i = 0; i <= 8; i++) {
      if (!isFunction[8][i]) setFunctionModule(8, i, false);
      if (!isFunction[i][8]) setFunctionModule(i, 8, false);
      if (i < 8) {
        if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
        if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
      }
    }
    // Dark module
    setFunctionModule(size - 8, 8, true);

    // Version information (for version >= 7)
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      }
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunctionModule(a, b, bit);
        setFunctionModule(b, a, bit);
      }
    }

    return { size, modules, isFunction };
  }

  function placeDataBits(matrix, codewords) {
    const { size, modules, isFunction } = matrix;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;

    // Zigzag upward and downward pairs of columns from right to left
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // Skip vertical timing pattern column
      const upward = ((right + 1) & 2) === 0;
      for (let v = 0; v < size; v++) {
        const r = upward ? size - 1 - v : v;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunction[r][c]) {
            let dark = 0;
            if (bitIdx < totalBits) {
              dark = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            modules[r][c] = dark;
          }
        }
      }
    }
  }

  function getMaskBit(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function drawFormatBits(modules, size, ecLevel, mask) {
    const data = (EC_FORMAT_BITS[ecLevel] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;

    const bitAt = (i) => ((bits >>> i) & 1);

    // Top-left format bits
    for (let i = 0; i <= 5; i++) modules[8][i] = bitAt(i);
    modules[8][7] = bitAt(6);
    modules[8][8] = bitAt(7);
    modules[7][8] = bitAt(8);
    for (let i = 9; i < 15; i++) modules[14 - i][8] = bitAt(i);

    // Top-right and bottom-left format bits
    for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bitAt(i);
    for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bitAt(i);
    modules[size - 8][8] = 1; // Dark module
  }

  function applyMask(modules, isFunction, size, mask) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r][c] && getMaskBit(mask, r, c)) {
          modules[r][c] ^= 1;
        }
      }
    }
  }

  function computePenalty(modules, size) {
    let penalty = 0;

    // Rule 1: 5+ consecutive same-colored modules in row/col
    for (let r = 0; r < size; r++) {
      let runColor = modules[r][0];
      let runLen = 1;
      for (let c = 1; c < size; c++) {
        if (modules[r][c] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty += 1;
        } else {
          runColor = modules[r][c];
          runLen = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let runColor = modules[0][c];
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (modules[r][c] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty += 1;
        } else {
          runColor = modules[r][c];
          runLen = 1;
        }
      }
    }

    // Rule 2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const color = modules[r][c];
        if (
          color === modules[r][c + 1] &&
          color === modules[r + 1][c] &&
          color === modules[r + 1][c + 1]
        ) {
          penalty += 3;
        }
      }
    }

    // Rule 3: Finder-like patterns (1:1:3:1:1 with 4 light on either side)
    function hasFinderLike(line) {
      let count = 0;
      for (let i = 0; i <= line.length - 11; i++) {
        // 10111010000 or 00001011101
        if (
          line[i] === 1 && line[i+1] === 0 && line[i+2] === 1 && line[i+3] === 1 &&
          line[i+4] === 1 && line[i+5] === 0 && line[i+6] === 1 && line[i+7] === 0 &&
          line[i+8] === 0 && line[i+9] === 0 && line[i+10] === 0
        ) {
          count++;
        }
        if (
          line[i] === 0 && line[i+1] === 0 && line[i+2] === 0 && line[i+3] === 0 &&
          line[i+4] === 1 && line[i+5] === 0 && line[i+6] === 1 && line[i+7] === 1 &&
          line[i+8] === 1 && line[i+9] === 0 && line[i+10] === 1
        ) {
          count++;
        }
      }
      return count * 40;
    }

    for (let r = 0; r < size; r++) {
      penalty += hasFinderLike(modules[r]);
    }
    const colBuf = new Uint8Array(size);
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) colBuf[r] = modules[r][c];
      penalty += hasFinderLike(colBuf);
    }

    // Rule 4: Balance of dark and light modules
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) darkCount++;
      }
    }
    const total = size * size;
    const k = Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1;
    if (k > 0) penalty += k * 10;

    return penalty;
  }

  /**
   * Generates a QR Code matrix for the given text and options.
   * @param {string} text - Input text/URL
   * @param {object} options - { ecLevel: 'L'|'M'|'Q'|'H' }
   * @returns {{ size: number, version: number, ecLevel: string, modules: Uint8Array[] }}
   */
  function generate(text, options = {}) {
    const ecStr = (options.ecLevel || 'M').toUpperCase();
    const ecLevel = EC_LEVEL[ecStr] !== undefined ? EC_LEVEL[ecStr] : EC_LEVEL.M;
    const dataBytes = encodeUTF8(text);
    const version = selectVersion(dataBytes.length, ecLevel);
    const dataCodewords = buildDataCodewords(dataBytes, version, ecLevel);
    const allCodewords = interleaveBlocks(dataCodewords, version, ecLevel);

    const matrix = createMatrix(version);
    placeDataBits(matrix, allCodewords);

    let bestMask = 0;
    let lowestPenalty = Infinity;

    for (let mask = 0; mask < 8; mask++) {
      applyMask(matrix.modules, matrix.isFunction, matrix.size, mask);
      drawFormatBits(matrix.modules, matrix.size, ecLevel, mask);
      const penalty = computePenalty(matrix.modules, matrix.size);
      if (penalty < lowestPenalty) {
        lowestPenalty = penalty;
        bestMask = mask;
      }
      // Undo mask
      applyMask(matrix.modules, matrix.isFunction, matrix.size, mask);
    }

    applyMask(matrix.modules, matrix.isFunction, matrix.size, bestMask);
    drawFormatBits(matrix.modules, matrix.size, ecLevel, bestMask);

    return {
      size: matrix.size,
      version,
      ecLevel: ecStr,
      modules: matrix.modules
    };
  }

  /**
   * Renders a QR Code onto a Canvas element.
   */
  function renderToCanvas(canvas, qrData, renderOpts = {}) {
    const {
      pixelSize = 320,
      margin = 4,
      darkColor = '#111827',
      lightColor = '#ffffff',
      rounded = false
    } = renderOpts;

    const totalModules = qrData.size + margin * 2;
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, pixelSize, pixelSize);

    const scale = pixelSize / totalModules;
    ctx.fillStyle = darkColor;

    for (let r = 0; r < qrData.size; r++) {
      for (let c = 0; c < qrData.size; c++) {
        if (qrData.modules[r][c]) {
          const x = (c + margin) * scale;
          const y = (r + margin) * scale;
          if (rounded) {
            const radius = scale * 0.35;
            ctx.beginPath();
            ctx.roundRect(x, y, scale + 0.35, scale + 0.35, radius);
            ctx.fill();
          } else {
            // Slight overlap (+0.4px) prevents subpixel anti-aliasing gaps
            ctx.fillRect(
              Math.floor(x),
              Math.floor(y),
              Math.ceil(scale),
              Math.ceil(scale)
            );
          }
        }
      }
    }
  }

  /**
   * Renders a QR Code to an SVG string.
   */
  function renderToSVG(qrData, renderOpts = {}) {
    const {
      pixelSize = 320,
      margin = 4,
      darkColor = '#111827',
      lightColor = '#ffffff',
      rounded = false
    } = renderOpts;

    const totalModules = qrData.size + margin * 2;
    let paths = '';
    const rx = rounded ? ' rx="0.35" ry="0.35"' : '';

    for (let r = 0; r < qrData.size; r++) {
      for (let c = 0; c < qrData.size; c++) {
        if (qrData.modules[r][c]) {
          paths += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"${rx}/>`;
        }
      }
    }

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${pixelSize}" height="${pixelSize}" shape-rendering="${rounded ? 'geometricPrecision' : 'crispEdges'}">`,
      `<rect width="100%" height="100%" fill="${lightColor}"/>`,
      `<g fill="${darkColor}">${paths}</g>`,
      `</svg>`
    ].join('');
  }

  global.QRGenerator = {
    generate,
    renderToCanvas,
    renderToSVG
  };
})(window);

