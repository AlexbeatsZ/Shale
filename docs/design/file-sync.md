# Native file sync and Git backup

## Ownership and transport

Native HTTPS file transport owns live Markdown, Canvas and binary attachments, not Git.
DocumentSession retains local saving/history, textFile owns physical publication, and
the existing watcher/fileupdates owns indexing and notifications. No second watcher,
editor, parser or index is introduced. Git is only periodic backup and conflict history.

Each Vault stores its enabled flag, ordered addresses, token and interval in
`.shale/sync.jsonc`. The existing Vault configuration reader/JSONC parser
and revision-checked physical writer are authoritative; application settings contain no
second copy or implicit import. The file carries the access token, so Git backup never
records it (see Vault Git configuration); native transport itself replicates it between
the user's synchronized devices. A fresh clone enters the connection once in settings.
Only local checkpoint/outbox/incoming journals, caches and recovery files stay in the
device's application data directory. Every pass starts at entry one; attempts are sequential.
No direct/public categories, probing races, speed ranking or last-success promotion.
Use the first available address for that pass. On transport failure, retry the durable
operation later, starting at entry one. Authentication, identity, rollback and conflict
errors stop rather than silently switching data authorities. All addresses must expose
the same immutable workspace identity. HTTP is allowed only for private/loopback IPs;
public connections require certificate-verified HTTPS. Redirects are not followed.

The optional Sakura Web route is /shale-sync/v1/, separate from Dayweave,
Mojian and subscriptions. No extra tunnel is required. Backend credentials/data are
independent. Existing services/tasks and live Vaults are never implicitly changed.

The standalone server is versioned and released independently with `sync-server-v*`
tags. Its thin `createSyncServer` adapter delegates durable storage, streaming blobs,
CAS, receipts and draining close to an exact-release-pinned `@alexbeatsz/file-sync-core`.
`protocol.mjs` remains the Shale path/manifest authority and the adapter retains
printable ASCII 32–512 token policy plus Origin/query/fragment rejection. Existing
gateway exports, 18744 port, v1 route, receipt fingerprints and storage layout remain
compatible. No second storage kernel is maintained in this repository. The tested core
and license/notices ship inside each server package; Node 22+ needs no runtime install
or sibling source checkout. `core-source.json` and `BUILD-INFO.json` record provenance.
Server releases never change desktop/mobile versions or the client's latest Release.

## Discovery and interrupted transfers

With file-sync-core 0.2.0, the server exposes paged snapshots, changes and
resumable blobs. Clients probe these endpoints on their selected address. Shale binds discovery to the workspace identity and checks
high-water revisions before accepting data. The first snapshot stays pinned across
pages. Later syncs read changes against the previous remote snapshot and persist
each continuation. An expired cursor allows one fresh snapshot per pass. Servers
without these capabilities still use the original v1 manifest and blob endpoints.

The incoming journal records hashes before fetching. The client first verifies
cached blobs locally, then streams remaining distinct digests through up to four
workers. A slow remote stream cannot hold cached files or independent files
completed by other workers. Dependencies are fixed for the pass. Each complete
group can publish through the existing edit gate once its ready flags are durable.
The first complete group and worker drain points handle a short queue, while
larger queues batch readiness in checkpoints. Each publish updates baselines and
retires applied journal entries together. Unfinished streams retain partial bytes. Resumed downloads verify the complete
digest. Uploads use server offsets in 8 MiB chunks and the existing operation
receipt still guards manifest publication. Held paths and their ancestors are
indexed once per pass. The status bar shows completion only after the first full
pass, with no pending items and a caught-up discovery watermark. A folder/file shape change remains grouped across case
aliases without blocking unrelated siblings.

## Personal deployment

The user's deployment requires only
`http://100.106.169.46:18744/shale-sync/v1/` in each device's connection
list as of 2026-11-14. The ROG service binds its Tailscale IPv4 address through its
existing `server.json` and `ShaleNativeSync` task. The production workspace is
`76fcca29-885b-4dd1-832e-cfac4f07cc09`. This deployment uses the existing
endpoint model.

## Files and safety

Reuse Mojian's immutable SHA-256 blobs, exact-version CAS, retained tombstones and
idempotent operation receipts. Uploads/downloads stream to disk, never decode attachments
as text. Local metadata signatures reuse staged blobs on restart; existing watcher
events identify dirty paths, which are rehashed even if timestamps are unchanged.
Idle passes do not walk the Vault again. Restart scans durable files once. Renames are an atomic
manifest addition/deletion; identical blob content is reused. Empty directories are not
synchronized. Case-only aliases and file/directory shape conflicts stop for explicit
handling instead of deleting existing directories. Per-file limit is 1 GiB. Server
history/blobs/receipts have no automatic GC.

Only .shale is included from .shale; plugin state, workspace layouts,
.git, .trash, Syncthing metadata and temporary files are excluded. Application sync
credentials intentionally travel with the Vault configuration: use a private Vault
repository and grant access only to trusted devices. General settings and connection
responses never expose the plaintext token; the dedicated password field returns a mask.
User-authored files are not scanned for secrets. Reject
links and Syncthing-managed roots instead of enabling two file writers over one library.
No automatic live-Vault selection, migration or seed choice. Configured Vault files
propagate through the same native file transport; no separate configuration channel.

