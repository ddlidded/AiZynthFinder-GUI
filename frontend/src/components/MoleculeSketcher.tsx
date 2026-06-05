import { useEffect, useId, useRef, useState } from "react";

type JsmeApplet = {
  smiles: () => string;
  readGenericMolecularInput?: (input: string) => void;
  setCallBack?: (eventName: string, callback: () => void) => void;
};

declare global {
  interface Window {
    JSApplet?: {
      JSME: new (
        elementId: string,
        width: string,
        height: string,
        options?: Record<string, string>
      ) => JsmeApplet;
    };
    jsmeOnLoad?: () => void;
  }
}

interface MoleculeSketcherProps {
  smiles: string;
  onSmilesChange: (smiles: string) => void;
}

const JSME_URL =
  import.meta.env.VITE_JSME_URL ??
  "https://jsme-editor.github.io/dist/jsme/jsme.nocache.js";

let jsmeScriptPromise: Promise<void> | null = null;

function loadJsme(): Promise<void> {
  if (window.JSApplet?.JSME) {
    return Promise.resolve();
  }
  if (jsmeScriptPromise) {
    return jsmeScriptPromise;
  }

  jsmeScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${JSME_URL}"]`
    );
    window.jsmeOnLoad = () => resolve();
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load JSME molecule editor"))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = JSME_URL;
    script.async = true;
    script.onload = () => {
      if (window.JSApplet?.JSME) {
        resolve();
      }
    };
    script.onerror = () =>
      reject(new Error(`Unable to load JSME from ${JSME_URL}`));
    document.body.appendChild(script);
  });

  return jsmeScriptPromise;
}

export function MoleculeSketcher({
  smiles,
  onSmilesChange
}: MoleculeSketcherProps) {
  const generatedId = useId().replace(/:/g, "");
  const containerId = `jsme-${generatedId}`;
  const applet = useRef<JsmeApplet | null>(null);
  const [status, setStatus] = useState("Loading drawing tool...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadJsme()
      .then(() => {
        if (cancelled || !window.JSApplet?.JSME) {
          return;
        }
        applet.current = new window.JSApplet.JSME(containerId, "100%", "360px", {
          options: "oldlook,star"
        });
        applet.current.setCallBack?.("AfterStructureModified", () => {
          const drawnSmiles = applet.current?.smiles().trim();
          if (drawnSmiles) {
            onSmilesChange(drawnSmiles);
          }
        });
        setReady(true);
        setStatus("Draw or paste a structure, then use its SMILES.");
      })
      .catch((error: Error) => {
        setStatus(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, onSmilesChange]);

  const loadCurrentSmiles = () => {
    if (!applet.current || !smiles.trim()) {
      return;
    }
    applet.current.readGenericMolecularInput?.(smiles.trim());
  };

  const useDrawing = () => {
    const drawnSmiles = applet.current?.smiles().trim();
    if (drawnSmiles) {
      onSmilesChange(drawnSmiles);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Molecule sketcher
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
      <div
        id={containerId}
        className="mt-4 grid min-h-[360px] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadCurrentSmiles}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
        >
          Load typed SMILES
        </button>
        <button
          type="button"
          onClick={useDrawing}
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
        >
          Use drawing SMILES
        </button>
      </div>
    </section>
  );
}
