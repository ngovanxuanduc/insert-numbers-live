/**
 * Bộ tính biểu thức nhỏ cho cú pháp `=...` và `{!...}`. Tự parse, không dùng eval.
 *
 * Toán tử (ưu tiên từ thấp đến cao): `?:`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, `- + !` (một ngôi), `**`.
 * `+` nối chuỗi nếu một trong hai vế là chuỗi.
 */

import { charset, CLASS_LETTERS, DEFAULT_CLASSES, newSite, randomInt, randomString, Rng, rngFor, uuid } from './random';

export type Value = number | string;

/** Thông tin của cursor đang được tính. */
export interface Env {
  /** Số thứ tự, bắt đầu từ 0. */
  i: number;
  /** Tổng số cursor. */
  count: number;
  /** Dòng và cột của cursor, bắt đầu từ 1. */
  line: number;
  col: number;
  /** Text đang bôi đen tại cursor (rỗng nếu không bôi đen). */
  text: string;
  /** Seed cho random, giữ nguyên trong một lần mở ô nhập. */
  seed?: number;
  /** Đổi salt để sinh lại khi giá trị random bị trùng với cursor trước. */
  salt?: number;
}

export type Compiled = (env: Env) => Value;

export const VARIABLES: Record<string, (env: Env) => Value> = {
  i: (e) => e.i,
  n: (e) => e.i + 1,
  count: (e) => e.count,
  line: (e) => e.line,
  col: (e) => e.col,
  s: (e) => e.text,
  x: (e) => toNum(e.text),
};

/**
 * Hàm thường dùng `call`; hàm random dùng `random` và nhận thêm rng riêng của cursor.
 * `check` kiểm tra lúc parse các tham số viết cố định (undefined = tham số tính theo cursor), trả về thông báo lỗi.
 */
type Fn = { min: number; max: number; check?: (consts: (Value | undefined)[]) => string | undefined } & (
  | { call: (...args: Value[]) => Value }
  | { random: (rng: Rng, ...args: Value[]) => Value }
);

/** Giá trị của các literal, để `check` biết tham số nào viết cố định. */
const constants = new WeakMap<Compiled, Value>();

const num1 = (f: (v: number) => number): Fn => ({ min: 1, max: 1, call: (v) => f(toNum(v)) });

export const FUNCTIONS: Record<string, Fn> = {
  abs: num1(Math.abs),
  floor: num1(Math.floor),
  ceil: num1(Math.ceil),
  sqrt: num1(Math.sqrt),
  round: {
    min: 1,
    max: 2,
    call: (v, places = 0) => {
      const p = 10 ** toNum(places);
      return Math.round(toNum(v) * p) / p;
    },
  },
  min: { min: 1, max: Infinity, call: (...vs) => Math.min(...vs.map(toNum)) },
  max: { min: 1, max: Infinity, call: (...vs) => Math.max(...vs.map(toNum)) },
  pow: { min: 2, max: 2, call: (a, b) => toNum(a) ** toNum(b) },
  num: { min: 1, max: 1, call: (v) => toNum(v) },
  len: { min: 1, max: 1, call: (v) => toStr(v).length },
  upper: { min: 1, max: 1, call: (v) => toStr(v).toUpperCase() },
  lower: { min: 1, max: 1, call: (v) => toStr(v).toLowerCase() },
  pad: {
    min: 2,
    max: 3,
    call: (v, width, ch = '0') => {
      const s = toStr(v);
      const w = toNum(width);
      // pad(-5, 3) -> "-05": giữ dấu trừ ở đầu khi pad bằng số 0.
      if (typeof v === 'number' && v < 0 && toStr(ch) === '0') {
        return '-' + s.slice(1).padStart(w - 1, '0');
      }
      return s.padStart(w, toStr(ch) || ' ');
    },
  },
  hex: { min: 1, max: 2, call: (v, w = 0) => radix(v, 16, w) },
  bin: { min: 1, max: 2, call: (v, w = 0) => radix(v, 2, w) },
  oct: { min: 1, max: 2, call: (v, w = 0) => radix(v, 8, w) },
  roman: { min: 1, max: 1, call: (v) => toRoman(toNum(v)) },
  alpha: { min: 1, max: 1, call: (v) => toAlpha(toNum(v)) },
  rand: { min: 2, max: 2, random: (rng, a, b) => randomInt(rng, toNum(a), toNum(b)) },
  randstr: {
    min: 1,
    max: 2,
    check: ([, classes]) =>
      typeof classes === 'string' && !charset(classes)
        ? `randstr: character classes are ${CLASS_LETTERS.split('').join(', ')}.`
        : undefined,
    // Lớp ký tự tính theo cursor mà sai thì ra chuỗi rỗng, không làm hỏng cả lần chèn.
    random: (rng, len, classes = DEFAULT_CLASSES) => randomString(rng, toNum(len), charset(toStr(classes))),
  },
  uuid: { min: 0, max: 0, random: (rng) => uuid(rng) },
  date: {
    min: 1,
    max: 2,
    call: (start, days = 0) => {
      const t = Date.parse(`${toStr(start)}T00:00:00Z`);
      return Number.isNaN(t) ? '' : new Date(t + toNum(days) * 86_400_000).toISOString().slice(0, 10);
    },
  },
};

