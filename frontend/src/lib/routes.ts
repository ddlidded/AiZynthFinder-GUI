import type { RouteNode } from "./api";

export interface RouteSummary {
  reactions: number;
  molecules: number;
  leafMolecules: number;
  inStockLeaves: number;
  maxDepth: number;
}

const emptySummary: RouteSummary = {
  reactions: 0,
  molecules: 0,
  leafMolecules: 0,
  inStockLeaves: 0,
  maxDepth: 0
};

export function summarizeRoute(root: RouteNode): RouteSummary {
  const summary = { ...emptySummary };

  function visit(node: RouteNode, depth: number): void {
    summary.maxDepth = Math.max(summary.maxDepth, depth);
    const children = node.children ?? [];
    if (node.type === "reaction" || node.type === "retro reaction") {
      summary.reactions += 1;
    } else {
      summary.molecules += 1;
      if (children.length === 0) {
        summary.leafMolecules += 1;
        if (node.in_stock) {
          summary.inStockLeaves += 1;
        }
      }
    }
    children.forEach((child) => visit(child, depth + 1));
  }

  visit(root, 0);
  return summary;
}

export function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(4);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value == null ? "-" : String(value);
}
