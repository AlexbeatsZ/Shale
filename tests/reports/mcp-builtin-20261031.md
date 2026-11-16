# Built-in desktop MCP — 2026-10-31

## Delivered behavior

Desktop 0.1.40 ships the native MCP adapter and pinned official Secure MCP
Tunnel 0.0.19. The MCP panel no longer looks for a companion source directory,
PowerShell launcher, Obsidian plugin or external Node installation.

The panel keeps manual Connect, adds local-client configuration copy and
host-local Tunnel settings. OS-backed safeStorage encrypts runtime keys;
missing encryption fails closed. Startup/panel mount do not connect remotely.
One application-owned Tunnel child forwards to the current instance's `/mcp`;
normal quit stops that child after the existing save acknowledgement.

The shared operation contract and native HTTP dispatcher still own the six
tools. Both bundled stdio and stateless Streamable HTTP use one MCP factory.
DocumentSession, context persistence, source coordinates, human review,
catalog/search and the actual file writer remain unchanged. The external
project reader/picker/IPC and `scripts/start-mcp.ps1` were removed together.

## Validation

- Unit suite: **469/469**, **85 files**.
- Server, Web and Desktop typechecks: passed.
- Focused MCP browser suite: **6/6**, 24.2 seconds. Includes exact selections,
  path-only context, one-shot delivery, persistence, manual retry and the
  cross-platform settings/copy interface without a project picker.
- Isolated production compilation and Windows NSIS packaging: passed.
- Standalone dependency checks: backend and bundled MCP both passed.
- Actual packaged Windows Electron executable with a separate profile/Vault:
  HTTP and stdio initialize, enumerate the same six tools, read the test note,
  and submit two proposals that remain `awaiting_user_review`. No note bytes
  change. Stdio uses the packaged WebObsidian executable with PATH pointed at
  an empty directory, and the obsolete companion path intentionally does
  not exist.
- Actual packaged IPC/settings: missing Tunnel credentials show a real
  configuration error, OS-encrypted dummy key roundtrip passes, no secret
  returns to the renderer, configuration copying matches the bundled entry,
  and the original desktop-config fields are retained.
- Packaged official Tunnel binary reports **0.0.19**. Its supported
  control-plane/MCP/health flags match the launcher's fixed argument array.
- Zero renderer page errors in native acceptance.
- Native evidence: `.local/builtin-mcp-20261031/native/result.json` and
  `native-mcp-builtin.png`.

An initial full unit run found nine obsolete desktop test fixtures without
the new app-path discovery method. Those fixtures were updated; the complete
469-test rerun passed. An initial server test typecheck needed an explicit
JSON result type; the final Server/Web/Desktop typechecks pass.

## CI follow-up — 2026-11-01

The first 0.1.39 tag (`ec82cfb`) passed native Windows/macOS/Linux packaging
in release run 41268820617. General CI 41268818106 exposed an actual new
Docker/web-only build failure: importing the launcher's state type also
resolved its Electron safeStorage type. The launcher now declares only the
three-method encryption boundary it actually calls, keeping Electron out
of the Web dependency graph. Version 0.1.40 replaces the unpublished 0.1.39
draft; pushed tags are not rewritten.

That CI run also reported a 5-second runtimeDependencies test timeout and
318 passed/7 failed browser contracts. The exact previous commit 040dc1a
(CI 41262143034) already has the same unit timeout and five matching
browser failures: quoted formula links, rich footnote navigation, footnote
slot 1, scroll-500 pixel parity and right-ribbon count. The two remaining
current failures (embedded range editor locator and footnote slot 0) are
not attributed by that baseline result. They are not relabeled as passing.
All six MCP browser cases passed in the current CI run as well as locally.

## Publication and deployment closeout — 2026-11-01

- Resumed Codex session `01a194f7-8e61-7241-a7b8-7b76b666376e`
  (定位 WebObsidian MCP); no feature reimplementation or full test rerun.
- HEAD, origin/main and remote `v0.1.40` all resolve to
  `9f4b8e843c96867b8a17c26c29a6eb618e97ece9`.
- Final native release run **41273197923 passed**; all 16 Windows/macOS/Linux
  release assets were uploaded. Published the existing draft as the latest
  release with feature, verification and known-CI boundaries.
- General CI **41273195711 remains failed**: Typecheck & build and Browser
  contracts jobs failed; Docker image builds passed. No all-green regression
  claim and no unrelated fixes in this closeout.
- No WebObsidian process was found before installation. GitHub asset download
  failed at the local network connection, so deployment used the already
  verified local 0.1.40 NSIS (129,830,503 bytes), not a rebuild. This differs
  byte-for-byte from the CI installer (129,830,430 bytes), with the same source
  commit. The installer wait returned no usable exit-code value; actual installed
  EXE readback confirms **0.1.40 / 0.1.40.0**, and installed resources contain
  `server/dist/mcp.cjs` and `mcp-tunnel/tunnel-client.exe`.

## Live connection follow-up — 2026-11-01

User explicitly stopped builds. Proposed source proxy/discovery changes were
withdrawn before any test/build/deployment; no application source diff remains.
The user added tunnel-client.exe to the current Proxifier Default Proxy rule.
Two bounded diagnostic starts of the bundled binary reused existing encrypted
settings privately (no key output/change) and were stopped afterwards; the
user application and unrelated codex-plus Tunnel were not stopped.

