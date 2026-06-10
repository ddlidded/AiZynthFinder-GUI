import { useEffect, useId, useRef, useState } from "react";
import {
  convertMolfileToSmiles,
  convertSmilesToMolfile
} from "../lib/api";

type ChemDoodleSketcher = {
  getMolecule: () => unknown;
  loadMolecule: (molecule: unknown) => void;
  repaint?: () => void;
  resize?: (width: number, height: number) => void;
  toolbarManager?: {
    setup?: () => void;
  };
  styles?: Record<string, unknown>;
};

type ChemDoodleGlobal = {
  SketcherCanvas: new (
    elementId: string,
    width?: number,
    height?: number,
    options?: Record<string, unknown>
  ) => ChemDoodleSketcher;
  readMOL: (molfile: string) => unknown;
  writeMOL: (molecule: unknown) => string;
  ELEMENT?: Record<string, { jmolColor?: string }>;
};

declare global {
  interface Window {
    ChemDoodle?: ChemDoodleGlobal;
  }
}

interface MoleculeSketcherProps {
  smiles: string;
  onSmilesChange: (smiles: string) => void;
}

const CHEMDOODLE_BASE_URL =
  import.meta.env.VITE_CHEMDOODLE_BASE_URL ?? "/chemdoodle";
const CHEMDOODLE_CSS_URL =
  import.meta.env.VITE_CHEMDOODLE_CSS_URL ??
  `${CHEMDOODLE_BASE_URL}/ChemDoodleWeb.css`;
const CHEMDOODLE_CORE_URL =
  import.meta.env.VITE_CHEMDOODLE_CORE_URL ??
  `${CHEMDOODLE_BASE_URL}/ChemDoodleWeb.js`;
const CHEMDOODLE_UIS_URL =
  import.meta.env.VITE_CHEMDOODLE_UIS_URL ??
  `${CHEMDOODLE_BASE_URL}/uis/ChemDoodleWeb-uis.js`;

const SKETCHER_MIN_WIDTH = 280;
const SKETCHER_MIN_HEIGHT = 240;
const SKETCHER_MAX_HEIGHT = 380;
const SKETCHER_ASPECT = 0.58;

let chemDoodlePromise: Promise<void> | null = null;

function loadStylesheet(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error(`Unable to load ${src}`))
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

/** ChemDoodle v11 declares `let ChemDoodle` (not `window.ChemDoodle`). */
function publishChemDoodleGlobal(): void {
  if (window.ChemDoodle?.SketcherCanvas) {
    return;
  }
  const bridge = document.createElement("script");
  bridge.textContent = "window.ChemDoodle = ChemDoodle;";
  document.head.appendChild(bridge);
  bridge.remove();
}

function loadChemDoodle(): Promise<void> {
  if (window.ChemDoodle?.SketcherCanvas) {
    return Promise.resolve();
  }
  if (chemDoodlePromise) {
    return chemDoodlePromise;
  }

  chemDoodlePromise = (async () => {
    loadStylesheet(CHEMDOODLE_CSS_URL);
    await loadScript(CHEMDOODLE_CORE_URL);
    publishChemDoodleGlobal();
    await loadScript(CHEMDOODLE_UIS_URL);
    publishChemDoodleGlobal();
    if (!window.ChemDoodle?.SketcherCanvas) {
      throw new Error(
        "ChemDoodle SketcherCanvas was not available after loading ChemDoodle assets"
      );
    }
  })().catch((error) => {
    chemDoodlePromise = null;
    throw error;
  });

  return chemDoodlePromise;
}

function measureSketcherSize(container: HTMLElement): {
  width: number;
  height: number;
} {
  const width = Math.max(
    SKETCHER_MIN_WIDTH,
    Math.floor(container.clientWidth)
  );
  const height = Math.max(
    SKETCHER_MIN_HEIGHT,
    Math.min(SKETCHER_MAX_HEIGHT, Math.round(width * SKETCHER_ASPECT))
  );
  return { width, height };
}

