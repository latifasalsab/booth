"use client";
/**
 * Etched Booth main screen and state machine:
 * IDLE -> CAMERA -> COUNTDOWN -> REVIEW -> ETCH -> EDIT -> PRINT (upload is an alternative to the camera at IDLE).
 * Left: the plate / camera stage directly on the page. Right: the steel kiosk card. Fixed to 100dvh, no scroll.
 * Everything runs on the device; nothing is uploaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { SoundMap } from "@/types";
import { useCurtain } from "@/components/shared/PageCurtain";
import { cropToPortrait, useCamera } from "../hooks/useCamera";
import { useEmbossProgress } from "../hooks/useEmbossProgress";
import { detectLandmarks } from "../lib/faceLandmarker";
import { getFaceStrokes, isClearFace, sampleFaceStrokes, type Detail, type Landmark } from "../lib/faceStrokes";
import { createHeightCanvas, hitTest, lineDeco, makeDeco, paintHeightMap, type Deco, type DecoKind } from "../lib/heightMap";
import type { MetalKey } from "../lib/plateScene";
import { configureSound, initEmbossSound, play } from "../lib/sound";
import { buildSingleLine, pointAt, type LinePath, type Pt } from "../lib/strokePath";
import CameraStage from "./CameraStage";
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
const ETCH_MS = 5000;
const PLATES_KEY = "etched.plates";
const NO_FACE = "We couldn't find a clear face. Try better light.";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

export default function EtchedBooth({ sound }: { sound: SoundMap }) {
  const curtain = useCurtain();
  const reduced = useReducedMotion();
  const { videoRef, status: camStatus, start: camStart, stop: camStop, capture: camCapture } = useCamera();

  const [step, setStep] = useState<Step>("IDLE");
  const stepRef = useRef<Step>("IDLE");
  stepRef.current = step;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const [uiProgress, setUiProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const [plates, setPlates] = useState(0);
  const platesRef = useRef(0);

  // Edit settings
  const [detail, setDetail] = useState<Detail>("low");
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
  const versionRef = useRef(0);
  const penRef = useRef<PenState>({ x: 0, y: 0, on: false });
  const plateRef = useRef<PlateHandle>(null);
  const thickness = 4 + size * 10;
  const dataRef = useRef<{ path: LinePath | null; decos: Deco[]; thickness: number }>({ path: null, decos: [], thickness });

  const repaint = useCallback(
    (p: number) => {
      if (!heightCanvas) return;
      const d = dataRef.current;
      paintHeightMap(heightCanvas, d.path, p, d.decos, d.thickness);
      versionRef.current++;
    },
    [heightCanvas],
  );

  const onFrame = useCallback(
    (p: number) => {
      repaint(p);
      const path = dataRef.current.path;
      if (path) {
        const pt = pointAt(path, p);
        penRef.current = { x: pt.x, y: pt.y, on: p > 0 && p < 1 };
      }
      const pct = Math.round(p * 100);
      setUiProgress((prev) => (prev === pct ? prev : pct));
    },
    [repaint],
  );
  const etch = useEmbossProgress(onFrame, false);
  const idleLoop = useEmbossProgress(onFrame, true);

  useEffect(() => {
    dataRef.current.decos = decos;
    dataRef.current.thickness = thickness;
    if (step === "EDIT") repaint(1);
  }, [decos, thickness, step, repaint]);

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
    dataRef.current.path = buildSingleLine(sampleFaceStrokes());
    dataRef.current.decos = [];
    const run = () => {
      if (!alive) return;
      idleLoop.start(reduced ? 900 : ETCH_MS, () => {
        penRef.current = { ...penRef.current, on: false };
        timer = window.setTimeout(run, 2400);
      });
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      idleLoop.cancel();
      penRef.current = { x: 0, y: 0, on: false };
    };
  }, [step, idleLoop, reduced]);

  const acceptPhoto = useCallback((canvas: HTMLCanvasElement) => {
    photoRef.current = canvas;
    landmarksRef.current = null;
    setPhotoUrl(canvas.toDataURL("image/jpeg", 0.92));
    setError(null);
    setStep("REVIEW");
  }, []);

  const startCamera = useCallback(async () => {
    setNotice(null);
    setError(null);
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
      if ((stepRef.current as Step) !== "COUNTDOWN") return;
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
    const photo = photoRef.current;
    if (!photo || analyzing) return;
    setAnalyzing(true);
    setError(null);
    const lm = await detectLandmarks(photo); // null if the model cannot load or no face is found
    setAnalyzing(false);
    if (stepRef.current !== "REVIEW") return;
    landmarksRef.current = lm;
    const strokes = getFaceStrokes(photo, detail, lm);
    if (!lm && !isClearFace(strokes)) {
      setError(NO_FACE);
      return;
    }
    dataRef.current.path = buildSingleLine(strokes);
    dataRef.current.decos = [];
    setDecos([]);
    setHistory([]);
    setSelectedId(null);
    setStep("ETCH");
    etch.start(reduced ? 1200 : ETCH_MS, () => {
      penRef.current = { ...penRef.current, on: false };
      setStep("EDIT");
    });
  }, [detail, etch, reduced, analyzing]);

  const changeDetail = useCallback(
    (d: Detail) => {
      setDetail(d);
      const photo = photoRef.current;
      if (!photo) return;
      const lm = landmarksRef.current;
      const strokes = getFaceStrokes(photo, d, lm);
      if (lm || isClearFace(strokes)) {
        dataRef.current.path = buildSingleLine(strokes);
        repaint(1);
      }
    },
    [repaint],
  );

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
      landmarksRef.current = null;
      setDecos([]);
      setHistory([]);
      setSelectedId(null);
      setTool(null);
      setError(null);
      setNotice(null);
      setDetail("low");
      setSize(0.5);
      setDepth(0.5);
      setMetal("silver");
      setBw(false);
      penRef.current = { x: 0, y: 0, on: false };
      dataRef.current.path = null;
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
            {step === "REVIEW" && <ReviewStep error={error} busy={analyzing} onContinue={continueToEtch} onRetake={startCamera} />}
            {step === "ETCH" && <EtchStep progress={uiProgress} />}
            {(step === "EDIT" || step === "PRINT") && (
              <EditStep
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
