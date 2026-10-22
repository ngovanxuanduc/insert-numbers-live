import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Env, parse, render, sampleEnv } from './sequence';

function first(input: string, n = 4): string[] {
  const r = parse(input);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return render(r.seq, Array.from({ length: n }, (_, i) => sampleEnv(i, n)));
}

function error(input: string): void {
  assert.equal(parse(input).ok, false, `"${input}" lẽ ra phải lỗi`);
}

test('số nguyên', () => {
  assert.deepEqual(first(''), ['1', '2', '3', '4']);
  assert.deepEqual(first('0'), ['0', '1', '2', '3']);
  assert.deepEqual(first('10:5'), ['10', '15', '20', '25']);
  assert.deepEqual(first('2:-2'), ['2', '0', '-2', '-4']);
  assert.deepEqual(first(' 3 : 3 '), ['3', '6', '9', '12']);
});

test('pad bằng số 0 ở đầu', () => {
  assert.deepEqual(first('001'), ['001', '002', '003', '004']);
  assert.deepEqual(first('098:1'), ['098', '099', '100', '101']);
  assert.deepEqual(first('01:-1'), ['01', '00', '-01', '-02']);
});

test('số thập phân không bị lỗi làm tròn', () => {
  assert.deepEqual(first('0.1:0.2'), ['0.1', '0.3', '0.5', '0.7']);
  assert.deepEqual(first('1.5:0.25'), ['1.50', '1.75', '2.00', '2.25']);
  assert.deepEqual(first('1:0.5'), ['1.0', '1.5', '2.0', '2.5']);
});

test('hex', () => {
  assert.deepEqual(first('0x0a:2'), ['0x0a', '0x0c', '0x0e', '0x10']);
  assert.deepEqual(first('0xFE'), ['0xFE', '0xFF', '0x100', '0x101']);
  assert.deepEqual(first('0x00:0x10'), ['0x00', '0x10', '0x20', '0x30']);
});

