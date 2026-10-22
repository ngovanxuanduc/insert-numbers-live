import * as vscode from 'vscode';
import { DEFAULT_INPUT, Env, parse, ParseResult, render, sampleEnv } from './sequence';

/** globalState: các chuỗi đã nhập, mới nhất đứng đầu. */
const HISTORY_KEY = 'history';
/** Số giá trị hiện trong mô tả của dòng đầu QuickPick. */
const SAMPLE_COUNT = 4;

interface InputItem extends vscode.QuickPickItem {
  input: string;
}

/** Một cursor cần chèn: `range` là chỗ sẽ ghi đè (rỗng = chèn), `env` là dữ liệu cho biểu thức. */
interface Target {
  range: vscode.Range;
  env: Env;
}

export function activate(context: vscode.ExtensionContext): void {
  const config = () => vscode.workspace.getConfiguration('insertNumbers');

  // Giá trị preview hiện mờ sau cursor; text sắp bị thay thì gạch ngang.
  const ghost = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), fontStyle: 'italic' },
  });
  const replaced = vscode.window.createTextEditorDecorationType({
    textDecoration: 'line-through',
    opacity: '0.5',
  });
  context.subscriptions.push(ghost, replaced);

  const history = (): string[] => context.globalState.get<string[]>(HISTORY_KEY, []);
  const remember = async (input: string) => {
    const size = config().get<number>('historySize', 20);
    const next = [input, ...history().filter((h) => h !== input)].slice(0, size);
    await context.globalState.update(HISTORY_KEY, next);
  };

  context.subscriptions.push(
    // Không dùng registerTextEditorCommand vì editor của nó chỉ hợp lệ trong lúc callback chạy đồng bộ.
    vscode.commands.registerCommand('insertNumbers.insert', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const targets = collectTargets(editor, config());
      const input = await pickInput(targets, history(), (result) => {
        if (!result?.ok) {
          editor.setDecorations(ghost, []);
          editor.setDecorations(replaced, []);
          return;
        }
        // Cursor sau điểm dừng {!…} không có giá trị nên không hiện gì.
        const values = render(result.seq, targets.map((t) => t.env));
        const shown = targets.slice(0, values.length);
        editor.setDecorations(
          ghost,
          shown.map((t, k) => ({
            range: new vscode.Range(t.range.end, t.range.end),
            renderOptions: { after: { contentText: values[k] } },
          })),
        );
        editor.setDecorations(
          replaced,
          shown.filter((t) => !t.range.isEmpty).map((t) => t.range),
        );
      });
      editor.setDecorations(ghost, []);
      editor.setDecorations(replaced, []);
      if (input === undefined) {
        return;
      }

      const result = parse(input);
      if (!result.ok) {
        return;
      }
      const values = render(result.seq, targets.map((t) => t.env));
      // Một lần edit duy nhất để Undo một phát là về lại như cũ.
      const applied = await editor.edit((b) => {
        values.forEach((v, k) => b.replace(targets[k].range, v));
      });
      if (!applied) {
        vscode.window.showWarningMessage('Insert Numbers: file đã thay đổi trong lúc nhập, chưa chèn được.');
        return;
      }
      // Template giữ nguyên khoảng trắng đầu/cuối vì nó là một phần của text chèn vào.
      const saved = /[{}]/.test(input) ? input : input.trim();
      if (saved.trim()) {
        await remember(saved);
      }
    }),

    vscode.commands.registerCommand('insertNumbers.clearHistory', async () => {
      await context.globalState.update(HISTORY_KEY, []);
      vscode.window.showInformationMessage('Insert Numbers: đã xoá lịch sử.');
    }),
  );
}

export function deactivate(): void {}

function collectTargets(editor: vscode.TextEditor, config: vscode.WorkspaceConfiguration): Target[] {
  const selections = [...editor.selections];
  // editor.selections giữ thứ tự tạo cursor; muốn đánh số theo vị trí thì phải tự sắp.
  if (config.get<string>('order', 'position') === 'position') {
    selections.sort((a, b) => a.start.compareTo(b.start));
  }
  const replace = config.get<boolean>('replaceSelection', true);
  return selections.map((s, i) => ({
    range: replace ? new vscode.Range(s.start, s.end) : new vscode.Range(s.end, s.end),
    env: {
      i,
      count: selections.length,
      line: s.start.line + 1,
      col: s.start.character + 1,
      text: editor.document.getText(s),
    },
  }));
}

