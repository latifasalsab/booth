"use client";
/**
 * Etched Booth main screen and state machine:
 * IDLE -> CAMERA -> COUNTDOWN -> REVIEW -> ETCH -> EDIT -> PRINT (upload is an alternative to the camera at IDLE).
 * Left: the plate / camera stage directly on the page. Right: the steel kiosk card. Fixed to 100dvh, no scroll.
 * The photo is oriented exactly as the preview (optional Flip view) BEFORE analysis; each photo is analyzed ONCE
 * (landmarks, segmentation, edge maps) and cached; Detail, Glasses and Layers only recompute strokes from that cache.
 * User elements (stars, text, lines ...) have a full transform (move, scale, rotate, pinch) with undo/redo.
 * Everything runs on the device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { SoundMap } from "@/types";
import { useReadyGate, useTransitions } from "@/components/shared/TransitionProvider";
import { cropToPortrait, useCamera } from "../hooks/useCamera";
import { useEmbossProgress } from "../hooks/useEmbossProgress";
import { ModelsProvider, useModels } from "../hooks/useModels";
import { analyzePhoto, type Analysis } from "../lib/analysis";
import { clampDeco, decoFrame, hitHandle, hitTest, lineDeco, makeDeco, normAngle, setDecoFonts, type Deco, type DecoKind, type FontKey } from "../lib/elements";
import { buildPortrait, DEFAULT_LAYERS, DEFAULT_SETTINGS, MODE_NOTE, sampleFaceStrokes, type Detail, type GlassesMode, type Layers, type Portrait, type PortraitSettings } from "../lib/faceStrokes";
import { createHeightCanvas, HeightPainter, HH, HW } from "../lib/heightMap";
import type { MetalKey } from "../lib/plateScene";
import { configureSound, initEmbossSound, play } from "../lib/sound";
import { buildSingleLine, etchDuration, pointAt, type Pt } from "../lib/strokePath";
import CameraStage from "./CameraStage";
import DebugOverlay from "./DebugOverlay";
import KioskPanel from "./KioskPanel";
import PickupView from "./PickupView";
import PlateCanvas, { type PenState, type PlateHandle, type SurfaceEvent } from "./PlateCanvas";
import CameraStep from "./steps/CameraStep";
import CountdownStep from "./steps/CountdownStep";
import EditStep from "./steps/EditStep";
import EtchStep from "./steps/EtchStep";
import IdleStep from "./steps/IdleStep";
import ReviewStep from "./steps/ReviewStep";

type Step = "IDLE" | "CAMERA" | "COUNTDOWN" | "REVIEW" | "ETCH" | "EDIT" | "PRINT";
const PANEL_STEPS: Step[] = ["IDLE", "CAMERA", "COUNTDOWN", "REVIEW", "ETCH", "EDIT"];
const LABELS: Record<Step, string> = {
  IDLE: "TOUCH TO START",
  CAMERA: "FRAME YOUR FACE",
  COUNTDOWN: "HOLD STILL",
  REVIEW: "CHECK THE SHOT",
  ETCH: "ETCHING",
  EDIT: "ADJUST AND PRINT",
  PRINT: "PRINTING",
};
const IDLE_MS = 5000;
const PLATES_KEY = "etched.plates";
const NO_FACE = "We couldn't find a clear face. Try better light.";
const YK = HW / HH;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const noLayers = (l: Layers) => !(l.silhouette || l.face || l.glasses || l.hair || l.tonal);

type Gesture =
  | { mode: "move"; id: number; ox: number; oy: number; moved: boolean }
  | { mode: "scale"; id: number; d0: number; s0: number }
  | { mode: "rotate"; id: number }
  | { mode: "pinch"; id: number; s0: number; r0: number };

/** ?debug=1: console.table of what was detected. */
function logDetections(p: Portrait) {
  console.table([
    { detection: "glasses", value: p.info.glasses ? p.info.glassesMode : "no", detail: `score ${p.info.glassesScore.toFixed(2)}` },
    { detection: "hair strokes", value: p.info.hairStrokes, detail: "" },
    { detection: "extra edge strokes", value: p.info.extraStrokes, detail: "" },
    { detection: "model", value: p.info.model, detail: "landmarks + segmentation" },
    { detection: "strokes by kind", value: JSON.stringify(p.info.counts), detail: "" },
  ]);
}