export function toNum(v: Value): number {
  return typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v);
}

export function toStr(v: Value): string {
  if (typeof v === 'string') {
    return v;
  }
  // Bỏ đuôi lỗi dấu phẩy động: 0.1 + 0.2 -> "0.3".
  return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
}

export function truthy(v: Value): boolean {
  return typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : v !== '';
}

function radix(v: Value, base: number, width: Value): string {
  const n = Math.trunc(toNum(v));
  return (n < 0 ? '-' : '') + Math.abs(n).toString(base).padStart(toNum(width), '0');
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** 1..3999 -> "I".."MMMCMXCIX"; ngoài khoảng đó trả về chuỗi rỗng. */
export function toRoman(n: number): string {
  n = Math.trunc(n);
  if (n < 1 || n > 3999) {
    return '';
  }
  let s = '';
  for (const [v, r] of ROMAN) {
    while (n >= v) {
      s += r;
      n -= v;
    }
  }
  return s;
}

/** Ngược của `toRoman`; trả về NaN nếu không phải số La Mã chuẩn. */
export function fromRoman(s: string): number {
  const upper = s.toUpperCase();
  let n = 0;
  let rest = upper;
  for (const [v, r] of ROMAN) {
    while (rest.startsWith(r)) {
      n += v;
      rest = rest.slice(r.length);
    }
  }
  return rest === '' && toRoman(n) === upper ? n : NaN;
}

/** 1 -> "a", 26 -> "z", 27 -> "aa" (kiểu cột Excel). Giá trị < 1 trả về chuỗi rỗng. */
export function toAlpha(n: number): string {
  n = Math.trunc(n);
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---- Tokenizer ----

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'end' };

const OPS = ['**', '==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ','];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let p = 0;
  while (p < src.length) {
    const rest = src.slice(p);
    let m: RegExpExecArray | null;
    if ((m = /^\s+/.exec(rest))) {
      p += m[0].length;
    } else if ((m = /^0[xX][0-9a-fA-F]+|^\d+(?:\.\d+)?/.exec(rest))) {
      tokens.push({ t: 'num', v: Number(m[0]) });
      p += m[0].length;
    } else if ((m = /^"([^"]*)"|^'([^']*)'/.exec(rest))) {
      tokens.push({ t: 'str', v: m[1] ?? m[2] });
      p += m[0].length;
    } else if ((m = /^[a-zA-Z_]\w*/.exec(rest))) {
      tokens.push({ t: 'id', v: m[0] });
      p += m[0].length;
    } else {
      const op = OPS.find((o) => rest.startsWith(o));
      if (!op) {
        throw new Error(`Unexpected character "${rest[0]}" in expression.`);
      }
      tokens.push({ t: 'op', v: op });
      p += op.length;
    }
  }
  tokens.push({ t: 'end' });
  return tokens;
}

// ---- Parser (Pratt) ----

const BINARY: Record<string, { bp: number; right?: boolean; f: (a: Value, b: Value) => Value }> = {
  '||': { bp: 2, f: (a, b) => (truthy(a) ? a : b) },
  '&&': { bp: 3, f: (a, b) => (truthy(a) ? b : a) },
  '==': { bp: 4, f: (a, b) => Number(eq(a, b)) },
  '!=': { bp: 4, f: (a, b) => Number(!eq(a, b)) },
  '<': { bp: 5, f: (a, b) => Number(cmp(a, b) < 0) },
  '<=': { bp: 5, f: (a, b) => Number(cmp(a, b) <= 0) },
  '>': { bp: 5, f: (a, b) => Number(cmp(a, b) > 0) },
  '>=': { bp: 5, f: (a, b) => Number(cmp(a, b) >= 0) },
  '+': { bp: 6, f: (a, b) => (typeof a === 'string' || typeof b === 'string' ? toStr(a) + toStr(b) : a + b) },
  '-': { bp: 6, f: (a, b) => toNum(a) - toNum(b) },
  '*': { bp: 7, f: (a, b) => toNum(a) * toNum(b) },
  '/': { bp: 7, f: (a, b) => toNum(a) / toNum(b) },
  // % luôn ra số không âm để i % 3 hay (i - 1) % 3 dùng làm vòng lặp được.
  '%': { bp: 7, f: (a, b) => ((toNum(a) % toNum(b)) + toNum(b)) % toNum(b) },
  '**': { bp: 9, right: true, f: (a, b) => toNum(a) ** toNum(b) },
};
const TERNARY_BP = 1;
const UNARY_BP = 8;

