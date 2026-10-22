// Generates SVG frames of a mock VS Code window demoing Insert Numbers Live.
// Values come from the extension's real compiled parser.
// Usage: node frames.js <extension dir> <out dir>
const path = require('path');
const fs = require('fs');
const [EXT, OUT] = process.argv.slice(2);
const { parse, render } = require(path.join(EXT, 'out/sequence.js'));

const W = 900, H = 470;
const FS = 15, CW = FS * 0.6021, LH = 22;
const TITLE_H = 28, TABS_H = 35, STATUS_H = 22;
const TEXT_X = 64, TOP = TITLE_H + TABS_H + 10;
const MONO = "Menlo, monospace";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const C = {
  comment: '#6A9955', kw: '#569CD6', str: '#CE9178', num: '#B5CEA8', prop: '#9CDCFE', text: '#D4D4D4',
  ghost: '#8C8C8C', sel: '#264F78', selInactive: '#3A3D41', cursor: '#AEAFAD',
};

function highlight(s) {
  if (/^\s*(\/\/|--)/.test(s)) return [{ text: s, color: C.comment }];
  const re = /("[^"]*"|'[^']*')|(\b\d+\b)|(\b(?:const|export|import|type|from|INSERT|INTO|VALUES|BEGIN|COMMIT|DELETE|FROM)\b)|([A-Za-z_]\w*)(?=:)|(.)/g;
  const runs = [];
  let m;
  while ((m = re.exec(s))) {
    const color = m[1] ? C.str : m[2] ? C.num : m[3] ? C.kw : m[4] ? C.prop : C.text;
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += m[0];
    else runs.push({ text: m[0], color });
  }
  return runs;
}

function textRuns(runs, col, y, extra = '') {
  let out = '';
  for (const r of runs) {
    if (r.text.trim()) {
      out += `<text x="${(TEXT_X + col * CW).toFixed(1)}" y="${y}" fill="${r.color}" ${extra} xml:space="preserve">${esc(r.text)}</text>`;
    }
    col += r.text.length;
  }
  return out;
}

function chrome(file) {
  return `
  <rect width="${W}" height="${H}" fill="#1E1E1E"/>
  <rect width="${W}" height="${TITLE_H}" fill="#3C3C3C"/>
  <circle cx="18" cy="14" r="6" fill="#FF5F57"/><circle cx="38" cy="14" r="6" fill="#FEBC2E"/><circle cx="58" cy="14" r="6" fill="#28C840"/>
  <text x="${W / 2}" y="18" fill="#CCCCCC" font-family="${SANS}" font-size="12" text-anchor="middle">${esc(file)} — demo</text>
  <rect y="${TITLE_H}" width="${W}" height="${TABS_H}" fill="#252526"/>
  <rect y="${TITLE_H}" width="150" height="${TABS_H}" fill="#1E1E1E"/>
  <rect y="${TITLE_H}" width="150" height="2" fill="#0078D4"/>
  <text x="16" y="${TITLE_H + 22}" fill="#FFFFFF" font-family="${SANS}" font-size="13">${esc(file)}</text>
  <rect y="${H - STATUS_H}" width="${W}" height="${STATUS_H}" fill="#007ACC"/>
  <text x="10" y="${H - 7}" fill="#FFFFFF" font-family="${SANS}" font-size="12">Insert Numbers Live</text>`;
}

function envsOf(scene, seed) {
  const cursorLines = scene.lines.map((l, k) => [l, k]).filter(([l]) => typeof l !== 'string');
  return cursorLines.map(([l, k], i) => ({
    i, count: cursorLines.length, line: k + 1, col: l.pre.length + 1, text: l.sel || '', seed,
  }));
}

function values(input, envs) {
  const r = parse(input);
  return r.ok ? render(r.seq, envs) : null;
}

