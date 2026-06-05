import { FormEvent, useEffect, useMemo, useState } from "react";
import { MoleculeSketcher } from "./components/MoleculeSketcher";
import { RouteTree } from "./components/RouteTree";
import {
  fetchMetadata,
  MetadataResponse,
  runSearch,
  SearchRequest,
  SearchResponse
} from "./lib/api";
import { formatValue } from "./lib/routes";

const exampleSmiles = [
  "CC(=O)OC1=CC=CC=C1C(=O)O",
  "COC1=CC=C(C=C1)C(=O)N",
  "CCOC(=O)C1=CC=CC=C1"
];

function toggleSelection(value: string, selected: string[]): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

function useMetadata() {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetadata()
      .then(setMetadata)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { metadata, error, loading };
}

export function App() {
  const { metadata, error: metadataError, loading: metadataLoading } = useMetadata();
  const defaults = metadata?.defaults;
  const [smiles, setSmiles] = useState(exampleSmiles[0]);
  const [stocks, setStocks] = useState<string[]>([]);
  const [expansionPolicies, setExpansionPolicies] = useState<string[]>([]);
  const [filterPolicies, setFilterPolicies] = useState<string[]>([]);
  const [rewards, setRewards] = useState<string[]>([]);
  const [routeScorer, setRouteScorer] = useState<string>("");
  const [timeLimit, setTimeLimit] = useState(60);
  const [iterationLimit, setIterationLimit] = useState(100);
  const [maxTransforms, setMaxTransforms] = useState(6);
  const [returnFirst, setReturnFirst] = useState(false);
  const [atomLimitsEnabled, setAtomLimitsEnabled] = useState(false);
  const [atomLimits, setAtomLimits] = useState({ C: 0, N: 0, O: 0 });
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!metadata) {
      return;
    }
    setStocks(metadata.stocks);
    setExpansionPolicies(metadata.expansion_policies.slice(0, 1));
    setFilterPolicies(metadata.filter_policies);
    setRewards(metadata.defaults.rewards.slice(0, 2));
    setTimeLimit(metadata.defaults.time_limit || 60);
    setIterationLimit(metadata.defaults.iteration_limit || 100);
    setMaxTransforms(metadata.defaults.max_transforms || 6);
    setReturnFirst(metadata.defaults.return_first);
  }, [metadata]);

  const selectedRoute = useMemo(() => {
    if (!searchResult?.routes.length) {
      return null;
    }
    return searchResult.routes[selectedRouteIndex] ?? searchResult.routes[0];
  }, [searchResult, selectedRouteIndex]);

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    setSearchError(null);
    setSearchResult(null);
    setSelectedRouteIndex(0);
    setSearching(true);

    const payload: SearchRequest = {
      smiles,
      stocks,
      expansion_policies: expansionPolicies,
      filter_policies: filterPolicies,
      atom_limits: atomLimitsEnabled
        ? Object.fromEntries(
            Object.entries(atomLimits).filter(([, value]) => value > 0)
          )
        : {},
      time_limit: timeLimit,
      iteration_limit: iterationLimit,
      max_transforms: maxTransforms,
      return_first: returnFirst,
      rewards,
      route_scorer: routeScorer || null
    };

    try {
      const result = await runSearch(payload);
      setSearchResult(result);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const ready = metadata?.ready ?? false;

  return (
    <main>
      <section className="hero">
        <nav>
          <span className="brand-mark">AZ</span>
          <span>AiZynthFinder GUI</span>
        </nav>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Modern retrosynthesis workspace</p>
            <h1>Plan synthesis routes from SMILES or a drawn molecule.</h1>
            <p className="hero-copy">
              A web application wrapper around the official AiZynthFinder engine
              with dynamic search controls, route ranking, procurement status,
              and optional chemical sketching.
            </p>
          </div>
          <div className="hero-card">
            <span className={`status-pill ${ready ? "ready" : "muted"}`}>
              {metadataLoading ? "Checking engine" : ready ? "Engine ready" : "Setup needed"}
            </span>
            <p>
              {ready
                ? `Using ${metadata?.config_path}`
                : metadata?.message ??
                  metadataError ??
                  "Connect the backend to AiZynthFinder model data."}
            </p>
          </div>
        </div>
      </section>

      <form className="workspace" onSubmit={submitSearch}>
        <section className="panel target-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Target</p>
              <h2>Compound input</h2>
            </div>
            <button type="submit" disabled={!ready || searching || !smiles.trim()}>
              {searching ? "Searching..." : "Run retrosynthesis"}
            </button>
          </div>
          <label className="field">
            <span>Target SMILES</span>
            <textarea
              value={smiles}
              onChange={(event) => setSmiles(event.target.value)}
              rows={3}
              placeholder="Paste or draw a compound SMILES"
            />
          </label>
          <div className="example-row">
            {exampleSmiles.map((example) => (
              <button
                key={example}
                type="button"
                className="chip-button"
                onClick={() => setSmiles(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <MoleculeSketcher smiles={smiles} onSmilesChange={setSmiles} />

        <section className="panel options-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Search setup</p>
              <h2>Stocks, policies, and limits</h2>
            </div>
          </div>

          <div className="option-grid">
            <MultiSelect
              title="Stocks"
              options={metadata?.stocks ?? []}
              selected={stocks}
              onToggle={(value) => setStocks(toggleSelection(value, stocks))}
            />
            <MultiSelect
              title="Expansion policy"
              options={metadata?.expansion_policies ?? []}
              selected={expansionPolicies}
              onToggle={(value) =>
                setExpansionPolicies(toggleSelection(value, expansionPolicies))
              }
            />
            <MultiSelect
              title="Filter policy"
              options={metadata?.filter_policies ?? []}
              selected={filterPolicies}
              onToggle={(value) =>
                setFilterPolicies(toggleSelection(value, filterPolicies))
              }
            />
            <MultiSelect
              title="MCTS rewards"
              options={metadata?.scorers ?? []}
              selected={rewards}
              onToggle={(value) => setRewards(toggleSelection(value, rewards))}
            />
          </div>

          <div className="numeric-grid">
            <NumberField
              label="Time limit (seconds)"
              value={timeLimit}
              min={5}
              max={900}
              onChange={setTimeLimit}
            />
            <NumberField
              label="Max iterations"
              value={iterationLimit}
              min={1}
              max={5000}
              onChange={setIterationLimit}
            />
            <NumberField
              label="Max tree depth"
              value={maxTransforms}
              min={1}
              max={30}
              onChange={setMaxTransforms}
            />
            <label className="field">
              <span>Route reorder scorer</span>
              <select
                value={routeScorer}
                onChange={(event) => setRouteScorer(event.target.value)}
              >
                <option value="">Use reward order</option>
                {(metadata?.scorers ?? []).map((scorer) => (
                  <option key={scorer} value={scorer}>
                    {scorer}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="inline-options">
            <label>
              <input
                type="checkbox"
                checked={returnFirst}
                onChange={(event) => setReturnFirst(event.target.checked)}
              />
              Return first solved route
            </label>
            <label>
              <input
                type="checkbox"
                checked={atomLimitsEnabled}
                onChange={(event) => setAtomLimitsEnabled(event.target.checked)}
              />
              Limit atom occurrences
            </label>
          </div>

          {atomLimitsEnabled && (
            <div className="atom-grid">
              {(["C", "N", "O"] as const).map((atom) => (
                <NumberField
                  key={atom}
                  label={`${atom} atoms`}
                  value={atomLimits[atom]}
                  min={0}
                  max={200}
                  onChange={(value) =>
                    setAtomLimits((current) => ({ ...current, [atom]: value }))
                  }
                />
              ))}
            </div>
          )}
        </section>
      </form>

      {searchError && <div className="alert error">{searchError}</div>}

      {searchResult && (
        <section className="results">
          <div className="results-header">
            <div>
              <p className="eyebrow">Results</p>
              <h2>{searchResult.routes.length} ranked routes for {searchResult.target}</h2>
            </div>
            <span className="status-pill ready">
              {searchResult.elapsed_seconds.toFixed(2)}s
            </span>
          </div>

          {searchResult.warnings.map((warning) => (
            <div className="alert" key={warning}>{warning}</div>
          ))}

          <div className="stats-grid">
            {Object.entries(searchResult.statistics).map(([name, value]) => (
              <div className="stat-card" key={name}>
                <span>{name.replaceAll("_", " ")}</span>
                <strong>{formatValue(value)}</strong>
              </div>
            ))}
          </div>

          <div className="route-layout">
            <aside className="route-list">
              {searchResult.routes.map((route, index) => (
                <button
                  type="button"
                  key={route.index}
                  className={index === selectedRouteIndex ? "active" : ""}
                  onClick={() => setSelectedRouteIndex(index)}
                >
                  <span>Route {route.index}</span>
                  <strong>{route.is_solved ? "Solved" : "Unsolved"}</strong>
                </button>
              ))}
            </aside>
            {selectedRoute ? (
              <RouteTree route={selectedRoute} />
            ) : (
              <div className="empty-state">
                No routes were found. Try increasing the time or iteration limit.
              </div>
            )}
          </div>
        </section>
      )}

      {!searchResult && !searching && (
        <section className="empty-state intro-state">
          <h2>Ready for retrosynthesis planning</h2>
          <p>
            Configure AiZynthFinder data on the backend, enter or draw a molecule,
            and run a search to explore ranked synthesis routes.
          </p>
          {defaults && (
            <p>
              Current defaults: {defaults.iteration_limit} iterations,{" "}
              {defaults.time_limit}s, max depth {defaults.max_transforms}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function MultiSelect({
  title,
  options,
  selected,
  onToggle
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="multi-select">
      <legend>{title}</legend>
      {options.length === 0 ? (
        <p className="helper">No options loaded</p>
      ) : (
        options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            {option}
          </label>
        ))
      )}
    </fieldset>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
