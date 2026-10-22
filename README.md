# Insert Numbers

Extension VS Code để chèn dãy số (hoặc chữ cái, ngày, danh sách) vào nhiều cursor cùng lúc.
Khác với bản trên Marketplace: bấm phím tắt **không chèn ngay**. Extension mở ô nhập và hiện preview mờ tại từng cursor. Bấm Enter mới chèn, bấm Esc thì file không bị đụng tới.

## Cách dùng

1. Tạo nhiều cursor (Alt+Click, `Cmd+Alt+↓`, `Cmd+D`…).
2. Bấm `Cmd+Alt+N` (Windows/Linux: `Ctrl+Alt+N`).
3. Gõ cú pháp. Preview cập nhật ngay trong editor, dòng đầu của ô nhập hiện vài giá trị đầu tiên.
4. Enter để chèn. Undo (`Cmd+Z`) một lần là về lại như cũ.

Để trống rồi Enter thì chèn 1, 2, 3… Bên dưới ô nhập là lịch sử các lần trước; dùng phím mũi tên để chọn lại (preview cũng đổi theo).

## Cú pháp

### Dãy cơ bản

Dạng chung: `start` hoặc `start:step`.

| Nhập | Kết quả | Ghi chú |
|---|---|---|
| `1` | 1, 2, 3… | |
| `10:5` | 10, 15, 20… | step có thể âm: `10:-1` |
| `001` | 001, 002, 003… | số 0 ở đầu quy định độ rộng pad |
| `1.5:0.25` | 1.50, 1.75, 2.00… | số chữ số thập phân lấy theo start/step |
| `0x0a:2` | 0x0a, 0x0c, 0x0e… | độ rộng và chữ hoa/thường giữ theo start; step có thể viết `0x10` |
| `a` / `A:2` | a, b, c… / A, C, E… | sau `z` là `aa`, `ab` như cột Excel |
| `#I` / `#x:10` | I, II, III… / x, xx, xxx… | số La Mã (hoa/thường theo start) |
| `2026-01-31:7` | 2026-01-31, 2026-02-07… | step tính theo ngày |
| `Mon,Tue,Wed` | Mon, Tue, Wed, Mon… | danh sách lặp vòng |

Hậu tố thêm vào sau dãy cơ bản:

| Nhập | Kết quả | Ý nghĩa |
|---|---|---|
| `1*3` | 1, 1, 1, 2, 2, 2… | mỗi giá trị lặp 3 lần |
| `1%3` | 1, 2, 3, 1, 2, 3… | quay vòng sau 3 giá trị |
| `a*2%2` | a, a, b, b, a, a… | dùng chung được |

### Mã ngẫu nhiên

| Nhập | Ví dụ | Ghi chú |
|---|---|---|
| `?6` | `K7P2XQ` | 6 ký tự A-Z và 0-9 |
| `?8d` | `40912377` | lớp ký tự: `d` số, `a` chữ thường, `A` chữ hoa, `x` hex thường, `X` hex hoa; ghép được, ví dụ `?10aAd` |
| `?uuid` | `3f2b…-4…` | UUID v4 |

- Các cursor trong cùng một lần chèn **không bị trùng mã**: trùng thì tự sinh lại, trừ khi số cursor vượt quá số tổ hợp có thể.
- Preview không đổi trong lúc gõ, và giá trị chèn vào đúng bằng giá trị đang preview. Bấm nút 🔄 trên ô nhập để sinh bộ khác.
- Random này không dùng cho mục đích bảo mật (token, mật khẩu).

### Template

Có dấu `{` hoặc `}` thì cả chuỗi là template: text giữ nguyên (kể cả khoảng trắng), mỗi `{…}` là một dãy.

| Nhập | Kết quả |
|---|---|
| `order_{?6}` | order_K7P2XQ, order_9QZ1MB… |
| `item_{001}` | item_001, item_002… |
| `{}. ` | `1. `, `2. `… (`{}` là `{1}`) |
| `{A}{1}` | A1, B2, C3… |
| `{Mon,Tue}-{1*2}` | Mon-1, Tue-1, Mon-2, Tue-2… |
| `row[{=i*2}] = {#I};` | row[0] = I;, row[2] = II;… |
| `{{x}} = {1}` | {x} = 1, {x} = 2… (`{{` và `}}` để ghi dấu ngoặc) |