function describe(input, envs) {
  const r = parse(input);
  const label = input.trim() ? input : '1';
  if (!r.ok) return { label, error: r.error };
  const sample = render(r.seq, envs.slice(0, 4));
  const q = (v) => (r.seq.kind === 'template' ? JSON.stringify(v) : v);
  return { label, desc: sample.map(q).join(', ') + (sample.length === 4 ? ', …' : '') };
}

function editor(scene, st, envs) {
  const ghosts = st.input !== null ? values(st.input, envs) : null;
  const applied = st.applied ? values(st.applied, envs) : null;
  const focused = st.input === null;
  let out = '';
  let ci = 0;
  scene.lines.forEach((l, k) => {
    const y = TOP + k * LH + 16;
    out += `<text x="${TEXT_X - 22}" y="${y}" fill="#858585" font-family="${MONO}" font-size="${FS}" text-anchor="end">${k + 1}</text>`;
    if (typeof l === 'string') {
      out += textRuns(highlight(l), 0, y);
      return;
    }
    const i = ci++;
    const sel = l.sel || '';
    if (applied) {
      const v = applied[i] ?? sel;
      out += textRuns(highlight(l.pre + v + l.post), 0, y);
      if (focused) out += cursorAt(l.pre.length + v.length, y);
      return;
    }
    const g = ghosts?.[i] ?? '';
    out += textRuns(highlight(l.pre), 0, y);
    if (sel) {
      const x = TEXT_X + l.pre.length * CW;
      out += `<rect x="${x.toFixed(1)}" y="${y - 15}" width="${(sel.length * CW).toFixed(1)}" height="${LH - 2}" fill="${focused ? C.sel : C.selInactive}"/>`;
      const strike = g ? `text-decoration="line-through" fill-opacity="0.5"` : '';
      out += textRuns(highlight(sel), l.pre.length, y, strike);
      if (g) out += `<line x1="${x.toFixed(1)}" x2="${(x + sel.length * CW).toFixed(1)}" y1="${y - 5}" y2="${y - 5}" stroke="${C.text}" stroke-opacity="0.6" stroke-width="1.2"/>`;
    }
    const gcol = l.pre.length + sel.length;
    if (g) out += textRuns([{ text: g, color: C.ghost }], gcol, y, 'font-style="italic"');
    out += textRuns(highlight(l.post), gcol + g.length, y);
    if (focused) out += cursorAt(gcol, y);
  });
  return `<g font-family="${MONO}" font-size="${FS}">${out}</g>`;
}

const cursorAt = (col, y) => `<rect x="${(TEXT_X + col * CW - 1).toFixed(1)}" y="${y - 15}" width="2" height="${LH - 2}" fill="${C.cursor}"/>`;