function EtchedBoothInner({ sound }: { sound: SoundMap }) {
  const curtain = useTransitions();
  const models = useModels();
  const warming = models.overall === "loading";
  const [plateReady, setPlateReady] = useState(false);
  useReadyGate(plateReady); // /etched is revealed only after the plate has rendered its first frame
  const reduced = useReducedMotion();
  const { videoRef, status: camStatus, start: camStart, stop: camStop, capture: camCapture } = useCamera();

  const [step, setStep] = useState<Step>("IDLE");
  const stepRef = useRef<Step>("IDLE");
  stepRef.current = step;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeNote, setModeNote] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [flip, setFlip] = useState(false);
  const flipRef = useRef(false);
  flipRef.current = flip;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const [uiProgress, setUiProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [plates, setPlates] = useState(0);
  const platesRef = useRef(0);
  const [debug, setDebug] = useState(false);
  const debugRef = useRef(false);
  const [dbg, setDbg] = useState<{ an: Analysis; portrait: Portrait } | null>(null);
  const analysisRef = useRef<{ promise: Promise<Analysis>; value: Analysis | null } | null>(null);

  // Portrait settings
  const [detail, setDetail] = useState<Detail>(DEFAULT_SETTINGS.detail);
  const [glassesMode, setGlassesMode] = useState<GlassesMode>(DEFAULT_SETTINGS.glasses);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const layersBackup = useRef<Layers>(DEFAULT_LAYERS);
  const settingsRef = useRef<PortraitSettings>(DEFAULT_SETTINGS);
  const [size, setSize] = useState(0.5);
  const [depth, setDepth] = useState(0.5);
  const [metal, setMetal] = useState<MetalKey>("silver");
  const [bw, setBw] = useState(false);

  // Own elements
  const [tool, setTool] = useState<DecoKind | null>(null);
  const [textValue, setTextValue] = useState("Hello");
  const [textFont, setTextFont] = useState<FontKey>("anton");
  const [decos, setDecos] = useState<Deco[]>([]);
  const decosRef = useRef<Deco[]>([]);
  decosRef.current = decos;
  const [history, setHistory] = useState<Deco[][]>([]);
  const [future, setFuture] = useState<Deco[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const [print, setPrint] = useState<{ photoUrl: string; plate: HTMLCanvasElement } | null>(null);

  // Plate drawing state lives in refs so the animation never re-renders React.
  const heightCanvas = useMemo(() => (typeof document === "undefined" ? null : createHeightCanvas()), []);
  const painter = useMemo(() => new HeightPainter(), []);
  const versionRef = useRef(0);
  const penRef = useRef<PenState>({ x: 0, y: 0, on: false });
  const plateRef = useRef<PlateHandle>(null);
  const progressRef = useRef(0);
  const sizeK = 0.6 + size * 0.8; // Size slider scales every stroke width

  const repaint = useCallback(
    (p: number) => {
      if (!heightCanvas) return;
      painter.paint(heightCanvas, p, decosRef.current);
      versionRef.current++;
    },
    [heightCanvas, painter],
  );

  const onFrame = useCallback(
    (p: number) => {
      progressRef.current = p;
      repaint(p);
      const path = painter.path;
      if (path) {
        const pt = pointAt(path, p);
        penRef.current = { x: pt.x, y: pt.y, on: p > 0 && p < 1 };
      }
      const pct = Math.round(p * 100);
      setUiProgress((prev) => (prev === pct ? prev : pct));
    },
    [painter, repaint],
  );
  const etch = useEmbossProgress(onFrame, false);
  const quiet = useEmbossProgress(onFrame, true); // idle loop and relief replays: no global progress, no sound

  useEffect(() => {
    painter.setSizeK(sizeK);
    if (step === "EDIT") repaint(progressRef.current);
  }, [painter, sizeK, decos, step, repaint]);

  useEffect(() => {
    const on = new URLSearchParams(window.location.search).get("debug") === "1";
    debugRef.current = on;
    setDebug(on);
  }, []);

  // Canvas text needs concrete family names: read them from the booth's font variables.
  useEffect(() => {
    const root = document.querySelector('[data-booth="etched"]');
    if (!root) return;
    const cs = getComputedStyle(root);
    const fam = { anton: cs.getPropertyValue("--font-display").trim(), jakarta: cs.getPropertyValue("--font-ui").trim(), doto: cs.getPropertyValue("--font-dot").trim() };
    setDecoFonts(fam);
    Promise.all(Object.values(fam).filter(Boolean).map((f) => document.fonts.load(`40px ${f}`).catch(() => [])))
      .then(() => repaint(progressRef.current))
      .catch(() => {});
  }, [repaint]);

  // Sound wiring and plate counter
  useEffect(() => {
    configureSound(sound);
    return initEmbossSound();
  }, [sound]);
  useEffect(() => {
    try {
      const n = parseInt(localStorage.getItem(PLATES_KEY) ?? "0", 10);
      if (Number.isFinite(n) && n > 0) {
        platesRef.current = n;
        setPlates(n);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  // IDLE: loop the sample face, drawn as one continuous line.
  useEffect(() => {
    if (step !== "IDLE") return;
    let alive = true;
    let timer = 0;
    painter.setBase(null);
    painter.setPath(buildSingleLine(sampleFaceStrokes(), 9));
    const run = () => {
      if (!alive) return;
      quiet.start(reduced ? 900 : IDLE_MS, () => {
        penRef.current = { ...penRef.current, on: false };
        timer = window.setTimeout(run, 2400);
      });
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      quiet.cancel();
      penRef.current = { x: 0, y: 0, on: false };
    };
  }, [step, quiet, reduced, painter]);

  const acceptPhoto = useCallback((canvas: HTMLCanvasElement) => {
    photoRef.current = canvas; // already oriented exactly like the preview (or an unflipped upload)
    setPhotoUrl(canvas.toDataURL("image/jpeg", 0.92));
    setError(null);
    setModeNote(null);
    setDbg(null);
    setStep("REVIEW");
    // Analyze once, in the background: landmarks, segmentation, edge maps. Everything downstream shares this orientation.
    const slot = { promise: analyzePhoto(canvas), value: null as Analysis | null };
    analysisRef.current = slot;
    slot.promise
      .then((an) => {
        if (analysisRef.current !== slot) return;
        slot.value = an;
        setModeNote(an.masks ? null : MODE_NOTE);
        if (debugRef.current) {
          const portrait = buildPortrait(an, settingsRef.current);
          setDbg({ an, portrait });
          logDetections(portrait);
        }
      })
      .catch(() => {
        if (analysisRef.current === slot) analysisRef.current = null;
      });
  }, []);

  const startCamera = useCallback(async () => {
    setNotice(null);
    setError(null);
    analysisRef.current = null;
    setStep("CAMERA");
    const s = await camStart();
    if (stepRef.current !== "CAMERA" || s === "idle") return;
    if (s !== "live") {
      setStep("IDLE");
      setNotice(
        s === "unsupported"
          ? "The camera needs HTTPS or localhost. Upload a photo instead."
          : "Camera access was blocked. Allow it in your browser settings, or upload a photo.",
      );
    }
  }, [camStart]);

  const cancelCamera = useCallback(() => {
    camStop();
    setStep("IDLE");
  }, [camStop]);

  const takePhoto = useCallback(async () => {
    if (stepRef.current !== "CAMERA") return;
    setStep("COUNTDOWN");
    for (const n of [3, 2, 1]) {
      setCount(n);
      play("countdown");
      await sleep(900);
      if (stepRef.current !== "COUNTDOWN") return;
    }
    setCount(null);
    play("shutter");
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
    const shot = camCapture(flipRef.current); // flipped exactly like the preview when Flip view is on
    camStop();
    if (!shot) {
      setStep("IDLE");
      setNotice("The camera did not deliver a frame. Try again or upload a photo.");
      return;
    }
    acceptPhoto(shot);
  }, [camCapture, camStop, acceptPhoto]);

  const onUpload = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        acceptPhoto(cropToPortrait(img, img.naturalWidth, img.naturalHeight)); // uploads are never flipped
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setNotice("That file could not be read. Try a JPG or PNG photo.");
      };
      img.src = url;
    },
    [acceptPhoto],
  );

  const continueToEtch = useCallback(async () => {
    const slot = analysisRef.current;
    if (!slot || analyzing) return;
    setAnalyzing(true);
    setError(null);
    let an: Analysis;
    try {
      an = await slot.promise;
    } catch {
      setAnalyzing(false);
      setError(NO_FACE);
      return;
    }
    setAnalyzing(false);
    if (stepRef.current !== "REVIEW" || analysisRef.current !== slot) return;
    const settings = { detail, glasses: glassesMode, layers };
    settingsRef.current = settings;
    const portrait = buildPortrait(an, settings);
    if (!portrait.ok) {
      setError(NO_FACE);
      return;
    }
    painter.setBase(portrait.base);
    painter.setPath(portrait.path);
    setDecos([]);
    decosRef.current = [];
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setStep("ETCH");
    etch.start(reduced ? 1200 : etchDuration(portrait.path), () => {
      penRef.current = { ...penRef.current, on: false };
      setStep("EDIT");
    });
  }, [analyzing, detail, glassesMode, layers, painter, etch, reduced]);

  /** Recompute strokes from the cached analysis. replay = short relief replay, otherwise an instant update. */
  const rebuild = useCallback(
    (next: PortraitSettings, replay: boolean) => {
      settingsRef.current = next;
      const an = analysisRef.current?.value;
      if (!an) return;
      const portrait = buildPortrait(an, next);
      if (!portrait.ok) return;
      painter.setBase(portrait.base);
      painter.setPath(portrait.path);
      if (replay) {
        quiet.start(reduced ? 300 : 1500, () => {
          penRef.current = { ...penRef.current, on: false };
        });
      } else {
        quiet.cancel();
        penRef.current = { ...penRef.current, on: false };
        progressRef.current = 1;
        repaint(1);
      }
    },
    [painter, quiet, reduced, repaint],
  );
  const changeDetail = (d: Detail) => {
    setDetail(d);
    rebuild({ detail: d, glasses: glassesMode, layers }, true);
  };
  const changeGlasses = (g: GlassesMode) => {
    setGlassesMode(g);
    rebuild({ detail, glasses: g, layers }, true);
  };
  const applyLayers = (next: Layers) => {
    setLayers(next);
    rebuild({ detail, glasses: glassesMode, layers: next }, false);
  };
  const changeLayer = (k: keyof Layers, v: boolean) => applyLayers({ ...layers, [k]: v });
  const blankPlate = () => {
    if (!noLayers(layers)) layersBackup.current = layers;
    applyLayers({ silhouette: false, face: false, glasses: false, hair: false, tonal: false });
  };
  const restoreFace = () => applyLayers(noLayers(layersBackup.current) ? DEFAULT_LAYERS : layersBackup.current);

  // ------------------------------------------------------------ own elements
  const nextId = useRef(1);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<{ id: number; pts: Pt[] } | null>(null);
  const coalesce = useRef({ key: "", t: 0 });

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-29), decosRef.current]);
    setFuture([]);
  }, []);
  /** Slider drags and typing become ONE undo step (same key within 800 ms). */
  const touch = useCallback(
    (key: string) => {
      const now = Date.now();
      if (coalesce.current.key !== key || now - coalesce.current.t > 800) pushHistory();
      coalesce.current = { key, t: now };
    },
    [pushHistory],
  );
  const patchDeco = useCallback((id: number, patch: Partial<Deco> | ((d: Deco) => Deco)) => {
    setDecos((list) => list.map((d) => (d.id === id ? clampDeco(typeof patch === "function" ? patch(d) : { ...d, ...patch }) : d)));
  }, []);
  const upsert = (list: Deco[], d: Deco) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]);

  const onSurface = useCallback(
    (e: SurfaceEvent) => {
      const list = decosRef.current;
      if (e.type === "down") {
        const pos = e.pos;
        if (!pos) return setSelectedId(null);
        const sel = list.find((d) => d.id === selectedIdRef.current);
        if (!tool && sel) {
          const h = hitHandle(sel, pos);
          if (h === "scale") {
            pushHistory();
            gestureRef.current = { mode: "scale", id: sel.id, d0: Math.max(0.01, Math.hypot(pos.x - sel.x, (pos.y - sel.y) / YK)), s0: sel.scale };
            return;
          }
          if (h === "rotate") {
            pushHistory();
            gestureRef.current = { mode: "rotate", id: sel.id };
            return;
          }
        }
        if (tool === "line") {
          pushHistory();
          setSelectedId(null);
          draftRef.current = { id: nextId.current++, pts: [pos] };
        } else if (tool) {
          pushHistory();
          const d = makeDeco(nextId.current++, tool, pos.x, pos.y, textValue, textFont);
          setDecos((p) => [...p, d]);
          setSelectedId(d.id);
          setTool(null);
        } else {
          const hit = hitTest(list, pos);
          setSelectedId(hit ? hit.id : null);
          gestureRef.current = hit ? { mode: "move", id: hit.id, ox: pos.x - hit.x, oy: pos.y - hit.y, moved: false } : null;
        }
      } else if (e.type === "move" && e.pos) {
        const pos = e.pos;
        const draft = draftRef.current;
        if (draft) {
          const last = draft.pts[draft.pts.length - 1];
          if (Math.hypot(pos.x - last.x, (pos.y - last.y) / YK) > 0.008) {
            draft.pts.push(pos);
            const d = lineDeco(draft.id, draft.pts);
            setDecos((p) => upsert(p, d));
          }
          return;
        }
        const g = gestureRef.current;
        if (!g) return;
        if (g.mode === "move") {
          if (!g.moved) {
            pushHistory();
            g.moved = true;
          }
          patchDeco(g.id, { x: pos.x - g.ox, y: pos.y - g.oy });
        } else if (g.mode === "scale") {
          const d = list.find((x) => x.id === g.id);
          if (d) patchDeco(g.id, { scale: (g.s0 * Math.hypot(pos.x - d.x, (pos.y - d.y) / YK)) / g.d0 });
        } else if (g.mode === "rotate") {
          patchDeco(g.id, (d) => ({ ...d, rot: normAngle(Math.atan2((pos.y - d.y) / YK, pos.x - d.x) + Math.PI / 2) }));
        }
      } else if (e.type === "up") {
        const draft = draftRef.current;
        if (draft) {
          draftRef.current = null;
          const s = draft.pts[0];
          const pts =
            draft.pts.length < 3
              ? Array.from({ length: 25 }, (_, i) => ({ x: s.x - 0.09 + (i / 24) * 0.18, y: s.y + Math.sin((i / 24) * Math.PI * 3) * 0.025 }))
              : draft.pts;
          const d = clampDeco(lineDeco(draft.id, pts));
          setDecos((p) => upsert(p, d));
          setSelectedId(d.id);
          setTool(null);
        }
        gestureRef.current = null;
      } else if (e.type === "pinchStart") {
        const sel = list.find((d) => d.id === selectedIdRef.current);
        if (sel) {
          pushHistory();
          gestureRef.current = { mode: "pinch", id: sel.id, s0: sel.scale, r0: sel.rot };
        }
      } else if (e.type === "pinch") {
        const g = gestureRef.current;
        if (g && g.mode === "pinch") patchDeco(g.id, { scale: g.s0 * (e.scale ?? 1), rot: normAngle(g.r0 + (e.rot ?? 0)) });
      } else if (e.type === "pinchEnd") {
        gestureRef.current = null;
      }
    },
    [tool, textValue, textFont, pushHistory, patchDeco],
  );

  const onElement = (patch: Partial<Deco>, key: string) => {
    const id = selectedIdRef.current;
    if (patch.font) setTextFont(patch.font);
    if (id == null) return;
    touch(`${id}:${key}`);
    patchDeco(id, patch);
  };
  const toFront = () => {
    const id = selectedIdRef.current;
    if (id == null) return;
    pushHistory();
    setDecos((p) => {
      const d = p.find((x) => x.id === id);
      return d ? [...p.filter((x) => x.id !== id), d] : p;
    });
  };
  const deleteSelected = useCallback(() => {
    if (selectedId == null) return;
    pushHistory();
    setDecos((p) => p.filter((d) => d.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, pushHistory]);
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [decosRef.current, ...f]);
    setDecos(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelectedId(null);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, decosRef.current]);
    setDecos(future[0]);
    setFuture(future.slice(1));
    setSelectedId(null);
  };
  const clearAll = () => {
    pushHistory();
    setDecos([]);
    setSelectedId(null);
  };

  useEffect(() => {
    if (step !== "EDIT") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, deleteSelected]);

  // ------------------------------------------------------------ print and restart (behind the page curtain)
  const behindCurtain = useCallback(async (fn: () => void) => (curtain ? curtain.run(fn) : fn()), [curtain]);

  const onPrint = useCallback(async () => {
    const plate = plateRef.current?.snapshot(); // honors layer visibility and elements: it is the plate as shown
    if (!plate || !photoUrl) return;
    await behindCurtain(() => {
      setSelectedId(null);
      setPrint({ photoUrl, plate });
      setStep("PRINT");
      const n = platesRef.current + 1;
      platesRef.current = n;
      setPlates(n);
      try {
        localStorage.setItem(PLATES_KEY, String(n));
      } catch {
        /* storage unavailable */
      }
    });
  }, [photoUrl, behindCurtain]);

  const again = useCallback(async () => {
    await behindCurtain(() => {
      camStop();
      setPrint(null);
      setPhotoUrl(null);
      photoRef.current = null;
      analysisRef.current = null;
      settingsRef.current = DEFAULT_SETTINGS;
      setDbg(null);
      setModeNote(null);
      setDecos([]);
      decosRef.current = [];
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setTool(null);
      setError(null);
      setNotice(null);
      setFlip(false);
      setDetail(DEFAULT_SETTINGS.detail);
      setGlassesMode(DEFAULT_SETTINGS.glasses);
      setLayers(DEFAULT_LAYERS);
      layersBackup.current = DEFAULT_LAYERS;
      setSize(0.5);
      setDepth(0.5);
      setMetal("silver");
      setBw(false);
      penRef.current = { x: 0, y: 0, on: false };
      setStep("IDLE");
    });
  }, [behindCurtain, camStop]);

  const showMedia = step === "CAMERA" || step === "COUNTDOWN" || step === "REVIEW";
  const selected = decos.find((d) => d.id === selectedId) ?? null;
  const frame = useMemo(() => (selected ? decoFrame(selected) : null), [selected]);
  const panelIndex = Math.max(0, PANEL_STEPS.indexOf(step));

  return (
    <main className="relative h-dvh overflow-hidden">
      <div className="flex h-full flex-col lg:flex-row">
        <section className="relative min-h-0 flex-1" aria-label="Plate stage">
          <div className="absolute inset-x-0 bottom-0 top-[68px] px-2 pb-2 lg:top-[76px] lg:px-8 lg:pb-6">
            <div className={`absolute inset-0 transition-opacity duration-200 ${showMedia ? "pointer-events-none opacity-0" : "opacity-100"}`}>
              <PlateCanvas
                ref={plateRef}
                className="h-full w-full"
                heightCanvas={heightCanvas}
                versionRef={versionRef}
                penRef={penRef}
                metal={metal}
                depth={depth}
                frame={frame}
                editing={step === "EDIT"}
                onSurface={step === "EDIT" ? onSurface : undefined}
                onFirstFrame={() => setPlateReady(true)}
              />
            </div>
            {showMedia && (
              <div className="absolute inset-0 flex items-center justify-center p-3 lg:p-6">
                <CameraStage
                  mode={step === "REVIEW" ? "review" : step === "COUNTDOWN" ? "countdown" : "camera"}
                  videoRef={videoRef}
                  photoUrl={photoUrl}
                  count={count}
                  flash={flash}
                  status={camStatus}
                  flip={flip}
                  overlay={debug && step === "REVIEW" ? <DebugOverlay an={dbg?.an ?? null} portrait={dbg?.portrait ?? null} /> : undefined}
                />
              </div>
            )}
          </div>
        </section>

        <aside className="h-[46dvh] shrink-0 p-2 lg:h-dvh lg:w-[calc(clamp(320px,30vw,440px)+16px)] lg:p-4 lg:pl-0" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <KioskPanel stepIndex={panelIndex} label={step === "IDLE" && warming ? "WARMING UP" : LABELS[step]} ready={!(step === "IDLE" && warming)}>
            {step === "IDLE" && <IdleStep plates={plates} notice={notice} onStart={startCamera} onUpload={onUpload} />}
            {step === "CAMERA" && <CameraStep ready={camStatus === "live"} loadingNote={warming} flip={flip} onFlip={setFlip} onCapture={takePhoto} onCancel={cancelCamera} />}
            {step === "COUNTDOWN" && <CountdownStep count={count} />}
            {step === "REVIEW" && <ReviewStep error={error} note={modeNote} loadingNote={warming} busy={analyzing} onContinue={continueToEtch} onRetake={startCamera} />}
            {step === "ETCH" && <EtchStep progress={uiProgress} />}
            {(step === "EDIT" || step === "PRINT") && (
              <EditStep
                note={modeNote}
                tool={tool}
                onTool={setTool}
                textValue={textValue}
                onText={setTextValue}
                textFont={textFont}
                selected={selected}
                onElement={onElement}
                onToFront={toFront}
                size={size}
                onSize={setSize}
                depth={depth}
                onDepth={setDepth}
                detail={detail}
                onDetail={changeDetail}
                glasses={glassesMode}
                onGlasses={changeGlasses}
                layers={layers}
                onLayer={changeLayer}
                blank={noLayers(layers)}
                onBlank={blankPlate}
                onRestore={restoreFace}
                metal={metal}
                onMetal={setMetal}
                bw={bw}
                onBw={setBw}
                canUndo={history.length > 0}
                canRedo={future.length > 0}
                hasDecos={decos.length > 0}
                onDelete={deleteSelected}
                onUndo={undo}
                onRedo={redo}
                onClear={clearAll}
                onPrint={onPrint}
              />
            )}
          </KioskPanel>
        </aside>
      </div>

      {step === "PRINT" && print && <PickupView photoUrl={print.photoUrl} plate={print.plate} bw={bw} onAgain={again} />}
    </main>
  );
}

export default function EtchedBooth(props: { sound: SoundMap }) {
  return (
    <ModelsProvider>
      <EtchedBoothInner {...props} />
    </ModelsProvider>
  );
}
