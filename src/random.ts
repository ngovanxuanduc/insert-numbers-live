/**
 * Random có seed: cùng (seed, cursor, chỗ gọi, salt) luôn ra cùng kết quả.
 * Nhờ vậy preview không nhảy số mỗi lần gõ, và giá trị chèn vào đúng bằng giá trị đang preview.
 * Không dùng cho mục đích bảo mật (token, mật khẩu…).
 */

export type Rng = () => number;

/** Mỗi chỗ gọi random trong chuỗi nhập có một id riêng, để `{?4}-{?4}` không ra hai mã giống nhau. */
let sites = 0;

export function resetSites(): void {
  sites = 0;
}

export function newSite(): number {
  return ++sites;
}

export function siteCount(): number {
  return sites;
}

export function rngFor(seed: number, i: number, site: number, salt: number): Rng {
  let h = 0x9e3779b9 ^ seed;
  for (const v of [i, site, salt]) {
    h = Math.imul(h ^ v, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return mulberry32(h);
}

function mulberry32(a: number): Rng {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLASSES: Record<string, string> = {
  d: '0123456789',
  a: 'abcdefghijklmnopqrstuvwxyz',
  A: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  x: '0123456789abcdef',
  X: '0123456789ABCDEF',
};
export const DEFAULT_CLASSES = 'Ad';
export const CLASS_LETTERS = Object.keys(CLASSES).join('');

/** Bảng ký tự từ tổ hợp lớp, ví dụ "Ad" -> A-Z và 0-9. Trả về chuỗi rỗng nếu có lớp lạ. */
export function charset(classes: string): string {
  const chars = new Set<string>();
  for (const c of classes || DEFAULT_CLASSES) {
    if (!CLASSES[c]) {
      return '';
    }
    for (const ch of CLASSES[c]) {
      chars.add(ch);
    }
  }
  return [...chars].join('');
}

export function randomString(rng: Rng, length: number, chars: string): string {
  if (!chars) {
    return '';
  }
  let s = '';
  for (let k = 0; k < length; k++) {
    s += chars[Math.floor(rng() * chars.length)];
  }
  return s;
}

export function randomInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** UUID v4 (định dạng chuẩn, nhưng sinh từ rng có seed). */
export function uuid(rng: Rng): string {
  const hex = randomString(rng, 32, CLASSES.x).split('');
  hex[12] = '4';
  hex[16] = '89ab'[Math.floor(rng() * 4)];
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