### Biểu thức

Bắt đầu bằng `=` (hoặc `{=…}` trong template).

| Biến | Ý nghĩa |
|---|---|
| `i` / `n` | số thứ tự bắt đầu từ 0 / từ 1 |
| `count` | tổng số cursor |
| `line`, `col` | dòng, cột của cursor (từ 1) |
| `s` / `x` | text đang bôi đen tại cursor / text đó đổi ra số |

Toán tử: `+ - * / % **`, so sánh `== != < <= > >=`, `&& || !`, `điều_kiện ? a : b`. `+` nối chuỗi nếu có một vế là chuỗi (`"..."` hoặc `'...'`). `%` luôn ra số không âm.

Hàm: `abs floor ceil round(v, chữ_số) sqrt min max pow`, `pad(v, độ_rộng, ký_tự="0")`, `hex(v, độ_rộng)` `bin` `oct`, `roman(v)`, `alpha(v)` (1 → a), `upper lower len num`, `date("2026-01-01", số_ngày)`, `rand(min, max)`, `randstr(độ_dài, "Ad")`, `uuid()`.

| Nhập | Kết quả |
|---|---|
| `=i*i` | 0, 1, 4, 9… |
| `=2**n` | 2, 4, 8, 16… |
| `=pad(n*5, 3)` | 005, 010, 015… |
| `=i%2 ? "odd" : "even"` | even, odd, even… |
| `=x + 1` | bôi đen các số rồi tăng mỗi số lên 1 |
| `=x * 1000` | đổi giây sang mili giây cho các số đang bôi đen |
| `="L" + line` | L12, L13… (số dòng) |

### Điều kiện dừng

`{!điều_kiện}` trong template: từ cursor đầu tiên thoả điều kiện trở đi thì không chèn gì nữa (các cursor đó giữ nguyên).

| Nhập | Kết quả với 6 cursor |
|---|---|
| `{1}{!i >= 3}` | 1, 2, 3, (trống), (trống), (trống) |
| `{10:10}{!n*10 > 25}` | 10, 20, (trống)… |

Cú pháp sai thì dòng đầu hiện icon lỗi kèm lý do, và Enter không làm gì cả.

## Settings

| Setting | Mặc định | Ý nghĩa |
|---|---|---|
| `insertNumbers.order` | `position` | `position`: đánh số từ trên xuống theo vị trí trong file. `selection`: theo thứ tự tạo cursor. |
| `insertNumbers.replaceSelection` | `true` | Cursor đang bôi đen text thì thay thế text đó (`false`: chèn vào sau). |
| `insertNumbers.historySize` | `20` | Số lần nhập được nhớ. Xoá bằng lệnh **Insert Numbers: Xoá lịch sử**. |

## Cài đặt

```bash
./build.sh --install     # nâng version, build .vsix và cài vào VS Code
```

Nếu đang cài extension Insert Numbers cũ thì gỡ nó đi, vì hai bản dùng chung phím tắt `Cmd+Alt+N`.

## Phát triển

```bash
npm install
npm test                 # compile và chạy unit test cho phần parse cú pháp
```

Mở thư mục này trong VS Code rồi bấm F5 (**Run Extension**) để chạy thử trong cửa sổ Extension Development Host.

| File | Nội dung |
|---|---|
| `src/sequence.ts` | Parse chuỗi nhập (dãy cơ bản, hậu tố, template, điều kiện dừng) thành dãy giá trị. Không phụ thuộc `vscode` nên test được bằng `node --test`. |
| `src/expr.ts` | Parser và bộ tính biểu thức `=…`, tự viết, không dùng `eval`. |
| `src/random.ts` | Random có seed, để preview và giá trị chèn vào giống nhau. |
| `src/extension.ts` | Lệnh, QuickPick, preview bằng decoration, chèn bằng một lần `editor.edit`. |
