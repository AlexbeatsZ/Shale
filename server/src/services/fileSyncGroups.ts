type Transfer = { path: string; expected: string | null; previousHash?: string | null; entry: { version: number; hash: string | null } };
type Entry = Transfer['entry'];

export function planSyncPath(base: Entry | null, localHash: string | null, remote: Entry | null, blocked: boolean) {
  if (blocked) return { decision: 'blocked' } as const;
  const remoteHash = remote?.hash ?? null;
  const baseHash = base?.hash ?? null;
  if (localHash === remoteHash) return { decision: remote && remote.version !== base?.version ? 'adopt' : 'no_change' } as const;
  if (localHash === baseHash) return { decision: 'download' } as const;
  if (!base && remote && !remoteHash) return { decision: 'conflict' } as const;
  if (remoteHash === baseHash) return { decision: 'upload', expectedVersion: remote?.version ?? 0 } as const;
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
    const digest = item.entry.hash ?? previous;
    if (!digest || Boolean(item.entry.hash) === Boolean(previous)) continue;
    const key = `${item.entry.version}/${digest}`;
    let move = moves.get(key);
    if (!move) moves.set(key, (move = { added: [], removed: [] }));
    (item.entry.hash ? move.added : move.removed).push(index);
  }
  for (const [name, index] of paths) {
    for (let slash = name.lastIndexOf('/'); slash !== -1; slash = name.lastIndexOf('/', slash - 1)) {
      const parent = paths.get(name.slice(0, slash));
      if (parent !== undefined) join(index, parent);
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
