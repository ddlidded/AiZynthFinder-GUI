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
    <section className="panel sketcher-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Molecule sketcher</p>
          <h2>Draw target compound</h2>
        </div>
        <span className={`status-pill ${ready ? "ready" : "muted"}`}>
          {ready ? "Ready" : "Optional"}
        </span>
      </div>
      <p className="helper">{status}</p>
      <div id={containerId} className="jsme-container" />
      <div className="button-row">
        <button type="button" className="secondary" onClick={loadCurrentSmiles}>
          Load typed SMILES
        </button>
        <button type="button" className="secondary" onClick={useDrawing}>
          Use drawing SMILES
        </button>
      </div>
    </section>
  );
}
