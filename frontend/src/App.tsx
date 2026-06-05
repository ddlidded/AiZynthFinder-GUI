import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { MoleculeSketcher } from "./components/MoleculeSketcher";
import { RouteTree } from "./components/RouteTree";
import {
  exportPdfReport,
  fetchDeploymentStatus,
  fetchMetadata,
  runSearch,
  type DeploymentStatusResponse,
  type MetadataResponse,
  type SearchRequest,
  type SearchResponse
} from "./lib/api";
import { formatValue } from "./lib/routes";

const exampleSmiles = [
  "CC(=O)OC1=CC=CC=C1C(=O)O",
  "COC1=CC=C(C=C1)C(=O)N",
  "CCOC(=O)C1=CC=CC=C1"
];

const primaryStatNames = [
  "search_time",
  "top_score",
  "is_solved",
  "number_of_routes",
  "number_of_solved_routes",
  "number_of_steps",
  "number_of_precursors",
  "number_of_precursors_in_stock"
];

function toggleSelection(value: string, selected: string[]): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

function useMetadata(shouldLoad: boolean) {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shouldLoad) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const loadMetadata = () => {
      setLoading(true);
      fetchMetadata()
        .then((payload) => {
          if (cancelled) {
            return;
          }
          setMetadata(payload);
          setError(null);
          if (!payload.ready) {
            timeoutId = window.setTimeout(loadMetadata, 15000);
          }
        })
        .catch((err: Error) => {
          if (cancelled) {
            return;
          }
          setError(err.message);
          timeoutId = window.setTimeout(loadMetadata, 15000);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    };

    loadMetadata();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldLoad]);

  return { metadata, error, loading };
}

