import { useUiStore } from '@/store/uiStore';

export function SearchBox() {
  const query = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  return (
    <div className="searchbox">
      <input
        type="search"
        className="osrs-input"
        placeholder="Search tasks…"
        value={query}
        onChange={(event) => setSearchQuery(event.target.value)}
        aria-label="Search tasks"
      />
      {query && (
        <button
          type="button"
          className="searchbox__clear"
          onClick={() => setSearchQuery('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
