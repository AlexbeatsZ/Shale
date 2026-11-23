# Native heading level commands

The native registry exposes `editor:promote-headings` (提升标题层次) and
`editor:demote-headings` (降低标题层次), based on the user's corresponding
`07模板/Cmd-提升 标题层次.md` and `Cmd-降低 标题层次.md` templates.
Command palette, shortcut settings and configured-menu command actions use the
same two definitions; no template engine or duplicate command registry is required.

With a primary selection, adjust all included ATX H1–H6 markers by exactly one.
An H1 blocks the whole promotion; an H6 blocks the whole demotion, preserving
relative hierarchy rather than clamping individual headings. Without selection,
inspect only the cursor line. Partially selected hash markers and the line at an
exclusive selection end are not changed. Secondary selections map through the
same transaction but do not expand the primary operation's scope.

Reuse the view's full `syntaxModel`, core metadata exclusions and formula ranges.
Code, YAML, comments, HTML and formulas are protected. Underlined prose and the
independent seven-hash BodyHeading syntax do not participate. Valid ordinary
headings inside quote/list containers retain their existing container prefixes.
Tab-delimited ATX headings are recognized by the same shared grammar extension
used in CodeMirror and the source model; marker-only edits retain the tabs.
The native behavior deliberately avoids the templates' literal-regex changes to
examples inside code or metadata.

Only one hash is inserted or removed per target; indentation, title text,
inter-marker whitespace, closing hashes, BOM and source line endings are retained.
One CodeMirror transaction follows the existing DocumentSession history and
autosave path. Selection direction and positions map with the source changes.
The command does not invoke Linter or explicitly save/format the document. Normal
manual-save formatting still follows the user's independent Linter configuration.

Commands require a focused editable Markdown view, reject stale-Vault sessions
and document conflicts, and act on the focused split view rather than assuming
the main store's active file. There are no default shortcuts.

Validation remains static only: TypeScript, isolated bundles and prepared
`web/src/lib/headingLevels.test.ts` regression source. No unit/browser/server/
Electron execution, live-Vault edits or portable package is authorized by this task.

## Explicit body heading command (2026-11-22)

`editor:set-heading-7` exposes 设为 7 级标题（正文内标题） through the same native
catalog, palette, shortcut settings and configured menus as levels 0–6.
It calls the existing `toggleLineStyle(view, 7)` and sets `####### ` (level 0 removes it);
BodyHeading parsing/rendering already supports this syntax. Explicit level 0–6 commands
also accept an existing BodyHeading so it can be converted back to a paragraph or ordinary heading. The old
`obsidian-heading-shifter:apply-heading7` ID resolves to the new command so imported
bindings work too. Promote/demote still operate only on H1–H6.
