export interface SearchDefaults {
  time_limit: number;
  iteration_limit: number;
  max_transforms: number;
  return_first: boolean;
  rewards: string[];
}

export interface MetadataResponse {
  ready: boolean;
  message?: string | null;
  config_path?: string | null;
  stocks: string[];
  expansion_policies: string[];
  filter_policies: string[];
  scorers: string[];
  defaults: SearchDefaults;
}

export interface DataFileStatus {
  name: string;
  path: string;
  exists: boolean;
  size_bytes: number;
}

export interface DeploymentStatusResponse {
  api_ready: boolean;
  config_path?: string | null;
  data_dir?: string | null;
  public_data_ready: boolean;
  download_in_progress: boolean;
  download_error?: string | null;
  engine_initialized: boolean;
  engine_initializing: boolean;
  engine_error?: string | null;
  missing_files: string[];
  files: DataFileStatus[];
  message: string;
}

export interface SearchRequest {
  smiles: string;
  stocks: string[];
  expansion_policies: string[];
  filter_policies: string[];
  atom_limits: Record<string, number>;
  time_limit: number;
  iteration_limit: number;
  max_transforms: number;
  return_first: boolean;
  rewards: string[];
  route_scorer?: string | null;
}

export interface RouteNode {
  type?: "mol" | "reaction" | string;
  smiles?: string;
  in_stock?: boolean;
  metadata?: Record<string, unknown>;
  route_metadata?: Record<string, unknown>;
  scores?: Record<string, unknown>;
  children?: RouteNode[];
}

export interface RouteResult {
  index: number;
  is_solved: boolean;
  scores: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tree: RouteNode;
  image?: string | null;
}

export interface SearchResponse {
  target: string;
  elapsed_seconds: number;
  statistics: Record<string, unknown>;
  stock_info: Record<string, unknown>;
  routes: RouteResult[];
  warnings: string[];
}

export interface ReportRequest {
  target: string;
  statistics: Record<string, unknown>;
  routes: RouteResult[];
  title?: string;
}

export interface SmilesResponse {
  smiles: string;
}

export interface MolfileResponse {
  molfile: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      message = payload.detail ?? message;
    } catch {
      // Keep the HTTP status text if the server did not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function fetchMetadata(): Promise<MetadataResponse> {
  return requestJson<MetadataResponse>("/api/metadata");
}

export function fetchDeploymentStatus(): Promise<DeploymentStatusResponse> {
  return requestJson<DeploymentStatusResponse>("/api/status");
}

export function convertMolfileToSmiles(molfile: string): Promise<SmilesResponse> {
  return requestJson<SmilesResponse>("/api/convert/molfile-to-smiles", {
    method: "POST",
    body: JSON.stringify({ molfile })
  });
}

export function convertSmilesToMolfile(smiles: string): Promise<MolfileResponse> {
  return requestJson<MolfileResponse>("/api/convert/smiles-to-molfile", {
    method: "POST",
    body: JSON.stringify({ smiles })
  });
}

export function runSearch(payload: SearchRequest): Promise<SearchResponse> {
  return requestJson<SearchResponse>("/api/search", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function exportPdfReport(payload: ReportRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/report/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      message = errorPayload.detail ?? message;
    } catch {
      // Preserve response status text for non-JSON errors.
    }
    throw new Error(message);
  }

  return response.blob();
}