function quickPick(scene, st, envs) {
  const w = 660, x0 = (W - w) / 2, y0 = TITLE_H + 6;
  const QF = 13, QCW = QF * 0.6021;
  const current = describe(st.input, envs);
  const typed = st.input.trim();
  const history = scene.history
    .filter((h) => h !== st.input && h !== typed && (!typed || h.includes(typed)))
    .map((h) => ({ ...describe(h, envs), history: true }));
  const items = [current, ...history];

  let list = '';
  let y = y0 + 68;
  items.forEach((it, idx) => {
    const h = it.error ? 42 : 24;
    if (idx === 0) list += `<rect x="${x0 + 1}" y="${y}" width="${w - 2}" height="${h}" fill="#04395E"/>`;
    const base = y + 16;
    let tx = x0 + 14;
    if (it.error) {
      list += `<circle cx="${tx + 6}" cy="${base - 4}" r="6" fill="none" stroke="#F14C4C" stroke-width="1.5"/>
        <path d="M${tx + 3.5} ${base - 6.5} l5 5 M${tx + 8.5} ${base - 6.5} l-5 5" stroke="#F14C4C" stroke-width="1.5"/>`;
      tx += 20;
    } else if (it.history) {
      list += `<circle cx="${tx + 6}" cy="${base - 4}" r="6" fill="none" stroke="#C5C5C5" stroke-width="1.3"/>
        <path d="M${tx + 6} ${base - 7.5} v3.5 l2.5 1.5" fill="none" stroke="#C5C5C5" stroke-width="1.3"/>`;
      tx += 20;
    }
    list += `<text x="${tx}" y="${base}" fill="#FFFFFF" font-family="${MONO}" font-size="${QF}" xml:space="preserve">${esc(it.label)}</text>`;
    if (it.desc) {
      list += `<text x="${tx + it.label.length * QCW + 12}" y="${base}" fill="#A8A8A8" font-family="${MONO}" font-size="${QF - 1}" xml:space="preserve">${esc(it.desc)}</text>`;
    }
    if (it.error) {
      list += `<text x="${tx}" y="${base + 18}" fill="#A8A8A8" font-family="${SANS}" font-size="12">${esc(it.error)}</text>`;
    }
    y += h;
  });
  const boxH = y - y0 + 6;

  const placeholder = 'e.g. 1 · 10:5 · 001 · 0x0a · a · #I · 2026-01-01:7 · Mon,Tue · 1*2 · ?6 · =i*i';
  const inputText = st.input
    ? `<text x="${x0 + 16}" y="${y0 + 52}" fill="#CCCCCC" font-family="${MONO}" font-size="${QF}" xml:space="preserve">${esc(st.input)}</text>`
    : `<text x="${x0 + 16}" y="${y0 + 52}" fill="#8B8B8B" font-family="${MONO}" font-size="${QF}" xml:space="preserve">${esc(placeholder)}</text>`;
  const caretX = x0 + 16 + st.input.length * QCW;
  const bx = x0 + w - 30, by = y0 + 5;

  return `
  <defs>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.55"/></filter>
    <clipPath id="qp"><rect x="${x0}" y="${y0}" width="${w}" height="${boxH}" rx="6"/></clipPath>
  </defs>
  <rect x="${x0}" y="${y0}" width="${w}" height="${boxH}" rx="6" fill="#252526" stroke="#454545" filter="url(#sh)"/>
  <g clip-path="url(#qp)">
    <text x="${W / 2}" y="${y0 + 20}" fill="#CCCCCC" font-family="${SANS}" font-size="12.5" text-anchor="middle">Insert Numbers Live (${envs.length} cursors)</text>
    ${st.reroll ? `<rect x="${bx}" y="${by}" width="22" height="22" rx="4" fill="#FFFFFF" fill-opacity="0.18"/>` : ''}
    <path d="M${bx + 16} ${by + 8} A6 6 0 1 0 ${bx + 17} ${by + 13}" fill="none" stroke="#C5C5C5" stroke-width="1.6"/>
    <path d="M${bx + 17} ${by + 4} v4.5 h-4.5" fill="none" stroke="#C5C5C5" stroke-width="1.6"/>
    <rect x="${x0 + 8}" y="${y0 + 33}" width="${w - 16}" height="27" rx="2" fill="#3C3C3C" stroke="#0078D4"/>
    ${inputText}
    <rect x="${caretX.toFixed(1)}" y="${y0 + 39}" width="1.5" height="16" fill="#CCCCCC"/>
    ${list}
  </g>`;
}

function overlay(st) {
  let out = '';
  if (st.key) {
    const w = 30 + st.key.length * 13;
    out += `<rect x="${W - w - 20}" y="${H - STATUS_H - 58}" width="${w}" height="40" rx="10" fill="#000000" fill-opacity="0.78"/>
      <text x="${W - w / 2 - 20}" y="${H - STATUS_H - 32}" fill="#FFFFFF" font-family="${SANS}" font-size="18" font-weight="600" text-anchor="middle">${esc(st.key)}</text>`;
  }
  if (st.caption) {
    const w = st.caption.length * 8.4 + 32;
    out += `<rect x="20" y="${H - STATUS_H - 58}" width="${w}" height="40" rx="10" fill="#0078D4" fill-opacity="0.92"/>
      <text x="36" y="${H - STATUS_H - 32}" fill="#FFFFFF" font-family="${SANS}" font-size="16" font-weight="500">${esc(st.caption)}</text>`;
  }
  return out;
}

