type Transfer = { path: string; expected: string | null; previousHash?: string | null; entry: { version: number; hash: string | null; directory?: true } };
type Entry = Transfer['entry'];

/** Identity of a directory item in three-way comparison; file identities are SHA-256 hex digests. */
export const DIRECTORY = 'directory';
export const identityOf = (entry: Entry | null | undefined): string | null => entry?.directory ? DIRECTORY : entry?.hash ?? null;

/**
 * Three-way decision per item (Syncthing semantics). A directory has no content to lose, so it wins over
 * a deletion on the other side; a file on one side and a directory on the other is reported, not guessed.
 */
export function planSyncPath(base: Entry | null, local: string | null, remote: Entry | null, blocked: boolean) {
  if (blocked) return { decision: 'blocked' } as const;
  const remoteId = identityOf(remote);
  const baseId = identityOf(base);
  if (local === remoteId) return { decision: remote && remote.version !== base?.version ? 'adopt' : 'no_change' } as const;
  if (local === baseId) return { decision: 'download' } as const;
  // First connection: a remote deletion cannot prove it saw this local file, so it is reviewed.
  if (!base && remote && remoteId === null && local !== DIRECTORY) return { decision: 'conflict' } as const;
  if (remoteId === baseId) return { decision: 'upload', expectedVersion: remote?.version ?? 0 } as const;
  if (local === DIRECTORY && remoteId === null) return { decision: 'upload', expectedVersion: remote?.version ?? 0 } as const;
  if (remoteId === DIRECTORY && local === null) return { decision: 'download' } as const;
  if (local === DIRECTORY || remoteId === DIRECTORY) return { decision: 'failed', message: '同一路径一边是文件、一边是文件夹，请保留其中一个' } as const;
  return { decision: 'conflict' } as const;
}

/** Index held paths once so each candidate only visits its own ancestors. */
export function indexRelatedPaths(held: Iterable<string>) {
  const exact = new Set<string>();
  const ancestors = new Set<string>();
  for (const path of held) {
    const name = path.toLowerCase();
    exact.add(name);
    for (let slash = name.indexOf('/'); slash >= 0; slash = name.indexOf('/', slash + 1)) {
      ancestors.add(name.slice(0, slash));
    }
  }
  return (path: string): boolean => {
    if (!exact.size) return false;
    const name = path.toLowerCase();
    if (exact.has(name) || ancestors.has(name)) return true;
    for (let slash = name.indexOf('/'); slash >= 0; slash = name.indexOf('/', slash + 1)) {
      if (exact.has(name.slice(0, slash))) return true;
    }
    return false;
  };
}

/** Shape changes share an ancestor; infer a rename only for an unambiguous same-revision move. */
export function groupIncoming<T extends Transfer>(items: readonly T[]): T[][] {
  const indices = items.map((_, index) => index);
  const paths = new Map<string, number>();
  const moves = new Map<string, { added: number[]; removed: number[] }>();
  const root = (index: number): number => {
    while (indices[index] !== index) {
      indices[index] = indices[indices[index]];
      index = indices[index];
    }
    return index;
  };
  const join = (first: number, second: number) => { indices[root(first)] = root(second); };
  for (const [index, item] of items.entries()) {
    const name = item.path.toLowerCase();
    const alias = paths.get(name);
    if (alias !== undefined) join(index, alias);
    paths.set(name, index);
    const previous = item.previousHash === undefined ? item.expected : item.previousHash;
    // Directory renames need no content pairing: each directory item applies on its own.
    if (item.entry.directory || previous === DIRECTORY) continue;
    const digest = item.entry.hash ?? previous;
    if (!digest || Boolean(item.entry.hash) === Boolean(previous)) continue;
    const key = `${item.entry.version}/${digest}`;
    let move = moves.get(key);
    if (!move) moves.set(key, (move = { added: [], removed: [] }));
    (item.entry.hash ? move.added : move.removed).push(index);
  }
  // Only a file/directory shape change binds descendants to their ancestor. Ordinary directory items stay
  // independent, otherwise one open note would hold back every other change in its folder.
  const isFile = (item: T) => {
    const previous = item.previousHash === undefined ? item.expected : item.previousHash;
    return !!item.entry.hash || (!!previous && previous !== DIRECTORY);
  };
  for (const [name, index] of paths) {
    for (let slash = name.lastIndexOf('/'); slash !== -1; slash = name.lastIndexOf('/', slash - 1)) {
      const parent = paths.get(name.slice(0, slash));
      if (parent !== undefined && isFile(items[parent])) join(index, parent);
    }
  }
  for (const { added, removed } of moves.values()) if (added.length === 1 && removed.length === 1) join(added[0], removed[0]);
  const groups = new Map<number, T[]>();
  for (const [index, item] of items.entries()) {
    const key = root(index);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}