test('chữ cái', () => {
  assert.deepEqual(first('a'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(first('y'), ['y', 'z', 'aa', 'ab']);
  assert.deepEqual(first('AZ'), ['AZ', 'BA', 'BB', 'BC']);
  assert.deepEqual(first('A:2'), ['A', 'C', 'E', 'G']);
});

test('ngày', () => {
  assert.deepEqual(first('2026-01-30'), ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  assert.deepEqual(first('2024-02-28:1', 3), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(first('2026-03-28:7', 2), ['2026-03-28', '2026-04-04']);
});

test('danh sách lặp vòng', () => {
  assert.deepEqual(first('Mon, Tue,Wed', 5), ['Mon', 'Tue', 'Wed', 'Mon', 'Tue']);
});

test('lỗi cú pháp', () => {
  error('1:2:3');
  error('1:');
  error('1:x');
  error('a:1.5');
  error('2026-02-30');
  error('1a');
});

test('số La Mã', () => {
  assert.deepEqual(first('#I'), ['I', 'II', 'III', 'IV']);
  assert.deepEqual(first('#viii:2'), ['viii', 'x', 'xii', 'xiv']);
  error('#IIII');
});

test('hậu tố lặp và quay vòng', () => {
  assert.deepEqual(first('1*3', 7), ['1', '1', '1', '2', '2', '2', '3']);
  assert.deepEqual(first('1%3', 5), ['1', '2', '3', '1', '2']);
  assert.deepEqual(first('a*2%2', 6), ['a', 'a', 'b', 'b', 'a', 'a']);
  assert.deepEqual(first('10:10 * 2', 3), ['10', '10', '20']);
  assert.deepEqual(first('x,y*2', 4), ['x', 'x', 'y', 'y']);
  error('1*0');
});

test('biểu thức', () => {
  assert.deepEqual(first('=i*i'), ['0', '1', '4', '9']);
  assert.deepEqual(first('=2**n'), ['2', '4', '8', '16']);
  assert.deepEqual(first('=-2**2', 1), ['-4']);
  assert.deepEqual(first('=1 + 2 * 3 - 4 / 2', 1), ['5']);
  assert.deepEqual(first('=(i - 1) % 3'), ['2', '0', '1', '2']);
  assert.deepEqual(first('=i * 0.1', 4), ['0', '0.1', '0.2', '0.3']);
  assert.deepEqual(first('=i % 2 ? "odd" : "even"'), ['even', 'odd', 'even', 'odd']);
  assert.deepEqual(first('=i < 1 ? "a" : i < 2 ? "b" : "c"', 3), ['a', 'b', 'c']);
  assert.deepEqual(first('=pad(n * 5, 3)', 2), ['005', '010']);
  assert.deepEqual(first('=pad(i - 1, 3)', 1), ['-01']);
  assert.deepEqual(first('=hex(i * 16, 2)', 3), ['00', '10', '20']);
  assert.deepEqual(first('=upper(alpha(n)) + roman(n)', 3), ['AI', 'BII', 'CIII']);
  assert.deepEqual(first('=date("2026-12-30", i)', 3), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(first('="L" + line + "/" + count', 2), ['L1/2', 'L2/2']);
  assert.deepEqual(first('=max(i, 2)', 4), ['2', '2', '2', '3']);
  error('=');
  error('=i +');
  error('=foo');
  error('=bar(1)');
  error('=pad(1)');
  error('=(i');
  error('=i i');
});

test('biểu thức dùng text đang bôi đen', () => {
  const r = parse('=x * 2 + s');
  assert.ok(r.ok);
  const envs: Env[] = ['3', '10'].map((text, i) => ({ i, count: 2, line: 1, col: 1, text }));
  assert.deepEqual(render(r.seq, envs), ['63', '2010']);
  const inc = parse('=x + 1');
  assert.ok(inc.ok);
  assert.deepEqual(render(inc.seq, envs), ['4', '11']);
});

test('template', () => {
  assert.deepEqual(first('item_{001}', 2), ['item_001', 'item_002']);
  assert.deepEqual(first('{}. ', 2), ['1. ', '2. ']);
  assert.deepEqual(first('{A}{1}', 2), ['A1', 'B2']);
  assert.deepEqual(first('row[{=i*2}] = {#I};', 2), ['row[0] = I;', 'row[2] = II;']);
  assert.deepEqual(first('{{x}}={1:5}', 2), ['{x}=1', '{x}=6']);
  assert.deepEqual(first('{Mon,Tue}-{1*2}', 4), ['Mon-1', 'Tue-1', 'Mon-2', 'Tue-2']);
  assert.deepEqual(first('  {1}  ', 1), ['  1  ']);
  error('{1');
  error('a}');
  error('{1:x}');
  error('{=foo}');
});

test('điều kiện dừng', () => {
  assert.deepEqual(first('{1}{!i >= 3}', 6), ['1', '2', '3']);
  assert.deepEqual(first('{10:10}{!n * 10 > 25}', 6), ['10', '20']);
  assert.deepEqual(first('x{!0}', 2), ['x', 'x']);
  error('{1}{!i>1}{!i>2}');
});

test('random: cùng seed thì ra cùng giá trị, khác seed thì khác', () => {
  const r = parse('order_{?6}');
  assert.ok(r.ok);
  const envs = (seed: number) => Array.from({ length: 50 }, (_, i) => ({ ...sampleEnv(i, 50), seed }));
  const a = render(r.seq, envs(1));
  assert.deepEqual(render(r.seq, envs(1)), a);
  assert.notDeepEqual(render(r.seq, envs(2)), a);
  for (const v of a) {
    assert.match(v, /^order_[A-Z0-9]{6}$/);
  }
});

test('random: lớp ký tự, uuid, rand, randstr', () => {
  assert.match(first('?8d', 1)[0], /^\d{8}$/);
  assert.match(first('?5aA', 1)[0], /^[a-zA-Z]{5}$/);
  assert.match(first('?4x', 1)[0], /^[0-9a-f]{4}$/);
  assert.match(first('?uuid', 1)[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const v of first('=rand(5, 7)', 30)) {
    assert.ok(['5', '6', '7'].includes(v), v);
  }
  assert.match(first('=randstr(3, "d") + "-" + randstr(3, "A")', 1)[0], /^\d{3}-[A-Z]{3}$/);
  error('?0');
  error('?6z');
  error('=randstr(4, "q")');
});

test('random: hai chỗ gọi trong cùng template cho giá trị khác nhau', () => {
  const [v] = first('{?12d}-{?12d}', 1);
  const [a, b] = v.split('-');
  assert.notEqual(a, b);
});

test('random: không trùng giữa các cursor khi còn đủ tổ hợp', () => {
  // ?1d chỉ có 10 giá trị: 10 cursor phải ra đủ 0-9, không trùng.
  const v = first('?1d', 10);
  assert.equal(new Set(v).size, 10);
});
