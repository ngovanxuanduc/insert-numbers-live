import { compile, Env, fromRoman, toAlpha, toRoman, toStr, truthy } from './expr';
import { charset, CLASS_LETTERS, newSite, randomString, resetSites, rngFor, siteCount, uuid } from './random';

/**
 * Phân tích chuỗi người dùng nhập thành một dãy giá trị.
 *
 * Dãy cơ bản:
 *   1            1, 2, 3…
 *   10:5         10, 15, 20…          (start:step)
 *   001          001, 002, 003…       (số 0 ở đầu = độ rộng pad)
 *   1.5:0.25     1.50, 1.75, 2.00…
 *   0x0a:2       0x0a, 0x0c, 0x0e…
 *   a / AA:2     a, b, c… / AA, AC, AE…  (sau z là aa như cột Excel)
 *   #I / #x:10   I, II, III… / x, xx, xxx… (số La Mã)
 *   2026-01-31:7 2026-01-31, 2026-02-07…  (step tính theo ngày)
 *   Mon,Tue,Wed  Mon, Tue, Wed, Mon…
 *   ?6 / ?8ad    mã ngẫu nhiên 6 ký tự A-Z0-9 / 8 ký tự a-z0-9 (lớp: d a A x X)
 *   ?uuid        UUID v4
 *
 * Hậu tố cho dãy cơ bản: `*k` lặp mỗi giá trị k lần, `%k` quay vòng sau k giá trị (1*2%3 -> 1,1,2,2,3,3,1,1…).
 *
 * Nâng cao:
 *   =i*2+1        biểu thức (xem expr.ts)
 *   item_{001}    template: text thường giữ nguyên, mỗi {…} là một dãy hoặc {=biểu thức}
 *   {1}{!i>=5}    {!điều kiện}: từ cursor đầu tiên thoả điều kiện trở đi thì không chèn nữa
 *   {{ và }}      ghi dấu { và } trong template
 */

export type { Env } from './expr';

export type Kind = 'number' | 'hex' | 'letter' | 'roman' | 'date' | 'list' | 'random' | 'expr' | 'template';

export interface Sequence {
  kind: Kind;
  /** Giá trị cho cursor `env.i`. */
  at(env: Env): string;
  /** True nếu từ cursor này trở đi phải dừng (chỉ có khi template chứa {!…}). */
  stop?(env: Env): boolean;
  /** Có dùng random; khi đó `render` sinh lại để các cursor không trùng nhau. */
  random?: boolean;
}

/** Số lần sinh lại tối đa khi random bị trùng (mã quá ngắn so với số cursor thì đành chấp nhận trùng). */
const MAX_REROLL = 100;

/** Tính giá trị cho từng cursor, dừng ở cursor đầu tiên thoả điều kiện {!…}. */
export function render(seq: Sequence, envs: Env[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const env of envs) {
    if (seq.stop?.(env)) {
      break;
    }
    let value = seq.at(env);
    if (seq.random) {
      for (let salt = 1; seen.has(value) && salt <= MAX_REROLL; salt++) {
        value = seq.at({ ...env, salt });
      }
      seen.add(value);
    }
    out.push(value);
  }
  return out;
}

/** Env giả cho cursor thứ `i` khi chưa có editor (dùng để hiện mẫu và trong test). */
export function sampleEnv(i: number, count: number): Env {
  return { i, count, line: i + 1, col: 1, text: '' };
}

/** Sinh giá trị thứ i của một dãy cơ bản. */
type Gen = (i: number) => string;
type GenResult = { ok: true; kind: Kind; gen: Gen } | { ok: false; error: string };

export type ParseResult = { ok: true; seq: Sequence } | { ok: false; error: string };

export const DEFAULT_INPUT = '1';

const INT = /^[+-]?\d+$/;
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const HEX = /^([+-]?)0([xX])([0-9a-fA-F]+)$/;
const LETTERS = /^[a-zA-Z]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ROMAN_START = /^#([IVXLCDM]+|[ivxlcdm]+)$/;
const RANDOM = /^\?(\d+)([a-zA-Z]*)$/;
const UUID = /^\?uuid$/i;
const MODIFIERS = /^(.*?)((?:\s*[*%]\s*\d+)+)$/s;
const DAY_MS = 86_400_000;

export function parse(input: string): ParseResult {
  try {
    resetSites();
    const r = /[{}]/.test(input) ? parseTemplate(input) : parseSpec(input.trim() || DEFAULT_INPUT);
    if (r.ok && siteCount() > 0) {
      r.seq.random = true;
    }
    return r;
  } catch (e) {
    return fail((e as Error).message);
  }
}

