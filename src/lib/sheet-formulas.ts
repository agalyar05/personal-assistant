/** Lightweight spreadsheet formulas: SUM, AVG, MIN, MAX, COUNT, ABS, ROUND, + - * / ^, A1 refs. */

export type SheetCells = Record<string, string>;

export type ThinkingSheetData = {
  colCount: number;
  rowCount: number;
  cells: SheetCells;
};

export const DEFAULT_THINKING_SHEET: ThinkingSheetData = {
  colCount: 12,
  rowCount: 30,
  cells: {},
};

export function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function colIndex(letter: string): number {
  const u = letter.toUpperCase();
  let n = 0;
  for (let i = 0; i < u.length; i++) {
    n = n * 26 + (u.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function cellAddr(row: number, col: number): string {
  return `${colLetter(col)}${row + 1}`;
}

export function parseAddr(ref: string): { row: number; col: number } | null {
  const m = ref.trim().match(/^\$?([A-Za-z]+)\$?(\d+)$/);
  if (!m) return null;
  const col = colIndex(m[1]!);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0 || !Number.isFinite(row)) return null;
  return { row, col };
}

export function expandRange(a: string, b: string): string[] {
  const pa = parseAddr(a);
  const pb = parseAddr(b);
  if (!pa || !pb) return [];
  const out: string[] = [];
  for (let r = Math.min(pa.row, pb.row); r <= Math.max(pa.row, pb.row); r++) {
    for (let c = Math.min(pa.col, pb.col); c <= Math.max(pa.col, pb.col); c++) {
      out.push(cellAddr(r, c));
    }
  }
  return out;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t.startsWith("=")) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type EvalResult = number | string;

export function evaluateCell(
  addr: string,
  cells: SheetCells,
  cache: Map<string, EvalResult> = new Map(),
  visiting: Set<string> = new Set(),
): EvalResult {
  const key = addr.toUpperCase();
  if (cache.has(key)) return cache.get(key)!;
  if (visiting.has(key)) return "#CYCLE!";
  visiting.add(key);

  const raw = (cells[key] ?? "").trim();
  let result: EvalResult = "";

  if (!raw) result = "";
  else if (!raw.startsWith("=")) {
    const n = toNumber(raw);
    result = n !== null ? n : raw;
  } else {
    try {
      result = evalFormula(raw.slice(1), (ref) =>
        evaluateCell(ref, cells, cache, visiting),
      );
    } catch {
      result = "#ERR!";
    }
  }

  visiting.delete(key);
  cache.set(key, result);
  return result;
}

export function displayValue(addr: string, cells: SheetCells): string {
  const raw = cells[addr.toUpperCase()] ?? "";
  if (!raw.trim().startsWith("=")) return raw;
  const v = evaluateCell(addr, cells);
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e10) / 1e10);
  }
  return String(v);
}

function tokenize(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ("+-*/^(),:".includes(c)) {
      out.push(c);
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let s = q;
      while (j < expr.length && expr[j] !== q) {
        s += expr[j];
        j++;
      }
      s += expr[j] === q ? q : "";
      out.push(s);
      i = j + (expr[j] === q ? 1 : 0);
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) j++;
      out.push(expr.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j]!)) j++;
      out.push(expr.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`bad char ${c}`);
  }
  return out;
}

