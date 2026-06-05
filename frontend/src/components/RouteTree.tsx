import type { RouteNode, RouteResult } from "../lib/api";
import { formatValue, summarizeRoute } from "../lib/routes";

interface RouteTreeProps {
  route: RouteResult;
}

function nodeTitle(node: RouteNode): string {
  if (node.type === "reaction") {
    return "Retrosynthetic disconnection";
  }
  return node.in_stock ? "Commercial / stock precursor" : "Intermediate";
}

function RouteNodeView({ node, depth = 0 }: { node: RouteNode; depth?: number }) {
  const isReaction = node.type === "reaction";
  const children = node.children ?? [];

  return (
    <li className="my-3">
      <div
        className={`rounded-xl border p-4 shadow-sm ${
          isReaction
            ? "border-blue-200 bg-blue-50"
            : "border-slate-200 bg-white"
        }`}
        style={{ marginLeft: depth ? 18 : 0 }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isReaction
                ? "bg-blue-100 text-blue-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {isReaction ? "Reaction" : "Molecule"}
          </span>
          {!isReaction && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                node.in_stock
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {node.in_stock ? "In stock" : "Not in stock"}
            </span>
          )}
        </div>
        <strong className="block text-sm font-bold text-slate-950">
          {nodeTitle(node)}
        </strong>
        <code className="mt-2 block break-words rounded-lg bg-slate-100 p-2 text-xs text-slate-800">
          {node.smiles ?? "No SMILES"}
        </code>
        {node.metadata?.classification !== undefined && (
          <small className="mt-2 block text-xs text-slate-500">
            Class: {String(node.metadata.classification)}
          </small>
        )}
      </div>
      {children.length > 0 && (
        <ul className="ml-4 border-l border-dashed border-slate-300 pl-3">
          {children.map((child, index) => (
            <RouteNodeView
              key={`${child.type}-${child.smiles}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function RouteTree({ route }: RouteTreeProps) {
  const summary = summarizeRoute(route.tree);
  const scoreEntries = Object.entries(route.scores);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Route {route.index}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            {route.is_solved ? "Solved route" : "Unsolved route"}
          </h3>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-3 xl:max-w-xl">
          <SummaryCard label="reactions" value={summary.reactions} />
          <SummaryCard
            label="leaves in stock"
            value={`${summary.inStockLeaves}/${summary.leafMolecules}`}
          />
          <SummaryCard label="max depth" value={summary.maxDepth} />
        </div>
      </div>

      {scoreEntries.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scoreEntries.map(([name, value]) => (
            <div
              key={name}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {name}
              </span>
              <strong className="mt-1 block break-words text-lg text-slate-950">
                {formatValue(value)}
              </strong>
            </div>
          ))}
        </div>
      )}

      {route.image && (
        <div className="mb-5 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
          <img
            className="mx-auto max-w-full"
            src={route.image}
            alt={`AiZynthFinder route ${route.index}`}
          />
        </div>
      )}

      <ul className="m-0 list-none p-0">
        <RouteNodeView node={route.tree} />
      </ul>
    </article>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <strong className="block text-lg text-slate-950">{value}</strong>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
    </div>
  );
}