Three-way comparison uses local bytes, acknowledged baseline and remote manifest.
Persist staged outgoing blobs and one stable operation before submission; uncertain
commits retry the same ID. Incoming blobs are verified before an on-disk apply journal
is written. The existing maintenance gate blocks dirty editor/Canvas sessions during
publication, while the shared physical writer uses binary CAS.
Notifications produced during maintenance are released only after the existing client
lease is released, so refreshed documents never read a partially published pass.
Read-only plugin adapter operations share one operation predicate with the server
gate and browser request accounting; an adapter read arriving during maintenance waits
for release and then checks Vault identity. Adapter writes remain rejected, and unrelated
request/identity guards retain their existing behavior.
Restart recovery replays
the local journal before opening an editable library when enabled. Disabling sync keeps
the journal but does not replay it. Recovery errors remain visible without preventing
the application from opening. This is per-file crash recovery,
not an all-files filesystem transaction or simultaneous handwriting merge.

On Android, the sole embedded runtime owns its private sync-state directory.
A process-local lock keyed by that directory serializes recovery, sync and
conflict resolution across engine instances. Android may terminate the process
without cleanup or reassign its PID to another app, so legacy PID lock files
are ignored in the embedded runtime. Android shared storage (FUSE) rejects hard
links, so creating a file that does not exist yet uses `createWithoutReplace`: link
first, then an existence check plus rename inside the per-path write queue. Desktop and standalone hosts continue to
coordinate through the disk lock.

Conflicts never choose newest timestamp or insert markers into working notes. Retain
both exact binary/text versions plus deletion metadata in local recovery storage. When
Git backup is enabled, additionally record local/remote snapshots on separate branches
without switching the working branch or changing its index. Binary conflicts need an
explicit version choice. Native sync disables per-save Git commits and background Git
pull; the existing Git timer instead commits periodically and optionally pushes backups
to per-device shale-backups branches, together with retained conflict branches.
It also attempts a normal non-forced push to the configured repository branch, making
the shared connection discoverable by a fresh clone. If that branch has diverged or
rejects the update, the successful device backup remains available; never pull, merge,
force-push or overwrite the other device's repository history to make this succeed.
Manual pull/clone is blocked while native synchronization owns file transport.

## Automatic resolution and conflict review (2026-11-22)

A two-sided difference is resolved without asking only when no edit can be lost, and the local
version is first copied to `<state>/recovery/<date>/<path>` and logged in `resolutions.json`:
- On first connection, identical local and remote bytes acknowledge the path directly. Differing
  local content, including content for a remotely deleted path, enters review when the client has
  no acknowledged ancestor for that path. V1's global blob inventory cannot establish lineage.
- Both sides edited a text file (`syncMerge.textExtension`, UTF-8, ≤ 8 MiB) and the line-hunk
  three-way merge `mergeReview` from `markdown-core/review.ts` (the same core MCP review recovery
  uses) finds no touching hunks. The merge result is published locally on top of the remote base
  (incoming `content`), and the follow-up pass uploads it.

Remaining conflicts are reviewed where the files are, VS Code style, not in settings:
the file tree shows a 同步冲突 group plus A/M/D decorations (server-only files appear as virtual
rows), the status bar has one-click sync with the conflict count, and an open text conflict uses
the MCP review presentation (`lib/review/view.ts` `reviewExtension` with `lib/review/sync.ts` as
source): local lines red, server hunks green with per-hunk accept/reject. When no hunk is pending
the note is saved and the path resolves as `local` (unchanged) or `merged` (current file kept on
the remote base, uploaded next pass). Added/deleted/binary files use the file-level panel.
Resolution may cover a subset of paths; the rest stay in the same conflict.

## Liveness: one problem never stops the whole Vault (2026-11-25)