function frame(scene, st) {
  const envs = envsOf(scene, st.seed ?? scene.seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${chrome(scene.file)}
  ${editor(scene, st, envs)}
  ${st.input !== null ? quickPick(scene, st, envs) : ''}
  ${overlay(st)}
</svg>`;
}

// ---- Storyboard ----

const scenes = [
  {
    file: 'users.ts',
    seed: 1,
    history: [],
    caption: 'Live preview at every cursor',
    lines: [
      "import type { User } from './types';",
      '',
      '// Seed data for local development.',
      '// Every user needs a unique id.',
      '',
      'const users: User[] = [',
      { pre: '  { id: ', post: ', name: "Alice" },' },
      { pre: '  { id: ', post: ', name: "Bob" },' },
      { pre: '  { id: ', post: ', name: "Carol" },' },
      { pre: '  { id: ', post: ', name: "Dave" },' },
      { pre: '  { id: ', post: ', name: "Eve" },' },
      '];',
    ],
    typing: ['1', '10', '10:', '10:5'],
    final: '10:5',
  },
  {
    file: 'orders.sql',
    seed: 20261022,
    history: ['10:5'],
    caption: 'Unique random codes in templates',
    lines: [
      '-- Seed orders for staging',
      'BEGIN;',
      '',
      'DELETE FROM orders;',
      '',
      'INSERT INTO orders (id, code) VALUES',
      { pre: "  (1, '", post: "')," },
      { pre: "  (2, '", post: "')," },
      { pre: "  (3, '", post: "')," },
      { pre: "  (4, '", post: "')," },
      { pre: "  (5, '", post: "');" },
      'COMMIT;',
    ],
    typing: ['o', 'ord', 'order_', 'order_{', 'order_{?', 'order_{?6', 'order_{?6}'],
    final: 'order_{?6}',
    rerolls: [777, 4242],
  },
  {
    file: 'config.ts',
    seed: 3,
    history: ['order_{?6}', '10:5'],
    caption: 'Transform selections with expressions',
    lines: [
      '// Timeouts are configured in seconds,',
      '// but the HTTP client expects milliseconds.',
      '',
      'export const DEFAULT_RETRIES = 3;',
      '',
      'const timeouts = {',
      { pre: '  connect: ', sel: '5', post: ',' },
      { pre: '  read: ', sel: '30', post: ',' },
      { pre: '  write: ', sel: '45', post: ',' },
      { pre: '  idle: ', sel: '120', post: ',' },
      '};',
    ],
    typing: ['=', '=x', '=x *', '=x * 10', '=x * 1000'],
    final: '=x * 1000',
  },
];

const frames = [];
const push = (scene, st, ms) => frames.push({ svg: frame(scene, { input: null, ...st }), ms });

for (const s of scenes) {
  const caption = s.caption;
  push(s, { caption }, 900);
  push(s, { input: '', key: '⌘ ⌥ N', caption }, 1100);
  s.typing.forEach((t, k) => push(s, { input: t, caption }, k === s.typing.length - 1 ? 1500 : 260));
  let seed = s.seed;
  for (const r of s.rerolls ?? []) {
    push(s, { input: s.final, seed, reroll: true, caption: 'Re-roll button: new codes' }, 350);
    seed = r;
    push(s, { input: s.final, seed, reroll: true, caption: 'Re-roll button: new codes' }, 1000);
  }
  push(s, { applied: s.final, seed, key: '↵ Enter', caption }, 1900);
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = frames.map((f, k) => {
  const name = `f${String(k).padStart(3, '0')}.svg`;
  fs.writeFileSync(path.join(OUT, name), f.svg);
  return { name, ms: f.ms };
});
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`${frames.length} frames`);
