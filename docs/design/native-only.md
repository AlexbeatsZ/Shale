# Native application boundary

Supported application targets are desktop (Windows/macOS/Linux) and Android.
The 2026-11-01 retirement covered the browser product, browser deployment and
preview, Docker application images and browser-specific note navigation.
Desktop WebViewer and its userscript manager were restored on 2026-11-19.
See [Desktop WebViewer](web-viewer.md) and [userscripts](browser-userscripts.md).

## Existing owners retained

The `web/` source directory is the shared native renderer. React, CodeMirror,
DOM, PDF workers, local iframe rendering/printing and Vite compilation remain
implementation tools of the native applications. Removing them would remove the
editor rather than retire a product target. No second native renderer is added.

Electron and Android retain their bundled loopback Node runtime. Files,
configuration, indexing, local HTTP/WebSocket messages, reviewed MCP operations,
native sync and optional Git backup keep their existing owners. The separately
released `sync-server/` remains a headless network service.

External hyperlinks in note content still delegate to the operating system.
This is a native content action; it does not reopen the application as a webpage.

## Browser product features retired on 2026-11-01

- Docker image/Compose/environment deployment and CI job; standalone renderer
  development/preview and server start scripts; development CORS/proxy path.
- Application note URLs, URL/history synchronization, copy-application-URL
  actions and the menu which opened a note in a browser window.

Desktop and Android identify their native renderer with their existing HTTP
user-agent facility. Static application resources are available to those shells;
ordinary browser requests return 404. No SPA catch-all or note-URL route remains.
The marker is a product selection mechanism, not authentication. Existing
loopback/Vault/operation guards remain authoritative.

Chromium worker requests can use the session default User-Agent even when the
native page sets its marker. Requests with `Sec-Fetch-Dest: worker` may load the
bundled hashed PDF/PPT worker entry scripts under `/assets/`. They still pass
the loopback request guard. Application HTML keeps the native marker selection.

Desktop layout restore validates saved WebViewer addresses. Android ignores
these layout entries. The native userscript manager reuses the existing
per-Vault store and can read legacy plugin data. Plugin policy keeps the native
manager the sole owner of userscript execution.

## Future work

Keep the app deployment targets native. Preserve desktop WebViewer and its
userscript management and scheduled updates. Renderer tests may use Chromium
as an engine for DOM/editing contracts. Keep that evidence separate from native
window, Android device, physical IME/touch and live-Vault acceptance.
