import { parseTree, getNodeValue, type ParseError, type Node } from 'jsonc-parser';

/** Read-only note widgets read this data-only object literal. Never evaluates source. */
export function parseFolderRuleData(source: string): Record<string, unknown> {
  let data = source.trim();
  if (data.startsWith('(') && data.endsWith(')')) data = data.slice(1, -1).trim();
  // Quoted strings and comments are copied untouched. Only the known unquoted
  // data keys are normalized to JSONC; calls, expressions and spread fail parse.
  data = data.replace(/("(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|\b(managedRoots|recursive|typeRules|subjectRules|folder|tags)\s*:/g,
    (whole, protectedToken: string | undefined, key: string | undefined) => protectedToken ?? JSON.stringify(key) + ':');
  const errors: ParseError[] = [];
  const tree = parseTree(data, errors, { allowTrailingComma: true });
  if (!tree || errors.length) throw new Error('配置只支持字符串、布尔值、数组和普通对象；不支持动态 JavaScript');
  const rejectDuplicates = (node: Node) => {
    if (node.type === 'object') {
      const keys = node.children?.map(property => String(property.children?.[0]?.value)) ?? [];
      if (new Set(keys).size !== keys.length) throw new Error('配置存在重复属性');
    }
    for (const child of node.children ?? []) rejectDuplicates(child);
  };
  rejectDuplicates(tree);
  const raw: unknown = getNodeValue(tree);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('配置必须是对象');
  return raw as Record<string, unknown>;
}