function evalFormula(
  expr: string,
  resolve: (ref: string) => EvalResult,
): EvalResult {
  const tokens = tokenize(expr);
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  function numsFromArg(arg: string): number[] {
    if (arg.startsWith("__N__:")) return [Number(arg.slice(6))];
    if (/^[A-Za-z]+\d+:[A-Za-z]+\d+$/i.test(arg)) {
      const [a, b] = arg.split(":");
      const out: number[] = [];
      for (const addr of expandRange(a!, b!)) {
        const n = toNumber(resolve(addr));
        if (n !== null) out.push(n);
      }
      return out;
    }
    if (/^[A-Za-z]+\d+$/i.test(arg)) {
      const n = toNumber(resolve(arg.toUpperCase()));
      return n !== null ? [n] : [];
    }
    const n = toNumber(arg);
    return n !== null ? [n] : [];
  }

  function callFn(name: string, args: string[]): EvalResult {
    const nums = args.flatMap(numsFromArg);
    switch (name) {
      case "SUM":
        return nums.reduce((a, b) => a + b, 0);
      case "AVG":
      case "AVERAGE":
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      case "MIN":
        return nums.length ? Math.min(...nums) : 0;
      case "MAX":
        return nums.length ? Math.max(...nums) : 0;
      case "COUNT":
        return nums.length;
      case "ABS":
        return nums.length ? Math.abs(nums[0]!) : 0;
      case "ROUND": {
        const n = nums[0] ?? 0;
        const d = nums[1] ?? 0;
        const f = 10 ** d;
        return Math.round(n * f) / f;
      }
      default:
        return "#NAME?";
    }
  }

  function parseArgList(): string[] {
    const parts: string[] = [];
    if (peek() === ")") return parts;
    while (peek() !== undefined && peek() !== ")") {
      if (peek() && /^[A-Za-z]+\d+$/i.test(peek()!) && tokens[i + 1] === ":") {
        const a = take()!;
        take();
        const b = take()!;
        parts.push(`${a.toUpperCase()}:${b.toUpperCase()}`);
      } else if (peek() && /^[A-Za-z]+\d+$/i.test(peek()!) && tokens[i + 1] !== "(") {
        parts.push(take()!.toUpperCase());
      } else {
        const v = parseExpr();
        if (typeof v === "number") parts.push(`__N__:${v}`);
        else parts.push(String(v));
      }
      if (peek() === ",") {
        take();
        continue;
      }
      break;
    }
    return parts;
  }

  function parsePrimary(): EvalResult {
    const t = take();
    if (t === undefined) throw new Error("eof");
    if (t === "(") {
      const v = parseExpr();
      if (take() !== ")") throw new Error(")");
      return v;
    }
    if (t === "-") {
      const v = parsePrimary();
      const n = toNumber(v);
      if (n === null) throw new Error("unary");
      return -n;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/i.test(t) && peek() === "(") {
      const name = t.toUpperCase();
      take();
      const args = parseArgList();
      if (take() !== ")") throw new Error(")");
      return callFn(name, args);
    }
    if (/^[A-Za-z]+\d+$/i.test(t)) {
      if (peek() === ":") {
        take();
        take(); // end of bare range — use start
      }
      return resolve(t.toUpperCase());
    }
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1);
    }
    throw new Error(`tok ${t}`);
  }

  function parseFactor(): EvalResult {
    let left = parsePrimary();
    while (peek() === "*" || peek() === "/" || peek() === "^") {
      const op = take()!;
      const right = parsePrimary();
      const a = toNumber(left);
      const b = toNumber(right);
      if (a === null || b === null) throw new Error("num");
      if (op === "*") left = a * b;
      else if (op === "/") left = b === 0 ? "#DIV/0!" : a / b;
      else left = a ** b;
      if (typeof left === "string") return left;
    }
    return left;
  }

  function parseExpr(): EvalResult {
    let left = parseFactor();
    while (peek() === "+" || peek() === "-") {
      const op = take()!;
      const right = parseFactor();
      const a = toNumber(left);
      const b = toNumber(right);
      if (a === null || b === null) throw new Error("num");
      left = op === "+" ? a + b : a - b;
    }
    return left;
  }

  const value = parseExpr();
  if (i < tokens.length) throw new Error("trail");
  return value;
}

/** Shift A1 refs in a formula by dRow/dCol (fill handle). Respects $ absolute refs. */
export function shiftFormula(raw: string, dRow: number, dCol: number): string {
  if (!raw.startsWith("=")) return raw;
  return (
    "=" +
    raw.slice(1).replace(/(\$)?([A-Za-z]+)(\$)?(\d+)/g, (_full, cAbs, letters, rAbs, rowStr) => {
      let col = colIndex(letters);
      let row = Number(rowStr) - 1;
      if (!cAbs) col += dCol;
      if (!rAbs) row += dRow;
      if (col < 0 || row < 0) return `${cAbs || ""}${letters}${rAbs || ""}${rowStr}`;
      return `${cAbs || ""}${colLetter(col)}${rAbs || ""}${row + 1}`;
    })
  );
}

export function normalizeThinkingSheet(
  raw: Partial<ThinkingSheetData> | null | undefined,
): ThinkingSheetData {
  const cells: SheetCells = {};
  for (const [k, v] of Object.entries(raw?.cells || {})) {
    if (v == null || v === "") continue;
    cells[k.toUpperCase()] = String(v);
  }
  return {
    colCount: Math.max(4, Math.min(52, Number(raw?.colCount) || 12)),
    rowCount: Math.max(5, Math.min(200, Number(raw?.rowCount) || 30)),
    cells,
  };
}