function parseTemplate(input: string): ParseResult {
  const pieces: ((env: Env) => string)[] = [];
  let literal = '';
  let stop: ((env: Env) => boolean) | undefined;
  let p = 0;
  while (p < input.length) {
    const c = input[p];
    if ((c === '{' || c === '}') && input[p + 1] === c) {
      literal += c;
      p += 2;
      continue;
    }
    if (c === '}') {
      throw new Error('Dấu "}" bị lẻ. Muốn ghi dấu } thì dùng "}}".');
    }
    if (c !== '{') {
      literal += c;
      p++;
      continue;
    }
    const close = input.indexOf('}', p + 1);
    if (close < 0) {
      throw new Error('Thiếu "}" đóng. Muốn ghi dấu { thì dùng "{{".');
    }
    const spec = input.slice(p + 1, close).trim();
    p = close + 1;
    if (spec.startsWith('!')) {
      if (stop) {
        throw new Error('Chỉ được có một {!điều kiện}.');
      }
      const cond = compile(spec.slice(1));
      stop = (env) => truthy(cond(env));
      continue;
    }
    const r = parseSpec(spec || DEFAULT_INPUT);
    if (!r.ok) {
      throw new Error(`{${spec}}: ${r.error}`);
    }
    const text = literal;
    literal = '';
    pieces.push(() => text, r.seq.at);
  }
  const tail = literal;
  pieces.push(() => tail);
  return {
    ok: true,
    seq: { kind: 'template', at: (env) => pieces.map((f) => f(env)).join(''), stop },
  };
}

/** Một dãy đứng riêng: biểu thức `=…`, hoặc dãy cơ bản kèm hậu tố `*k` / `%k`. */
function parseSpec(text: string): ParseResult {
  if (text.startsWith('=')) {
    const f = compile(text.slice(1));
    return { ok: true, seq: { kind: 'expr', at: (env) => toStr(f(env)) } };
  }
  if (UUID.test(text)) {
    const site = newSite();
    return { ok: true, seq: { kind: 'random', at: (env) => uuid(rngOf(env, site)) } };
  }
  const rand = RANDOM.exec(text);
  if (rand) {
    const length = Number(rand[1]);
    const chars = charset(rand[2]);
    if (length < 1) {
      return fail('Độ dài mã ngẫu nhiên phải lớn hơn 0.');
    }
    if (!chars) {
      return fail(`Lớp ký tự chỉ gồm ${CLASS_LETTERS.split('').join(', ')} (d số, a chữ thường, A chữ hoa, x/X hex).`);
    }
    const site = newSite();
    return { ok: true, seq: { kind: 'random', at: (env) => randomString(rngOf(env, site), length, chars) } };
  }

  let repeat = 1;
  let cycle = Infinity;
  const m = MODIFIERS.exec(text);
  if (m && m[1].trim()) {
    text = m[1].trim();
    for (const [, op, k] of m[2].matchAll(/([*%])\s*(\d+)/g)) {
      const v = Number(k);
      if (v < 1) {
        return fail(`"${op}${k}" phải lớn hơn 0.`);
      }
      if (op === '*') {
        repeat = v;
      } else {
        cycle = v;
      }
    }
  }

  const r = parseBase(text);
  if (!r.ok) {
    return r;
  }
  const { kind, gen } = r;
  return { ok: true, seq: { kind, at: (env) => gen(Math.floor(env.i / repeat) % cycle) } };
}

function rngOf(env: Env, site: number) {
  return rngFor(env.seed ?? 0, env.i, site, env.salt ?? 0);
}

function parseBase(text: string): GenResult {
  if (text.includes(',')) {
    const items = text.split(',').map((s) => s.trim());
    return gen('list', (i) => items[mod(i, items.length)]);
  }

  const parts = text.split(':');
  if (parts.length > 2) {
    return fail('Chỉ dùng tối đa một dấu ":" (start:step).');
  }
  const [start, stepText] = parts.map((s) => s.trim());
  if (stepText === '') {
    return fail('Thiếu step sau dấu ":".');
  }

  const hex = HEX.exec(start);
  if (hex) {
    return parseHex(hex, stepText);
  }
  const dec = DECIMAL.exec(start);
  if (dec) {
    return parseDecimal(dec, stepText);
  }
  const roman = ROMAN_START.exec(start);
  if (roman) {
    return parseRoman(roman[1], stepText);
  }
  const date = DATE.exec(start);
  if (date) {
    return parseDate(date, stepText);
  }
  if (LETTERS.test(start)) {
    return parseLetters(start, stepText);
  }
  return fail(`Không hiểu "${start}". Thử: 1, 10:5, 001, 0x0a, a, #I, 2026-01-01, Mon,Tue, ?6, =i*2, item_{1}`);
}