function eq(a: Value, b: Value): boolean {
  return typeof a === typeof b ? a === b : toNum(a) === toNum(b);
}

function cmp(a: Value, b: Value): number {
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return toNum(a) - toNum(b);
}

/** Biên dịch biểu thức; ném Error với thông báo tiếng Việt nếu sai cú pháp. */
export function compile(src: string): Compiled {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => {
    const t = peek();
    return t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) {
      throw new Error(`Missing "${v}" in expression.`);
    }
    p++;
  };

  const prefix = (): Compiled => {
    const t = tokens[p++];
    switch (t.t) {
      case 'num':
      case 'str': {
        const v = t.v;
        const literal: Compiled = () => v;
        constants.set(literal, v);
        return literal;
      }
      case 'id': {
        if (isOp('(')) {
          return call(t.v);
        }
        const variable = VARIABLES[t.v];
        if (!variable) {
          throw new Error(`Unknown variable "${t.v}". Available: ${Object.keys(VARIABLES).join(', ')}.`);
        }
        return variable;
      }
      case 'op':
        if (t.v === '(') {
          const inner = expr(0);
          expect(')');
          return inner;
        }
        if (t.v === '-' || t.v === '+' || t.v === '!') {
          const operand = expr(UNARY_BP);
          if (t.v === '-') {
            return (e) => -toNum(operand(e));
          }
          if (t.v === '+') {
            return (e) => toNum(operand(e));
          }
          return (e) => Number(!truthy(operand(e)));
        }
        throw new Error(`Unexpected "${t.v}" in expression.`);
      case 'end':
        throw new Error('Expression is incomplete.');
    }
  };

  const call = (name: string): Compiled => {
    const fn = FUNCTIONS[name];
    if (!fn) {
      throw new Error(`Unknown function "${name}". Available: ${Object.keys(FUNCTIONS).join(', ')}.`);
    }
    expect('(');
    const args: Compiled[] = [];
    if (!isOp(')')) {
      do {
        args.push(expr(0));
      } while (isOp(',') && ++p);
    }
    expect(')');
    if (args.length < fn.min || args.length > fn.max) {
      const want = fn.min === fn.max ? `${fn.min}` : fn.max === Infinity ? `at least ${fn.min}` : `${fn.min}-${fn.max}`;
      throw new Error(`${name}() takes ${want} argument${want === '1' ? '' : 's'}.`);
    }
    const problem = fn.check?.(args.map((a) => constants.get(a)));
    if (problem) {
      throw new Error(problem);
    }
    if ('random' in fn) {
      const site = newSite();
      return (e) => fn.random(rngFor(e.seed ?? 0, e.i, site, e.salt ?? 0), ...args.map((a) => a(e)));
    }
    return (e) => fn.call(...args.map((a) => a(e)));
  };

  const expr = (minBp: number): Compiled => {
    let left = prefix();
    for (;;) {
      const t = peek();
      if (t.t !== 'op') {
        break;
      }
      if (t.v === '?' && TERNARY_BP >= minBp) {
        p++;
        const cond = left;
        const yes = expr(0);
        expect(':');
        const no = expr(TERNARY_BP);
        left = (e) => (truthy(cond(e)) ? yes(e) : no(e));
        continue;
      }
      const op = BINARY[t.v];
      if (!op || op.bp < minBp) {
        break;
      }
      p++;
      const l = left;
      const r = expr(op.right ? op.bp : op.bp + 1);
      left = (e) => op.f(l(e), r(e));
    }
    return left;
  };

  const result = expr(0);
  if (peek().t !== 'end') {
    const t = peek() as { v: unknown };
    throw new Error(`Unexpected "${t.v}" at end of expression.`);
  }
  return result;
}
