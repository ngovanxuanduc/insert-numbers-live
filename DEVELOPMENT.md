# Phát triển

```bash
npm install
npm test                    # compile và chạy unit test cho phần parse cú pháp
./build.sh --install        # nâng version, build .vsix và cài vào VS Code
./build.sh --no-bump        # build lại, giữ nguyên version (dùng trước khi upload lên Marketplace)
```

Mở thư mục này trong VS Code rồi bấm F5 (**Run Extension**) để chạy thử trong cửa sổ Extension Development Host.

| File | Nội dung |
|---|---|
| `src/sequence.ts` | Parse chuỗi nhập (dãy cơ bản, hậu tố, template, điều kiện dừng) thành dãy giá trị. Không phụ thuộc `vscode` nên test được bằng `node --test`. |
| `src/expr.ts` | Parser và bộ tính biểu thức `=…`, tự viết, không dùng `eval`. |
| `src/random.ts` | Random có seed, để preview và giá trị chèn vào giống nhau. |
| `src/extension.ts` | Lệnh, QuickPick, preview bằng decoration, chèn bằng một lần `editor.edit`. |
| `images/icon.svg` | File gốc của icon. Xuất lại PNG: `rsvg-convert -w 256 -h 256 images/icon.svg -o images/icon.png`. |

## Publish lên Marketplace

Publisher: `ducnvx`, extension ID: `ducnvx.insert-numbers-live`, repo: https://github.com/ngovanxuanduc/insert-numbers-live.

`vsce` đổi link tương đối trong README (ví dụ `images/demo.gif`) thành link GitHub theo `repository`, nên phải push lên `main` trước khi upload thì ảnh mới hiện.

1. Nâng version và ghi thay đổi vào `CHANGELOG.md`. Marketplace không nhận lại version đã đăng.
2. `./build.sh` (nâng patch) hoặc `./build.sh minor`.
3. Vào https://marketplace.visualstudio.com/manage/publishers/ducnvx, chọn extension → **Update**, upload file `.vsix`.
   Lần đầu thì dùng **New extension → Visual Studio Code**.

## GIF demo

`images/demo.gif` là ảnh dựng (không phải quay màn hình): `scripts/demo/frames.js` vẽ từng frame giao diện VS Code bằng SVG,
lấy giá trị từ `out/sequence.js` nên khớp với extension thật; `scripts/demo/assemble.py` render PNG bằng `rsvg-convert` rồi ghép GIF bằng Pillow.

```bash
npm run compile
node scripts/demo/frames.js . /tmp/demo-frames
python3 -m venv /tmp/demo-venv && /tmp/demo-venv/bin/pip install pillow
/tmp/demo-venv/bin/python scripts/demo/assemble.py /tmp/demo-frames images/demo.gif
```
