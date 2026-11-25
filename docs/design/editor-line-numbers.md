# Editor line numbers

PRD 1.62, 2026-11-25. Settings › 编辑器 › 文档视图 exposes `ui.lineNumbers`
with `off` (default), `absolute` and `relative`. Absolute numbering is the
source document's logical line number starting at 1. Relative numbering is
the absolute distance from the primary selection head's logical line; that
line always displays 0, above and below display 1, 2, 3, … . Wrapped visual
rows do not add source lines. Each split computes from its own cursor.

Reuse CodeMirror's native `lineNumbers` and `gutter` APIs. The relative gutter
invalidates on primary-line changes, document and viewport updates, with a
width spacer sized for the whole document. No DOM overlay or second text model.
The existing UI settings contract/API persists the preference. settings-changed
updates a small subscription and reconfigures only one gutter Compartment,
leaving document/selection/Vim/history intact. No line numbers in reading,
locked documents or embedded fragments. Inline titles and footers stay full-width
rows outside the source gutter/content pair.
