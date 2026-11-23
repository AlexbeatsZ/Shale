# Shale identity and data migration

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
certificate, apply the new UID/SELinux ownership and restore the existing grants. Keep the
old installation until the new one passes acceptance. Do not silently uninstall private data.

The user's personal Vault parent is also renamed to Shale. Update effective Vault paths,
allowed roots, scoped settings keys, script-store identity paths, local sync journals,
MCP endpoint hints and startup commands together while stopped. Never modify note prose
or scripts with broad brand substitution. Read-only searches identify external configuration
references; update only machine-owned path fields and dedicated application configuration.

Validate temporary old profiles and Vaults, collision/restart behavior and sync policy,
then complete production builds and isolated native WebViewer regression before deployment.
Report build/release, installed identity and real device acceptance separately.