function parseDecimal(m: RegExpExecArray, stepText: string | undefined): GenResult {
  const [, sign, intPart, frac = ''] = m;
  const step = stepText === undefined ? 1 : Number(stepText);
  if (stepText !== undefined && !DECIMAL.test(stepText)) {
    return fail(`Step "${stepText}" không phải số.`);
  }
  const places = Math.max(frac.length, decimals(stepText));
  const width = intPart.length > 1 && intPart.startsWith('0') ? intPart.length : 0;
  // Tính trên số nguyên đã nhân 10^places để tránh lỗi làm tròn kiểu 0.1 + 0.2.
  const scale = 10 ** places;
  const base = Math.round(Number(`${sign}${intPart}.${frac || 0}`) * scale);
  const delta = Math.round(step * scale);
  return gen('number', (i) => {
    const v = base + delta * i;
    const abs = (Math.abs(v) / scale).toFixed(places);
    const [whole, rest] = abs.split('.');
    return (v < 0 ? '-' : '') + whole.padStart(width, '0') + (rest === undefined ? '' : `.${rest}`);
  });
}

function parseHex(m: RegExpExecArray, stepText: string | undefined): GenResult {
  const [, sign, x, digits] = m;
  let step = 1;
  if (stepText !== undefined) {
    const h = HEX.exec(stepText);
    if (h) {
      step = parseInt(h[1] + h[3], 16);
    } else if (INT.test(stepText)) {
      step = Number(stepText);
    } else {
      return fail(`Step "${stepText}" phải là số nguyên hoặc hex.`);
    }
  }
  const upper = /[A-F]/.test(digits);
  const base = parseInt(sign + digits, 16);
  return gen('hex', (i) => {
    const v = base + step * i;
    let s = Math.abs(v).toString(16).padStart(digits.length, '0');
    if (upper) {
      s = s.toUpperCase();
    }
    return `${v < 0 ? '-' : ''}0${x}${s}`;
  });
}

function parseLetters(start: string, stepText: string | undefined): GenResult {
  const step = parseIntStep(stepText);
  if (step === undefined) {
    return fail(`Step "${stepText}" phải là số nguyên.`);
  }
  const upper = start === start.toUpperCase();
  const base = lettersToIndex(start.toLowerCase());
  return gen('letter', (i) => {
    const s = toAlpha(base + step * i);
    return upper ? s.toUpperCase() : s;
  });
}

function parseRoman(start: string, stepText: string | undefined): GenResult {
  const step = parseIntStep(stepText);
  if (step === undefined) {
    return fail(`Step "${stepText}" phải là số nguyên.`);
  }
  const base = fromRoman(start);
  if (Number.isNaN(base)) {
    return fail(`"${start}" không phải số La Mã hợp lệ.`);
  }
  const upper = start === start.toUpperCase();
  return gen('roman', (i) => {
    const s = toRoman(base + step * i);
    return upper ? s : s.toLowerCase();
  });
}

function parseDate(m: RegExpExecArray, stepText: string | undefined): GenResult {
  const step = parseIntStep(stepText);
  if (step === undefined) {
    return fail(`Step "${stepText}" phải là số ngày (số nguyên).`);
  }
  const [, y, mo, d] = m.map(Number);
  // Dùng UTC để không bị lệch ngày khi qua giờ mùa hè.
  const base = Date.UTC(y, mo - 1, d);
  const check = new Date(base);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return fail(`Ngày "${m[0]}" không tồn tại.`);
  }
  return gen('date', (i) => new Date(base + step * i * DAY_MS).toISOString().slice(0, 10));
}

/** "a" -> 1, "z" -> 26, "aa" -> 27 (đánh số kiểu cột Excel). */
function lettersToIndex(s: string): number {
  let n = 0;
  for (const c of s) {
    n = n * 26 + (c.charCodeAt(0) - 96);
  }
  return n;
}

function parseIntStep(stepText: string | undefined): number | undefined {
  if (stepText === undefined) {
    return 1;
  }
  return INT.test(stepText) ? Number(stepText) : undefined;
}

function decimals(stepText: string | undefined): number {
  return stepText?.split('.')[1]?.length ?? 0;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function gen(kind: Kind, g: Gen): GenResult {
  return { ok: true, kind, gen: g };
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
