/**
 * Braille art -> dot coordinates. Each character in U+2800-U+28FF is a 2x4 cell; the low 8 bits pick the dots.
 * Any other character (spaces included) is an empty cell, and short lines are padded to the widest line.
 */
export interface BrailleDots {
  cols: number;
  rows: number;
  dots: { x: number; y: number }[];
}

/** [bit, column, row] */
const BITS: [number, number, number][] = [
  [0x01, 0, 0],
  [0x02, 0, 1],
  [0x04, 0, 2],
  [0x08, 1, 0],
  [0x10, 1, 1],
  [0x20, 1, 2],
  [0x40, 0, 3],
  [0x80, 1, 3],
];

export function parseBraille(text: string): BrailleDots {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => Array.from(l));
  while (lines.length && lines[lines.length - 1].every((c) => !/[\u2800-\u28ff]/.test(c))) lines.pop();
  const width = Math.max(0, ...lines.map((l) => l.length));
  const dots: { x: number; y: number }[] = [];
  lines.forEach((line, cy) => {
    line.forEach((ch, cx) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x2800 || code > 0x28ff) return;
      const bits = code & 0xff;
      for (const [bit, col, row] of BITS) if (bits & bit) dots.push({ x: cx * 2 + col, y: cy * 4 + row });
    });
  });
  return { cols: width * 2, rows: lines.length * 4, dots };
}
