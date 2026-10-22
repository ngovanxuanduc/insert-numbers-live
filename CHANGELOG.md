# Changelog

## 1.0.1

- Add a demo GIF and repository links to the Marketplace page.

## 1.0.0

First public release.

- Live preview at every cursor while you type; nothing is inserted until you press Enter.
- Single undo step for the whole insertion.
- Sequences: integers, zero-padded numbers, decimals, hex, letters, Roman numerals, dates, lists.
- `*k` repeat and `%k` cycle suffixes.
- Templates (`item_{001}`), expressions (`=i*2`), and stop conditions (`{!i >= 5}`).
- Random codes (`?6`, `?8d`, `?uuid`) that stay stable during preview and never repeat across cursors.
- Input history and settings for cursor order and selection handling.
