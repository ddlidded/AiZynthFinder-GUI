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
    <li className={`route-node ${isReaction ? "reaction" : "molecule"}`}>
      <div className="route-card" style={{ marginLeft: depth ? 18 : 0 }}>
        <div className="route-card-topline">
          <span className="node-kind">{isReaction ? "Reaction" : "Molecule"}</span>
          {!isReaction && (
            <span className={`stock-chip ${node.in_stock ? "in" : "out"}`}>
              {node.in_stock ? "In stock" : "Not in stock"}
            </span>
          )}
        </div>
        <strong>{nodeTitle(node)}</strong>
        <code>{node.smiles ?? "No SMILES"}</code>
        {node.metadata?.classification && (
          <small>Class: {String(node.metadata.classification)}</small>
        )}
      </div>
      {children.length > 0 && (
        <ul className="route-children">
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
    <article className="route-detail">
      <div className="route-detail-header">
        <div>
          <p className="eyebrow">Route {route.index}</p>
          <h3>{route.is_solved ? "Solved route" : "Unsolved route"}</h3>
        </div>
        <div className="route-summary-grid">
          <span>
            <strong>{summary.reactions}</strong>
            reactions
          </span>
          <span>
            <strong>{summary.inStockLeaves}/{summary.leafMolecules}</strong>
            leaves in stock
          </span>
          <span>
            <strong>{summary.maxDepth}</strong>
            max depth
          </span>
        </div>
      </div>

      {scoreEntries.length > 0 && (
        <div className="score-grid">
          {scoreEntries.map(([name, value]) => (
            <div key={name} className="score-card">
              <span>{name}</span>
              <strong>{formatValue(value)}</strong>
            </div>
          ))}
        </div>
      )}

      {route.image && (
        <div className="route-image-card">
          <img src={route.image} alt={`AiZynthFinder route ${route.index}`} />
        </div>
      )}

      <ul className="route-tree">
        <RouteNodeView node={route.tree} />
      </ul>
    </article>
  );
}
