// Minimal localStorage stand-in so store modules (zustand persist) load in
// node-environment tests without warnings.
if (typeof globalThis.localStorage === 'undefined') {
  const map = new Map<string, string>();
  const stub: Storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
}