function waitForLayout(container: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (container.clientWidth > 0) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function clearSketcherHost(host: HTMLElement): void {
  host.replaceChildren();
}

export function MoleculeSketcher({
  smiles,
  onSmilesChange
}: MoleculeSketcherProps) {
  const generatedId = useId().replace(/:/g, "");
  const canvasId = `chemdoodle-${generatedId}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const sketcherRef = useRef<ChemDoodleSketcher | null>(null);
  const [status, setStatus] = useState("Loading ChemDoodle sketcher...");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    const resizeSketcher = () => {
      if (!sketcherRef.current || !hostRef.current) {
        return;
      }
      const { width, height } = measureSketcherSize(hostRef.current);
      sketcherRef.current.resize?.(width, height);
      sketcherRef.current.repaint?.();
    };

    const initialize = async () => {
      try {
        await loadChemDoodle();
        if (cancelled || !hostRef.current || sketcherRef.current) {
          return;
        }

        await waitForLayout(hostRef.current);
        if (cancelled || !hostRef.current) {
          return;
        }

        const { width, height } = measureSketcherSize(hostRef.current);
        const canvas = document.createElement("canvas");
        canvas.id = canvasId;
        canvas.width = width;
        canvas.height = height;
        hostRef.current.appendChild(canvas);

        if (window.ChemDoodle?.ELEMENT?.H) {
          window.ChemDoodle.ELEMENT.H.jmolColor = "black";
        }
        if (window.ChemDoodle?.ELEMENT?.S) {
          window.ChemDoodle.ELEMENT.S.jmolColor = "#B9A130";
        }

        sketcherRef.current = new window.ChemDoodle!.SketcherCanvas(
          canvasId,
          width,
          height,
          {
            useServices: false,
            oneMolecule: true
          }
        );
        sketcherRef.current.toolbarManager?.setup?.();
        if (sketcherRef.current.styles) {
          sketcherRef.current.styles.atoms_displayTerminalCarbonLabels_2D = true;
          sketcherRef.current.styles.atoms_useJMOLColors = true;
          sketcherRef.current.styles.bonds_clearOverlaps_2D = true;
        }
        sketcherRef.current.repaint?.();

        resizeObserver = new ResizeObserver(() => {
          resizeSketcher();
        });
        resizeObserver.observe(hostRef.current);

        if (!cancelled) {
          setReady(true);
          setStatus("Draw a molecule, then click Use drawing SMILES.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? `${error.message}. Download ChemDoodle Web Components and host ChemDoodleWeb.css, ChemDoodleWeb.js, and uis/ChemDoodleWeb-uis.js under /chemdoodle.`
              : "Unable to initialize ChemDoodle sketcher."
          );
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      sketcherRef.current = null;
      if (hostRef.current) {
        clearSketcherHost(hostRef.current);
      }
    };
  }, [canvasId]);

  const loadCurrentSmiles = async () => {
    if (!sketcherRef.current || !window.ChemDoodle || !smiles.trim()) {
      return;
    }
    setBusy(true);
    try {
      const { molfile } = await convertSmilesToMolfile(smiles.trim());
      const molecule = window.ChemDoodle.readMOL(molfile);
      sketcherRef.current.loadMolecule(molecule);
      sketcherRef.current.repaint?.();
      setStatus("Typed SMILES loaded into ChemDoodle.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to load typed SMILES into ChemDoodle"
      );
    } finally {
      setBusy(false);
    }
  };

  const useDrawing = async () => {
    if (!sketcherRef.current || !window.ChemDoodle) {
      return;
    }
    setBusy(true);
    try {
      const molecule = sketcherRef.current.getMolecule();
      const molfile = window.ChemDoodle.writeMOL(molecule);
      const { smiles: drawnSmiles } = await convertMolfileToSmiles(molfile);
      onSmilesChange(drawnSmiles);
      setStatus(`Drawing converted to SMILES: ${drawnSmiles}`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to convert drawing to SMILES"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            ChemDoodle sketcher
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            Draw target compound
          </h2>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            ready ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {ready ? "Ready" : "Optional"}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">{status}</p>
      <div className="chemdoodle-sketcher-shell mt-4 rounded-xl border border-slate-200 bg-white p-2">
        <div ref={hostRef} className="chemdoodle-sketcher-host w-full" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadCurrentSmiles}
          disabled={!ready || busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Load typed SMILES
        </button>
        <button
          type="button"
          onClick={useDrawing}
          disabled={!ready || busy}
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Converting..." : "Use drawing SMILES"}
        </button>
      </div>
    </section>
  );
}