Failure that triggered this: the tablet's renderer WebSocket dropped (Android WebView) and the renderer
never reconnected. With zero connected windows the maintenance gate refused every publication
("没有可确认编辑状态的应用连接"), the journaled incoming files were retried first on every pass, and the
pass aborted before scanning or uploading. Mac edits reached the server but the tablet stayed stale until
the app restarted. Mojian has the same shape: one retained conflict blocked unrelated incoming changes.
Mature tools (Syncthing, Dropbox, Obsidian Sync, Dayweave's own hub) isolate problems per file. Rules now:
- The renderer socket reconnects with backoff (0.5 s doubling to 10 s, immediately on
  visibilitychange/online/pageshow). On every reconnect it reloads the tree, refreshes every open
  document and conflict list, because file events sent while disconnected are lost. Returning to the
  foreground also requests one sync pass (throttled to 5 s), like Dayweave's scheduler.
- The server pings sockets every 30 s and terminates those that miss a pong, so a vanished window
  cannot stall each gate check for its 5 s acknowledgement timeout.
- Sync publishes with `withVaultMaintenance(..., { unattended: true })`: zero connected windows means no
  unsaved buffer on this host, and a window with a dead socket still saves through `baseRevision` CAS and
  gets a document conflict instead of overwriting. Connected windows are still asked and their blockers
  (unsaved/conflicted/saving documents) still refuse publication. Attachment cleanup keeps requiring a window.
- A gate refusal (HTTP 409) of the journaled downloads at the start of a pass is not fatal: the pass still
  scans and uploads, then retries the journal at the end. Uploads and downloads cover disjoint paths, so
  the outbox is submitted before the journal is applied.
- A retained conflict holds back only its own paths (and paths still journaled). Every other path keeps
  synchronizing in both directions; status stays `conflict` with "其他文件已同步；N 个冲突文件待处理".
- Windows report blocked document paths for sync and retain global blockers for stale Vault sessions,
  active mutations and trusted native plugins. One maintenance lease keeps notifications and writes
  paused while it publishes eligible groups. An older renderer that reports only global blockers
  continues to block the lease conservatively.
- A group joins affected parent/child names and unambiguous same-revision moves with identical bytes.
  A dirty path defers its whole group. A local edit after planning retains both sides of the group
  in the same checkpoint transition that retires its journal entries. Unrelated groups can continue.
  Replacing a directory with a file checks that the journal accounts for every child before removing
  empty directories. Case-only aliases still require explicit handling under the existing v1 contract.
- Reviewing one conflict appends its incoming choice to existing journal work. The incoming path's
  acknowledged base is set after application. The checkpoint keeps the seen revision separately
  from the revision of fully queued work. Partial progress is distinct from last complete sync.

## Server-side Git backup (sync-server)

Direction (user, 2026-11-02): the always-on sync server is the single Git backup writer;
client Git is removed in a later step after the server backup is live. The server's
manifest is the merged authoritative state and each revision is an atomic snapshot, so
history is linear and never captures a half-edited working tree.

`sync-server/backup.mjs` runs inside the server process (opt-in `backup` config object)
and as `--backup-once` / `--backup-dry-run` CLI modes. It never changes sync data: it reads
`state.json` (renamed atomically by the core) and immutable `blobs/<sha256>` files.
The backup repository is a separate non-bare Git directory whose work tree holds only the
snapshot's `.gitignore`/`.gitattributes` files. Git itself decides ignore and LFS rules
(`check-ignore --no-index`, `check-attr filter`, `core.ignorecase=true` like the Windows
clients), so no gitignore/attribute matcher is reimplemented. Connection files
(`sync.jsonc`, `git.jsonc`) are always excluded. LFS entries become standard spec-v1
pointers; the sync hash is already the LFS SHA-256 oid, so the blob is hard-linked (copy
fallback) into `.git/lfs/objects` and nothing is re-hashed. Regular files are written
with `hash-object -w` under `core.autocrlf=true`: the existing history was committed by
Windows clients with that system default, so CRLF text is stored as LF (sync keeps the raw
bytes). With raw bytes, a real STEM dry run reported hundreds of modified SVGs; with
normalization it matched `3b3f1cc` exactly (6445 files, 5573 LFS, 0 changes). A
temporary index builds the tree; an unchanged tree
creates no commit. The first run fetches the remote branch and continues its history;
later runs commit on the local branch, `git lfs push`, then a normal non-forced push.
A rejected push stops with an error and is retried next interval; never force, pull into
data or merge. One lock file serializes runs. Credentials come from the host's Git
credential helper (`GIT_TERMINAL_PROMPT=0`), never from configuration.

## Vault Git configuration

Git backup settings now belong to `.shale/git.jsonc`: enabled,
remote, branch, optional token, authorName, authorEmail, autoSync,
autoCommitOnSave, intervalSec and lfsPatterns. The existing settings UI/API reads
and writes this file through the same Vault configuration reader and
revision-checked writer as sync.jsonc. Git operations, the periodic timer and
conflict history read this one authority; application-global `settings.json.git`
is no longer used. A fresh Vault defaults to Git disabled. Existing legacy
settings bytes are not silently imported or assigned to a different Vault.

Both connection files can hold tokens, so Git backup excludes them: each commit
writes `/.shale/sync.jsonc` and `/.shale/git.jsonc`
to the repository's `.git/info/exclude` and untracks copies committed by earlier
versions (`git rm --cached`, working files stay). Conflict branches skip them too.
No token is stored in Git history or encrypted; the files stay plain device/Vault
data. Tokens are masked in API responses. Leave the Git token empty to use
the device's existing Git credential helper. Git configuration is read by Git/API operations, not every editor
input or ordinary application-settings read.

Git LFS progress is explicitly enabled for the existing child process. The
120-second no-output timeout still detects a stalled command without aborting a
healthy first backup simply because LFS suppressed progress on piped stdout.

## Validation boundary

Use temporary Vaults for all protocol, binary, failover, offline, retry, conflict and
recovery tests. Source/build checks are not live Sakura, physical device or deployed
client acceptance. Installing a ROG startup task or changing its shared gateway requires
explicit approval; preserve the existing task XML and do not restart SakuraFrpService.
