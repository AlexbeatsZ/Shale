# Server data lifecycle deployment — 2026-11-26

## Result

ROG Shale Sync Server0.5.1, Mojian Sync Server0.3.1 and Dayweave Server0.2.18 are live using original tasks, private config and formal data roots. Shared core0.3.4 implements finite manifest/receipt retention, serialized blob/upload GC, independent verified compressed snapshots and scoped upgrade rollback. AI Decision backup0.1.58 is a narrow source deployment over the existing production runtime (package metadata0.1.54 deliberately unchanged); controller is resumed and existing Node/Meta/Muse were not restarted.

Policy: recovery at04:00 process-local time;7daily/4weekly/3monthly representatives;20GiB per repository; verified latest/pinned points protected with capacity alerts. Sync history100revisions/30days, GC24h with upload grace24h. Upgrade keepLast1/7days, only verified managed points expire. Ordinary code update captures program/config; explicit data migrations alone capture formal data. SQLite uses Online Backup API and integrity checks; file recovery has independent compressed content-addressed objects, never live-blob hardlinks.

## Production evidence

| Product | Formal data | Additional sync blob history | Verified DR repository |
| --- | ---: | ---: | ---: |
| Shale | 4,249,869,996B | 101,533,089B /30 manifests | 3,525,941,611B /1 snapshot |
| Mojian | 2,744,927,194B | 1,077,866,875B /67 manifests | 1,319,626,189B /1 snapshot |
| Dayweave | 323,345,103B | No manifest history pool | 46,135,520B /1 snapshot |
| AI Decision | 293,318,656B SQLite | Existing business retention remains separate | 68,198,081B /1 archive |

All four recovery points were restored into new temporary directories and verified; formal roots were never overwritten. Shale restored original workspace/revision653/13302paths; Mojian original workspace/revision1676/1923paths. Authenticated manifest and Range206 after maintenance passed. Dayweave restored1321tasks/1830records, original818c2d6a hub identity and7paired peers, usage SQLite integrity=ok. AI restored2060deliveries/1333actions, SQLite integrity=ok; pre/post original IDs and accepted/uncertain/executed results preserved. Private proof resides in each service's managed metadata; sanitized metrics are in the Codex output JSON.

Dry-run and actual maintenance both found0expired blobs/manifests under the current policy; no recent history was forced out. Initial observed data was already much smaller than the earlier49GiB/53.46GiB reports; those historical totals are not claimed as reclaimed here. Removed a superseded Dayweave routine full-profile/program recovery347,003,467B and AI routine SQLite recovery293,318,656B only after the new independent DR and scoped program rollback had passed verification:640,322,123B (610.66MiB). Newly created DR repositories consume their reported space; this is not a claim of net disk reduction by that amount.

## Shale client0.1.103

Published desktop v0.1.103 (7 assets/latest) and android-v0.1.103 (non-debuggable arm64/original signer). Mac fixed certificate/identifier/certificate leaf/deep/strict and installed healthz passed. OMEN/ROG silently updated in Interactive tasks and left closed, versions0.1.103.0. K70 installed103 with original2026-11-23 firstInstallTime; tablet adb install returnedSuccess, then went offline; it later returned with parallel-work Shale0.1.104 installed, same firstInstallTime, which was retained. Device physical interactions/full-vault convergence are not claimed. OMEN's pre-existing paused real-sync/conflict boundary remains unchanged.

Changes bound orphan transfer caches while retaining baseline, outbox, incoming and conflict hashes. A superseded unapplied download dependency group is replanned against the current manifest after old server history expires; local originals/bases remain unchanged. Missing optional text merge ancestry enters review rather than blocking all work.

## Validation and limits

- Core38tests and offline package smoke; Shale682unit,14standalone and2extracted-package tests; type checks passed.
- Dayweave261domain/API and8server tests including real WAL/profile restore passed. AI46focused backup/maintenance/MCP tests andRuff passed; full1068passed with2pre-existing failures independently reproduced on originalHEAD (context length/notifier deadline).
- Mac native packaged WebViewer background suite passed. Existing packaged-startup default-browser path required explicitChrome; original installed0.1.102 and candidate0.1.103 both time out at the same `.cm-content` step. Windows packaged WebViewer retained the previously documented `.pane-drop-indicator` timeout; cleanup EBUSY initially masked it. No thresholds were relaxed and no complete Windows UI acceptance is claimed.
- Mojian large JSON chunking remains an explicitly deferred storage-format optimization; current blobs still deduplicate by full content hash, with finite history/DR bounds.
- Recurrence startup/catch-up and persisted maintenance success were observed. Multi-week/month expiration and day7 rollback expiration were exercised in isolated tests, not by waiting calendar months on production.

## Operations

Run product admin status/storage, cleanup/backup without `--apply` for dry-run, and restore only to a new absent directory. Keep manual important points pinned; capacity cannot evict the latest/pinned recovery point. Before restoring formally, stop the original owner, reconcile later acknowledged writes and preserve identities. Program rollback never restores an old business DB by default. Shale Git archive configuration is now `gitBackup`, separate from disaster recovery `backup`; production had no existing Git backup config to migrate. Gateway/Sakura/proxy settings were untouched.


## Final concurrency patch

Shared core0.3.4, Shale Server0.5.1 and Mojian Server0.3.1 serialize initial page creation with commit/GC, including the async historical-boundary read. This closes the race where GC could capture active-page pins before an already-started page had registered its snapshot. Final core38tests and both consumer service/package checks passed. The second production cutover uses authenticated draining shutdown rather than stopping an old task; no formal data backup copy is made for this code-only patch.


## Mojian client final delivery

v0.7.45 contains Windows EXE166,187,988B and production Android APK17,290,733B. The 37 real C# sync scenarios all passed on Windows (including expired ancestor + independent page), and Android full JVM348tests/0failures/2skips plus release assembly/lint passed. OMEN current EXE and ROG installed EXE were replaced with version0.7.45 while closed. Pad6Pro reconnected and was updated in place to0.7.45/code49, retaining firstInstallTime2026-11-16. K70 went offline before this Mojian installation and remains pending; it had already received Shale0.1.103. No user notes, existing sync conflicts or identity were replaced. Unrelated UI/macOS working-tree changes were preserved.
