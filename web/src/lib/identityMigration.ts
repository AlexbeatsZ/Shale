// Run before application modules read persistent browser preferences.
for (const storage of [window.localStorage, window.sessionStorage]) {
  for (const key of Object.keys(storage)) {
    const next = key.replace(/webobsidian/gi, 'shale').replace(/^obsidian:/, 'shale:');
    if (next === key) continue;
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(next) === null) storage.setItem(next, value);
    storage.removeItem(key);
  }
}
