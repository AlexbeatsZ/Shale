import { useExistingDocumentSnapshot } from '../lib/useDocumentSession';

export default function DocumentTabIndicator({ path }: { path: string | null }) {
  const { dirty } = useExistingDocumentSnapshot(path);
  return dirty ? <span className="dot" aria-label="未保存的更改">●</span> : null;
}
