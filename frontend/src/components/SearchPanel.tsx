import { useSearch } from '../hooks/useSearch.ts';

export function SearchPanel() {
  const { query, setQuery, mode, setMode, results, loading, offset, limit, nextPage, prevPage } = useSearch();

  const endIndex = results ? Math.min(offset + limit, results.total) : 0;

  return (
    <div className="search-panel">
      <h2>Search Index</h2>

      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search crawled pages..."
        />
        {loading && <span className="search-spinner" />}
      </div>

      <div className="search-mode-toggle">
        <button
          className={`toggle-btn ${mode === 'exact' ? 'active' : ''}`}
          onClick={() => setMode('exact')}
        >
          Exact
        </button>
        <button
          className={`toggle-btn ${mode === 'prefix' ? 'active' : ''}`}
          onClick={() => setMode('prefix')}
        >
          Prefix
        </button>
      </div>

      {results && results.total > 0 && (
        <>
          <p className="results-count">
            Showing {offset + 1}–{endIndex} of {results.total} results
          </p>

          <div className="results-list">
            {results.results.map((r, i) => (
              <div key={i} className="result-card">
                <a href={r.relevantUrl} target="_blank" rel="noopener noreferrer" className="result-url">
                  {r.relevantUrl}
                </a>
                <div className="result-meta">
                  <span className="result-origin">from: {r.originUrl}</span>
                  <span className="badge badge-depth">depth: {r.depth}</span>
                  <span className="badge badge-score">score: {r.score}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pagination">
            <button className="btn" onClick={prevPage} disabled={offset === 0}>
              Previous
            </button>
            <button className="btn" onClick={nextPage} disabled={offset + limit >= results.total}>
              Next
            </button>
          </div>
        </>
      )}

      {results && results.total === 0 && query.trim().length > 0 && (
        <p className="no-results">No results found for "{query}"</p>
      )}
    </div>
  );
}