/**
 * Mở QuickPick để nhập. Dòng đầu luôn là chuỗi đang gõ, bên dưới là lịch sử.
 * `preview` được gọi mỗi khi dòng đang chọn thay đổi. Trả về undefined nếu người dùng huỷ.
 */
function pickInput(
  targets: Target[],
  history: string[],
  preview: (result: ParseResult | undefined) => void,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const qp = vscode.window.createQuickPick<InputItem>();
    qp.title = `Insert Numbers (${targets.length} cursor)`;
    qp.placeholder = 'Ví dụ: 1 · 10:5 · 001 · 0x0a · a · #I · 2026-01-01:7 · Mon,Tue · 1*2 · ?6 · =i*i · order_{?6}';
    qp.matchOnDescription = false;

    const envs = targets.map((t) => t.env);
    // Seed cố định trong suốt lần nhập này, nên giá trị chèn vào đúng bằng giá trị đang preview.
    const reseed = () => {
      const seed = Math.floor(Math.random() * 2 ** 31);
      envs.forEach((e) => (e.seed = seed));
    };
    reseed();
    const reroll: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('refresh'),
      tooltip: 'Sinh lại giá trị random',
    };
    qp.buttons = [reroll];

    let historyItems: InputItem[] = [];
    const describeHistory = () => {
      historyItems = history.map((h) => describe(h, envs, { iconPath: new vscode.ThemeIcon('history') }));
    };
    describeHistory();
    /** Dựng lại danh sách; `keep` là input của dòng muốn giữ được chọn (mặc định là dòng đang gõ). */
    const refresh = (keep?: string) => {
      const current = describe(qp.value, envs, { alwaysShow: true });
      qp.items = [current, ...historyItems.filter((h) => h.input !== qp.value && h.input !== qp.value.trim())];
      qp.activeItems = [qp.items.find((it) => keep !== undefined && it.input === keep) ?? current];
    };

    let done = false;
    const finish = (value: string | undefined) => {
      if (done) {
        return;
      }
      done = true;
      resolve(value);
      qp.dispose();
    };

    qp.onDidChangeValue(() => refresh());
    qp.onDidTriggerButton(() => {
      const keep = qp.activeItems[0]?.input;
      reseed();
      describeHistory();
      refresh(keep);
    });
    qp.onDidChangeActive(([item]) => preview(item ? parse(item.input) : undefined));
    qp.onDidAccept(() => {
      const item = qp.activeItems[0];
      // Chuỗi lỗi thì giữ QuickPick mở để sửa tiếp.
      if (item && parse(item.input).ok) {
        finish(item.input);
      }
    });
    qp.onDidHide(() => finish(undefined));

    refresh();
    qp.show();
  });
}

/** `envs` là dữ liệu cursor thật, để mẫu của biểu thức dùng line/s/x khớp với preview. */
function describe(input: string, envs: Env[], extra: Partial<vscode.QuickPickItem>): InputItem {
  const result = parse(input);
  const label = input.trim() ? input : DEFAULT_INPUT;
  if (!result.ok) {
    return { ...extra, input, label, iconPath: new vscode.ThemeIcon('error'), detail: result.error };
  }
  // Ít cursor hơn SAMPLE_COUNT thì bù bằng env giả để vẫn thấy được dãy đi tiếp thế nào.
  const sampleEnvs = Array.from({ length: SAMPLE_COUNT }, (_, i) => envs[i] ?? sampleEnv(i, Math.max(envs.length, SAMPLE_COUNT)));
  const sample = render(result.seq, sampleEnvs);
  // Template hay có khoảng trắng đầu/cuối, đặt trong ngoặc kép cho dễ thấy.
  const quote = (v: string) => (result.seq.kind === 'template' ? JSON.stringify(v) : v);
  const more = sample.length === SAMPLE_COUNT ? ', …' : '';
  return { ...extra, input, label, description: sample.map(quote).join(', ') + more };
}