function useDeploymentStatus() {
  const [status, setStatus] = useState<DeploymentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    const loadStatus = () => {
      fetchDeploymentStatus()
        .then((payload) => {
          if (cancelled) {
            return;
          }
          setStatus(payload);
          setError(null);
        })
        .catch((err: Error) => {
          if (cancelled) {
            return;
          }
          setError(err.message);
        });
    };

    loadStatus();
    intervalId = window.setInterval(loadStatus, 10000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return { status, error };
}

export function App() {
  const { status: deploymentStatus, error: statusError } = useDeploymentStatus();
  const { metadata, error: metadataError, loading: metadataLoading } = useMetadata(
    deploymentStatus?.public_data_ready ?? false
  );
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
  const [selectedReportRouteIds, setSelectedReportRouteIds] = useState<number[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
  const { primaryStats, detailStats } = useMemo(() => {
    const entries = Object.entries(searchResult?.statistics ?? {});
    const primary = primaryStatNames
      .map((name) => entries.find(([entryName]) => entryName === name))
      .filter((entry): entry is [string, unknown] => Boolean(entry));
    const primaryNames = new Set(primary.map(([name]) => name));
    return {
      primaryStats: primary,
      detailStats: entries.filter(([name]) => !primaryNames.has(name))
    };
  }, [searchResult]);

  const ready = metadata?.ready ?? false;
  let statusText = "Checking backend";
  let backendMessage =
    deploymentStatus?.message ??
    metadata?.message ??
    (deploymentStatus ? null : metadataError) ??
    statusError ??
    "Checking backend and public model data...";

  if (ready) {
    statusText = "Engine ready";
    backendMessage = `Using ${metadata?.config_path}`;
  } else if (deploymentStatus?.download_error) {
    statusText = "Download error";
    backendMessage = `Automatic public data download failed: ${deploymentStatus.download_error}`;
  } else if (deploymentStatus?.download_in_progress) {
    statusText = "Downloading data";
    backendMessage =
      "The web app is running while Easypanel downloads the public USPTO models and ZINC stock in the background. Search unlocks automatically when the download finishes.";
  } else if (deploymentStatus?.engine_error) {
    statusText = "Engine error";
    backendMessage = `AiZynthFinder engine initialization failed: ${deploymentStatus.engine_error}`;
  } else if (
    (metadataLoading || deploymentStatus?.engine_initializing) &&
    deploymentStatus?.public_data_ready
  ) {
    statusText = "Loading engine";
    backendMessage =
      "Public data is present. AiZynthFinder is loading the USPTO models and ZINC stock; first startup can take a minute or two.";
  } else if (deploymentStatus && !deploymentStatus.public_data_ready) {
    statusText = "Waiting for data";
  }

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    setSearchError(null);
    setExportError(null);
    setSearchResult(null);
    setSelectedReportRouteIds([]);
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
      setSelectedReportRouteIds(result.routes.map((route) => route.index));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggleReportRoute = (routeIndex: number) => {
    setSelectedReportRouteIds((current) =>
      current.includes(routeIndex)
        ? current.filter((index) => index !== routeIndex)
        : [...current, routeIndex]
    );
  };

  const exportSelectedReport = async () => {
    if (!searchResult) {
      return;
    }
    const selectedRoutes = searchResult.routes.filter((route) =>
      selectedReportRouteIds.includes(route.index)
    );
    if (selectedRoutes.length === 0) {
      setExportError("Select at least one route to export.");
      return;
    }

    setExportingReport(true);
    setExportError(null);
    try {
      const pdf = await exportPdfReport({
        target: searchResult.target,
        statistics: searchResult.statistics,
        routes: selectedRoutes,
        title: "AiZynthFinder Retrosynthesis Report"
      });
      const url = URL.createObjectURL(pdf);
      const anchor = document.createElement("a");
      const safeTarget = searchResult.target.replace(/[^a-zA-Z0-9_-]+/g, "_");
      anchor.href = url;
      anchor.download = `retrosynthesis-report-${safeTarget || "target"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Unable to export PDF report"
      );
    } finally {
      setExportingReport(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-sm font-black text-white shadow-sm">
              AZ
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                AiZynthFinder GUI
              </p>
              <p className="text-xs text-slate-500">
                Modern retrosynthesis planning
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              ready
                ? "bg-green-100 text-green-800"
                : metadataLoading
                  ? "bg-blue-100 text-blue-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {statusText}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-8">
            <div>
              <span className="mb-4 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Retrosynthesis workspace
              </span>
              <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Plan synthesis routes from SMILES or a drawn molecule.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
                Run AiZynthFinder with public USPTO policies and ZINC stock,
                tune search parameters, and inspect ranked routes in a clean web
                interface.
              </p>
            </div>

            <div
              className={`rounded-xl border p-5 ${
                ready
                  ? "border-green-200 bg-green-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Backend status</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ready
                      ? "bg-green-200 text-green-900"
                      : "bg-amber-200 text-amber-900"
                  }`}
                >
                  {statusText}
                </span>
              </div>
              <p className="break-words text-sm leading-6 text-slate-700">
                {backendMessage}
              </p>
              {!ready && deploymentStatus?.missing_files.length ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Missing public data files
                  </p>
                  <ul className="mt-2 list-inside list-disc text-xs text-slate-700">
                    {deploymentStatus.missing_files.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <form className="grid gap-6" onSubmit={submitSearch}>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Target
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    Compound input
                  </h2>
                </div>
                <button
                  type="submit"
                  disabled={!ready || searching || !smiles.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {searching ? "Searching..." : "Run retrosynthesis"}
                </button>
              </div>

              <label className="mb-2 block text-sm font-medium text-slate-900">
                Target SMILES
              </label>
              <textarea
                value={smiles}
                onChange={(event) => setSmiles(event.target.value)}
                rows={4}
                placeholder="Paste or draw a compound SMILES"
                className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {exampleSmiles.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setSmiles(example)}
                    className="rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>

            <MoleculeSketcher smiles={smiles} onSmilesChange={setSmiles} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Search setup
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                Stocks, policies, scorers, and limits
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-900">
                  Route reorder scorer
                </span>
                <select
                  value={routeScorer}
                  onChange={(event) => setRouteScorer(event.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500"
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

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <CheckboxField
                checked={returnFirst}
                label="Return first solved route"
                onChange={setReturnFirst}
              />
              <CheckboxField
                checked={atomLimitsEnabled}
                label="Limit atom occurrences"
                onChange={setAtomLimitsEnabled}
              />
            </div>

            {atomLimitsEnabled && (
              <div className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
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

        {searchError && (
          <div
            className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <span className="font-semibold">Search failed:</span> {searchError}
          </div>
        )}

        {searchResult && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Results
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  {searchResult.routes.length} ranked routes for{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-blue-700">
                    {searchResult.target}
                  </code>
                </h2>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="inline-flex w-fit rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
                  {searchResult.elapsed_seconds.toFixed(2)}s
                </span>
                <button
                  type="button"
                  onClick={exportSelectedReport}
                  disabled={exportingReport || selectedReportRouteIds.length === 0}
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {exportingReport
                    ? "Exporting PDF..."
                    : `Export PDF (${selectedReportRouteIds.length})`}
                </button>
              </div>
            </div>

            {exportError && (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                role="alert"
              >
                <span className="font-semibold">PDF export failed:</span>{" "}
                {exportError}
              </div>
            )}

            {searchResult.warnings.map((warning) => (
              <div
                className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800"
                key={warning}
              >
                {warning}
              </div>
            ))}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {primaryStats.map(([name, value]) => (
                <StatCard key={name} name={name} value={value} />
              ))}
            </div>

            {detailStats.length > 0 && (
              <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Additional search statistics
                </summary>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <tbody className="divide-y divide-slate-200">
                      {detailStats.map(([name, value]) => (
                        <tr key={name}>
                          <th className="w-56 whitespace-nowrap py-3 pr-4 align-top text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {name.replaceAll("_", " ")}
                          </th>
                          <td className="max-w-4xl py-3 align-top font-medium text-slate-800">
                            <code className="whitespace-pre-wrap break-words rounded bg-white px-2 py-1 text-xs text-slate-800">
                              {formatValue(value)}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="max-h-[720px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-slate-950">Routes</h3>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {searchResult.routes.length}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedReportRouteIds(
                        searchResult.routes.map((route) => route.index)
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReportRouteIds([])}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid content-start gap-2">
                {searchResult.routes.map((route, index) => (
                  <div
                    key={route.index}
                    className={`rounded-lg border p-3 transition ${
                      index === selectedRouteIndex
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={selectedReportRouteIds.includes(route.index)}
                          onChange={() => toggleReportRoute(route.index)}
                          className="h-4 w-4 rounded border-slate-300 bg-white text-blue-700 focus:ring-blue-500"
                        />
                        Report
                      </label>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          index === selectedRouteIndex
                            ? "bg-white/20 text-white"
                            : route.is_solved
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {route.is_solved ? "Solved" : "Unsolved"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRouteIndex(index)}
                      className={`mt-2 block w-full rounded-md px-2 py-1 text-left text-sm font-semibold ${
                        index === selectedRouteIndex
                          ? "bg-white/15 text-white"
                          : "text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      Route {route.index}
                    </button>
                  </div>
                ))}
                </div>
              </aside>

              {selectedRoute ? (
                <RouteTree route={selectedRoute} />
              ) : (
                <EmptyState title="No routes found">
                  Try increasing the time or iteration limit.
                </EmptyState>
              )}
            </div>
          </section>
        )}

        {!searchResult && !searching && (
          <EmptyState title="Ready for retrosynthesis planning">
            <>
              Configure the backend, enter or draw a molecule, and run a search
              to explore ranked synthesis routes.
              {defaults && (
                <span className="mt-2 block">
                  Current defaults: {defaults.iteration_limit} iterations,{" "}
                  {defaults.time_limit}s, max depth {defaults.max_transforms}.
                </span>
              )}
            </>
          </EmptyState>
        )}
      </div>
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
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-sm font-bold text-slate-950">{title}</legend>
      <div className="mt-2 grid gap-2">
        {options.length === 0 ? (
          <p className="text-sm text-slate-500">No options loaded</p>
        ) : (
          options.map((option) => (
            <CheckboxField
              key={option}
              checked={selected.includes(option)}
              label={option}
              onChange={() => onToggle(option)}
            />
          ))
        )}
      </div>
    </fieldset>
  );
}

function CheckboxField({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 bg-slate-100 text-blue-700 focus:ring-2 focus:ring-blue-500"
      />
      {label}
    </label>
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
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-900">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500"
      />
    </label>
  );
}

function StatCard({ name, value }: { name: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {name.replaceAll("_", " ")}
      </p>
      <p className="mt-2 truncate text-xl font-bold text-slate-950" title={formatValue(value)}>
        {formatValue(value)}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {children}
      </p>
    </section>
  );
}
