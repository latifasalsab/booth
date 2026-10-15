"use client";
/**
 * Etched Booth main screen and state machine:
 * IDLE -> CAMERA -> COUNTDOWN -> REVIEW -> ETCH -> EDIT -> PRINT (upload is an alternative to the camera at IDLE).
 * Left: the plate / camera stage directly on the page. Right: the steel kiosk card. Fixed to 100dvh, no scroll.
 * Each photo is analyzed ONCE (landmarks, person segmentation, edge maps; lib/analysis.ts) and cached; Detail, Glasses
 * and Hair & head covering only recompute strokes from that cache. Everything runs on the device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { SoundMap } from "@/types";
import { useCurtain } from "@/components/shared/PageCurtain";
import { cropToPortrait, useCamera } from "../hooks/useCamera";
import { useEmbossProgress } from "../hooks/useEmbossProgress";
import { analyzePhoto, type Analysis } from "../lib/analysis";
import { buildPortrait, DEFAULT_SETTINGS, MODE_NOTE, sampleFaceStrokes, type Detail, type GlassesMode, type Portrait, type PortraitSettings } from "../lib/faceStrokes";
import { createHeightCanvas, HeightPainter, hitTest, lineDeco, makeDeco, WIDTH_SCALE, type Deco, type DecoKind } from "../lib/heightMap";
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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

/** ?debug=1: console.table of what was detected. */
function logDetections(p: Portrait) {
  console.table([
    { detection: "glasses", value: p.info.glasses ? "yes" : "no", detail: `score ${p.info.glassesScore.toFixed(2)}` },
    { detection: "hair strokes", value: p.info.hairStrokes, detail: "" },
    { detection: "extra edge strokes", value: p.info.extraStrokes, detail: "" },
    { detection: "model", value: p.info.model, detail: "landmarks + segmentation" },
    { detection: "strokes by kind", value: JSON.stringify(p.info.counts), detail: "" },
  ]);
}

