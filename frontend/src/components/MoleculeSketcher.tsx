import { useEffect, useId, useRef, useState } from "react";
import {
  convertMolfileToSmiles,
  convertSmilesToMolfile
} from "../lib/api";

type ChemDoodleSketcher = {
  getMolecule: () => unknown;
  loadMolecule: (molecule: unknown) => void;
  repaint?: () => void;
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

export function MoleculeSketcher({
  smiles,
  onSmilesChange
}: MoleculeSketcherProps) {
  const generatedId = useId().replace(/:/g, "");
  const canvasId = `chemdoodle-${generatedId}`;
  const sketcher = useRef<ChemDoodleSketcher | null>(null);
  const [status, setStatus] = useState("Loading ChemDoodle sketcher...");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadChemDoodle()
      .then(() => {
        if (cancelled || !window.ChemDoodle?.SketcherCanvas || sketcher.current) {
          return;
        }

        if (window.ChemDoodle.ELEMENT?.H) {
          window.ChemDoodle.ELEMENT.H.jmolColor = "black";
        }
        if (window.ChemDoodle.ELEMENT?.S) {
          window.ChemDoodle.ELEMENT.S.jmolColor = "#B9A130";
        }

        sketcher.current = new window.ChemDoodle.SketcherCanvas(
          canvasId,
          640,
          360,
          {
            useServices: false,
            oneMolecule: true
          }
        );
        sketcher.current.toolbarManager?.setup?.();
        if (sketcher.current.styles) {
          sketcher.current.styles.atoms_displayTerminalCarbonLabels_2D = true;
          sketcher.current.styles.atoms_useJMOLColors = true;
        }
        sketcher.current.repaint?.();
        setReady(true);
        setStatus("Draw a molecule, then click Use drawing SMILES.");
      })
      .catch((error: Error) => {
        setStatus(
          `${error.message}. Download ChemDoodle Web Components and host ChemDoodleWeb.css, ChemDoodleWeb.js, and uis/ChemDoodleWeb-uis.js under /chemdoodle.`
        );
      });

    return () => {
      cancelled = true;
    };
  }, [canvasId]);

  const loadCurrentSmiles = async () => {
    if (!sketcher.current || !window.ChemDoodle || !smiles.trim()) {
      return;
    }
    setBusy(true);
    try {
      const { molfile } = await convertSmilesToMolfile(smiles.trim());
      const molecule = window.ChemDoodle.readMOL(molfile);
      sketcher.current.loadMolecule(molecule);
      sketcher.current.repaint?.();
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
    if (!sketcher.current || !window.ChemDoodle) {
      return;
    }
    setBusy(true);
    try {
      const molecule = sketcher.current.getMolecule();
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
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
        <canvas
          id={canvasId}
          width={640}
          height={360}
          className="mx-auto block max-w-full"
        />
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
