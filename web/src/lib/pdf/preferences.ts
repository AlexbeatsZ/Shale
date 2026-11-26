/** Absence means the format default; false is an explicit remembered choice. */
export function pdfDarkPreference(path: string, overrides: Record<string, boolean>): boolean {
  return Object.hasOwn(overrides, path) ? overrides[path] : /\.pdf$/i.test(path);
}

export function restorePdfDarkPreferences(state: { pdfDarkOverrides?: unknown }): Record<string, boolean> {
  const explicit = state.pdfDarkOverrides && typeof state.pdfDarkOverrides === 'object' && !Array.isArray(state.pdfDarkOverrides)
    ? Object.entries(state.pdfDarkOverrides).filter(([, value]) => typeof value === 'boolean') : [];
  return Object.fromEntries(explicit);
}