export default function EtchedBooth({ sound }: { sound: SoundMap }) {
  const curtain = useCurtain();
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

  // Edit settings
  const [detail, setDetail] = useState<Detail>(DEFAULT_SETTINGS.detail);
  const [glassesMode, setGlassesMode] = useState<GlassesMode>(DEFAULT_SETTINGS.glasses);
  const [hair, setHair] = useState(DEFAULT_SETTINGS.hair);
  const settingsRef = useRef<PortraitSettings>(DEFAULT_SETTINGS);
  const [size, setSize] = useState(0.5);
  const [depth, setDepth] = useState(0.5);
  const [metal, setMetal] = useState<MetalKey>("silver");
  const [bw, setBw] = useState(false);
  const [tool, setTool] = useState<DecoKind | null>(null);
  const [textValue, setTextValue] = useState("Hello");
  const [decos, setDecos] = useState<Deco[]>([]);
  const decosRef = useRef<Deco[]>([]);
  decosRef.current = decos;
  const [history, setHistory] = useState<Deco[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [print, setPrint] = useState<{ photoUrl: string; plate: HTMLCanvasElement } | null>(null);

  // Plate drawing state lives in refs so the animation never re-renders React.
  const heightCanvas = useMemo(() => (typeof document === "undefined" ? null : createHeightCanvas()), []);
  const painter = useMemo(() => new HeightPainter(), []);
  const versionRef = useRef(0);
  const penRef = useRef<PenState>({ x: 0, y: 0, on: false });
  const plateRef = useRef<PlateHandle>(null);
  const progressRef = useRef(0);
  const sizeK = 0.6 + size * 0.8; // Size slider scales every stroke width
  const decoW = 7 * WIDTH_SCALE * sizeK;
  const dataRef = useRef<{ decos: Deco[]; decoW: number }>({ decos: [], decoW });

  const repaint = useCallback(
    (p: number) => {
      if (!heightCanvas) return;
      painter.paint(heightCanvas, p, dataRef.current.decos, dataRef.current.decoW);
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
    dataRef.current = { decos, decoW };
    if (step === "EDIT") repaint(progressRef.current);
  }, [painter, sizeK, decoW, decos, step, repaint]);

  useEffect(() => {
    const on = new URLSearchParams(window.location.search).get("debug") === "1";
    debugRef.current = on;
    setDebug(on);
  }, []);

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
    dataRef.current = { decos: [], decoW };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, quiet, reduced, painter]);

  const acceptPhoto = useCallback((canvas: HTMLCanvasElement) => {
    photoRef.current = canvas;
    setPhotoUrl(canvas.toDataURL("image/jpeg", 0.92));
    setError(null);
    setModeNote(null);
    setDbg(null);
    setStep("REVIEW");
    // Analyze once, in the background: landmarks, segmentation, edge maps.
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
    const shot = camCapture();
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
        acceptPhoto(cropToPortrait(img, img.naturalWidth, img.naturalHeight));
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
    const settings = { detail, glasses: glassesMode, hair };
    settingsRef.current = settings;
    const portrait = buildPortrait(an, settings);
    if (!portrait.ok) {
      setError(NO_FACE);
      return;
    }
    painter.setBase(portrait.base);
    painter.setPath(portrait.path);
    dataRef.current = { decos: [], decoW };
    setDecos([]);
    setHistory([]);
    setSelectedId(null);
    setStep("ETCH");
    etch.start(reduced ? 1200 : etchDuration(portrait.path), () => {
      penRef.current = { ...penRef.current, on: false };
      setStep("EDIT");
    });
  }, [analyzing, detail, glassesMode, hair, painter, decoW, etch, reduced]);

  /** Recompute strokes from the cached analysis and replay only the relief update (no new analysis). */
  const applySettings = useCallback(
    (next: PortraitSettings) => {
      settingsRef.current = next;
      const an = analysisRef.current?.value;
      if (!an) return;
      const portrait = buildPortrait(an, next);
      if (!portrait.ok) return;
      painter.setBase(portrait.base);
      painter.setPath(portrait.path);
      quiet.start(reduced ? 300 : 1500, () => {
        penRef.current = { ...penRef.current, on: false };
      });
    },
    [painter, quiet, reduced],
  );
  const changeDetail = (d: Detail) => {
    setDetail(d);
    applySettings({ detail: d, glasses: glassesMode, hair });
  };
  const changeGlasses = (g: GlassesMode) => {
    setGlassesMode(g);
    applySettings({ detail, glasses: g, hair });
  };
  const changeHair = (h: boolean) => {
    setHair(h);
    applySettings({ detail, glasses: glassesMode, hair: h });
  };

  // Plate editing
  const nextId = useRef(1);
  const dragRef = useRef<{ id: number; ox: number; oy: number; moved: boolean } | null>(null);
  const draftRef = useRef<{ id: number; pts: Pt[] } | null>(null);
  const pushHistory = useCallback(() => setHistory((h) => [...h.slice(-29), decosRef.current]), []);
  const upsert = (list: Deco[], d: Deco) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]);

  const onSurface = useCallback(
    (e: SurfaceEvent) => {
      if (e.type === "down") {
        const pos = e.pos;
        if (!pos) return setSelectedId(null);
        if (tool === "line") {
          pushHistory();
          setSelectedId(null);
          draftRef.current = { id: nextId.current++, pts: [pos] };
        } else if (tool) {
          pushHistory();
          const d = makeDeco(nextId.current++, tool, pos.x, pos.y, textValue);
          setDecos((p) => [...p, d]);
          setSelectedId(d.id);
          setTool(null);
        } else {
          const hit = hitTest(decosRef.current, pos);
          setSelectedId(hit ? hit.id : null);
          dragRef.current = hit ? { id: hit.id, ox: pos.x - hit.x, oy: pos.y - hit.y, moved: false } : null;
        }
      } else if (e.type === "move" && e.pos) {
        const pos = e.pos;
        const draft = draftRef.current;
        if (draft) {
          const last = draft.pts[draft.pts.length - 1];
          if (Math.hypot(pos.x - last.x, (pos.y - last.y) * 1.25) > 0.008) {
            draft.pts.push(pos);
            const d = lineDeco(draft.id, draft.pts);
            setDecos((p) => upsert(p, d));
          }
          return;
        }
        const drag = dragRef.current;
        if (drag) {
          if (!drag.moved) {
            pushHistory();
            drag.moved = true;
          }
          setDecos((p) => p.map((d) => (d.id === drag.id ? { ...d, x: clamp01(pos.x - drag.ox), y: clamp01(pos.y - drag.oy) } : d)));
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
          const d = lineDeco(draft.id, pts);
          setDecos((p) => upsert(p, d));
          setSelectedId(d.id);
          setTool(null);
        }
        dragRef.current = null;
      }
    },
    [tool, textValue, pushHistory],
  );

  const deleteSelected = useCallback(() => {
    if (selectedId == null) return;
    pushHistory();
    setDecos((p) => p.filter((d) => d.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  const undo = () => {
    if (!history.length) return;
    setDecos(history[history.length - 1]);
    setHistory(history.slice(0, -1));
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

  // Print and restart (both run behind the page curtain)
  const behindCurtain = useCallback(async (fn: () => void) => (curtain ? curtain.run(fn) : fn()), [curtain]);

  const onPrint = useCallback(async () => {
    const plate = plateRef.current?.snapshot();
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
      setHistory([]);
      setSelectedId(null);
      setTool(null);
      setError(null);
      setNotice(null);
      setDetail(DEFAULT_SETTINGS.detail);
      setGlassesMode(DEFAULT_SETTINGS.glasses);
      setHair(DEFAULT_SETTINGS.hair);
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
                selection={selected ? { x: selected.x, y: selected.y, r: selected.r } : null}
                editing={step === "EDIT"}
                onSurface={step === "EDIT" ? onSurface : undefined}
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
                  overlay={debug && step === "REVIEW" ? <DebugOverlay an={dbg?.an ?? null} portrait={dbg?.portrait ?? null} /> : undefined}
                />
              </div>
            )}
          </div>
        </section>

        <aside className="h-[46dvh] shrink-0 p-2 lg:h-dvh lg:w-[calc(clamp(320px,30vw,440px)+16px)] lg:p-4 lg:pl-0" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <KioskPanel stepIndex={panelIndex} label={LABELS[step]}>
            {step === "IDLE" && <IdleStep plates={plates} notice={notice} onStart={startCamera} onUpload={onUpload} />}
            {step === "CAMERA" && <CameraStep ready={camStatus === "live"} onCapture={takePhoto} onCancel={cancelCamera} />}
            {step === "COUNTDOWN" && <CountdownStep count={count} />}
            {step === "REVIEW" && <ReviewStep error={error} note={modeNote} busy={analyzing} onContinue={continueToEtch} onRetake={startCamera} />}
            {step === "ETCH" && <EtchStep progress={uiProgress} />}
            {(step === "EDIT" || step === "PRINT") && (
              <EditStep
                note={modeNote}
                tool={tool}
                onTool={setTool}
                textValue={textValue}
                onText={setTextValue}
                size={size}
                onSize={setSize}
                depth={depth}
                onDepth={setDepth}
                detail={detail}
                onDetail={changeDetail}
                glasses={glassesMode}
                onGlasses={changeGlasses}
                hair={hair}
                onHair={changeHair}
                metal={metal}
                onMetal={setMetal}
                bw={bw}
                onBw={setBw}
                hasSelection={selectedId !== null}
                canUndo={history.length > 0}
                hasDecos={decos.length > 0}
                onDelete={deleteSelected}
                onUndo={undo}
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