The actual binary still attempted 127.133.1.10. A backed-up, single-host
Proxifier DNS exclusion and targeted cache flush changed resolution but yielded
TLS handshake timeout, not a working connection. That exclusion was reverted;
the user's process rule remains. Backup: Temp/.agents/webobsidian-mcp-dns-nnfyggb6.
Separately, actual local discovery URLs return 200 text/html. Tunnel health
reports ready=false, /readyz=503 startup catalog pending, and OAuth
 discovery_complete=false with repeated HTML-to-JSON parse errors. Network
routing alone cannot correct this local discovery failure. No working remote
connection is claimed. Temporary diagnostic source was removed; no build or
installed-resource modification occurred in this follow-up.

## Proxifier configuration incident — 2026-11-01

During network diagnosis, the agent passed a forward-slash Windows profile path
to Proxifier. The program treated the path as a profile name, prepended the
Profiles directory, and reset Default to two rules with the proxy configuration
lost. This is an agent-caused configuration incident, not a user configuration
mistake. The untouched pre-edit backup has six rules and one proxy, including
the user's tunnel-client.exe entry. It remains at
`C:/Users/Meta/AppData/Local/Temp/.agents/webobsidian-mcp-dns-nnfyggb6/Default.ppx`.

The profile files were restored from that backup. At the latest recovery read,
Default and the original recovery copy each contained six rules and one proxy;
the user-selected active profile was Recovered-MCP-202611012. Its latest contents
were also copied to Default, with a separate snapshot under
`Temp/.agents/proxifier-default-rename-c98te83s`. A relative Default.ppx command
then failed with File not found. No claim is made that Default is active.
Stop command-line reload attempts and load Default through the native UI;
retain recovery files until the active profile and all rules are confirmed.

TLS failures after the erroneous reload are confounded by reset proxy rules;
they do not establish that the user's original rules or a DNS-only fix were
insufficient. The user subsequently reported the actual successful recovery:
back up/move all profiles, let Proxifier regenerate/select Default, close it
fully, replace the generated Default with the complete backup, and reopen.
File -> Load Profile did not select Default in this incident. This is a
high-impact recovery method, not permission to delete profiles automatically.
Latest read-only verification confirms active **Default, six rules, one proxy**.
Durable notes were corrected in the project AGENTS and Windows networking
knowledge; no further proxy writes were made.

## Discovery hotfix delivered without installer build — 2026-11-01

- Root-mount the existing MCP router and explicitly answer protected-resource
  and authorization-server metadata paths, including resource suffixes, with
  JSON 404. The application provides no OAuth server. Existing /mcp POST,
  method rejection and local-only guard remain unchanged.
- Focused `npm run test:unit -- server/src/routes/mcp.test.ts`: **3/3 passed**,
  89ms. Covers shared six tools, discovery before a real HTML fallback, four
  metadata paths, normal SPA navigation and local access restrictions.
- Without compilation or packaging, precisely synchronized those route/mount
  changes to installed `resources/server/dist/index.mjs`. Every old pattern
  was required to occur exactly once; all other bundle content was preserved.
  Original backup: `Temp/.agents/webobsidian-mcp-oauth-hotfix-ht7cp7te/index.original.mjs`.
  `node --check` on the updated bundle passed before replacement.
- The running application accepted a normal save/close request and exited;
  no force stop. Restarted installed WebObsidian PID44832. Its new instance at
  port59414 answers both protected-resource discovery paths with **404
  application/json**, not HTML. Temporary restart script removed.
- No installer/full build, all-suite rerun, product proxy code, hardcoded proxy,
  global environment, key change or unrelated Tunnel restart. During 28 seconds
  of observation no application-owned Tunnel was present: the manual Connect
  click, actual Tunnel readiness and remote ChatGPT receipt are still pending.
  Do not describe the entire remote connection as verified.

## Remote 429 investigation — 2026-11-01T07:00Z

Read-only live check: local health 200, metadata discovery 404; application-owned
Tunnel PID7108 and /readyz200. OAuth is settled, discovery_complete=true and
not_advertised. However control-plane health is degraded/backoff, http_status401,
consecutive_failures547; dispatcher completed0 and queue enqueued0. The remote
caller reports429, but the exact gateway mapping cannot be established from
that summary alone. Confirmed blocker is upstream authorization, not local MCP
startup. The specific key mismatch/revocation/permission cause is not established.

Launcher healthy() checks only /readyz, so its connected state can falsely imply
cloud authentication. No credential/proxy/runtime/note mutation was made during
this check. Separately, the current shared operationContract allows only one
existing Markdown edit proposal: create and rename are unsupported, even after
authentication is repaired. No file operation is claimed successful.

## Delivery boundary

OMEN is installed at 0.1.40 with the local discovery-only service hotfix above.
The application was normally restarted for this hotfix. No test wrote live
notes; application configuration, cloud registrations and remote Tunnel
credentials were not changed. Earlier native tests used isolated profiles/Vaults and dummy keys.
Remote Tunnel readiness and ChatGPT end-to-end receipt are not claimed.
Mac/Linux release builds passed, but installation and native physical acceptance
on those hosts remain separate.
