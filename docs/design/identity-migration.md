# Shale identity and data migration

> 2026-11-26（PRD 1.71）已退役：所有设备完成迁移后，用户要求删除全部旧格式兼容。profile/运行时设置/Vault `.obsidian` 配置迁移、浏览器存储键改名、macOS 钥匙串迁移助手及 `migrate-user-data`/`migrate-equations` 脚本均已删除；以下内容仅为历史记录。删除前确认 Mac/OMEN/ROG 无旧 profile 或 `.obsidian`。

Requested 2026-11-23: replace the previous product identity throughout the repository,
installed native shells, application data, Vault configuration, note roots and services.
Repository: `AlexbeatsZ/Shale`; npm scope: `@shale`; desktop identifier:
`io.github.alexbeatsz.shale`; Android: `io.github.alexbeatsz.shale` (tablet certificate
variant retains `.debug`). macOS keeps the fixed Local Development Code Signing certificate.
The main profile is explicitly `<appData>/Shale`; it does not depend on npm package names.
Vault configuration is `.shale/` with native JSONC files directly under it; snippets,
appearance/types and optional compatibility plugins use this same root. Sync uses
`/shale-sync/v1/` and keeps workspace identity, blob storage and receipts.

Migration runs before indexing/watchers/sync. It preflights collisions and refuses links,
moves existing files rather than recreating defaults, and is restartable. Old names are
recognized only by migration and third-party compatibility adapters. Source provenance,
licenses, upstream URLs and real third-party plugin identifiers remain truthful.

Changing Android application ID creates a distinct Android installation. Install the signed
new package first; migrate data while both packages are stopped, preserve the original
certificate, apply the new UID and the exact SELinux MCS level from the new app process, and restore the existing grants. Generic restorecon does not recompute app-specific categories and leaves copied shared_prefs inaccessible; use the new package process category for its app_data_file tree, never relax SELinux. Keep the
old installation until the new one passes acceptance. Do not silently uninstall private data.

The user's personal Vault parent is also renamed to Shale. Update effective Vault paths,
allowed roots, scoped settings keys, script-store identity paths, local sync journals,
MCP endpoint hints and startup commands together while stopped. Never modify note prose
or scripts with broad brand substitution. Read-only searches identify external configuration
references; update only machine-owned path fields and dedicated application configuration.

Validate temporary old profiles and Vaults, collision/restart behavior and sync policy,
then complete production builds and isolated native WebViewer regression before deployment.
Report build/release, installed identity and real device acceptance separately.

On Windows, persisted sync roots use the same lowercase path key as FileSyncEngine.
Normalize the root after replacing the note parent, then rename the hashed scope directory;
matching filenames alone do not establish a valid checkpoint. Keep historical path keys,
versions, device/workspace IDs and receipts unchanged so ordinary sync publishes config moves.

The owner-operated data migration also translates the native editor selector
`.cm-s-obsidian` to `.cm-s-shale` in CSS snippets. It leaves executable snippets,
third-party plugin identifiers and all unrelated styling intact.
