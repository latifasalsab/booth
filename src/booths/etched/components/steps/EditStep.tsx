"use client";
/**
 * EDIT: tools (select one, then tap the plate), Layers (Silhouette, Face, Glasses, Hair & head covering, Tonal relief,
 * Blank plate / Restore face), the selected element's transform controls (size, rotation, stroke width, text + font,
 * to front, delete), Undo / Redo / Clear, Size / Depth, Detail, Glasses mode, metal, B&W toggle and the Print key.
 */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";
import { FONT_LABEL, scaleLimits, unitPolylines, type Deco, type DecoKind, type FontKey } from "../../lib/elements";
import type { Detail, GlassesMode, Layers } from "../../lib/faceStrokes";
import { METALS, type MetalKey } from "../../lib/plateScene";

const TOOLS: { id: DecoKind; label: string }[] = [
  { id: "star", label: "Star" },
  { id: "flower", label: "Flower" },
  { id: "heart", label: "Heart" },
  { id: "snowflake", label: "Snowflake" },
  { id: "text", label: "Text" },
  { id: "line", label: "Free line" },
];
const DETAILS: { id: Detail; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "detailed", label: "Detailed" },
  { id: "max", label: "Max" },
];
const GLASSES: { id: GlassesMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];
const LAYERS: { id: keyof Layers; label: string }[] = [
  { id: "silhouette", label: "Silhouette" },
  { id: "face", label: "Face" },
  { id: "glasses", label: "Glasses" },
  { id: "hair", label: "Hair & head covering" },
  { id: "tonal", label: "Tonal relief" },
];

function ToolIcon({ kind }: { kind: DecoKind }) {
  if (kind === "text")
    return (
      <svg viewBox="-1.25 -1.25 2.5 2.5" width="22" height="22" aria-hidden>
        <text x="0" y="0.5" textAnchor="middle" fontSize="1.5" fontWeight="800" fill="currentColor">
          T
        </text>
      </svg>
    );
  if (kind === "line")
    return (
      <svg viewBox="-1.25 -1.25 2.5 2.5" width="22" height="22" aria-hidden>
        <path d="M-1 0.3 C-0.5 -0.9 0 0.9 0.5 -0.3 S1 0.2 1 0.2" fill="none" stroke="currentColor" strokeWidth="0.16" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="-1.25 -1.25 2.5 2.5" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="0.14" strokeLinecap="round" strokeLinejoin="round">
      {unitPolylines(kind).map((pl, i) => (
        <path key={i} d={pl.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join("")} />
      ))}
    </svg>
  );
}

interface Props {
  note?: string | null;
  tool: DecoKind | null;
  onTool: (t: DecoKind | null) => void;
  textValue: string;
  onText: (v: string) => void;
  textFont: FontKey;
  /** Selected element, or null. */
  selected: Deco | null;
  /** Patch the selected element; key coalesces slider drags into one undo step. */
  onElement: (patch: Partial<Deco>, key: string) => void;
  onToFront: () => void;
  size: number;
  onSize: (v: number) => void;
  depth: number;
  onDepth: (v: number) => void;
  detail: Detail;
  onDetail: (d: Detail) => void;
  glasses: GlassesMode;
  onGlasses: (g: GlassesMode) => void;
  layers: Layers;
  onLayer: (k: keyof Layers, v: boolean) => void;
  blank: boolean;
  onBlank: () => void;
  onRestore: () => void;
  metal: MetalKey;
  onMetal: (m: MetalKey) => void;
  bw: boolean;
  onBw: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  hasDecos: boolean;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onPrint: () => void;
}

export default function EditStep(p: Props) {
  const sel = p.selected;
  const lim = sel ? scaleLimits(sel) : null;
  return (
    <>
      <KioskDisplay>
        <div className="flex flex-col gap-3.5">
          {p.note && <p className="notice">{p.note}</p>}

          <section aria-label="Tools">
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className="tool" aria-pressed={p.tool === t.id} aria-label={t.label} title={t.label} onClick={() => p.onTool(p.tool === t.id ? null : t.id)}>
                  <ToolIcon kind={t.id} />
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] opacity-80">
              {p.tool ? `Tap the plate to place: ${TOOLS.find((t) => t.id === p.tool)?.label}.` : "Pick a tool, then tap the plate. Tap an element to select it, drag to move."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className="mini" disabled={!p.canUndo} onClick={p.onUndo}>
                Undo
              </button>
              <button type="button" className="mini" disabled={!p.canRedo} onClick={p.onRedo}>
                Redo
              </button>
              <button type="button" className="mini" disabled={!p.hasDecos} onClick={p.onClear}>
                Clear
              </button>
            </div>
          </section>

          {(sel || p.tool === "text") && (
            <section aria-label="Element" className="panel-box">
              {(p.tool === "text" || sel?.kind === "text") && (
                <>
                  <input
                    className="text-field"
                    value={sel?.kind === "text" ? sel.text ?? "" : p.textValue}
                    maxLength={12}
                    onChange={(e) => (sel?.kind === "text" ? p.onElement({ text: e.target.value }, "text") : p.onText(e.target.value))}
                    aria-label="Text"
                  />
                  <div className="seg mt-1.5" role="group" aria-label="Font">
                    {(Object.keys(FONT_LABEL) as FontKey[]).map((f) => (
                      <button key={f} type="button" aria-pressed={(sel?.kind === "text" ? sel.font : p.textFont) === f} onClick={() => p.onElement({ font: f }, "font")}>
                        {FONT_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {sel && lim && (
                <>
                  <label className="mt-2 block text-[11px] font-semibold">
                    {sel.kind === "text" ? "Font size" : "Element size"} · {Math.round(sel.scale * 100)}%
                    <input
                      className="etb-range"
                      type="range"
                      min={Math.round(lim.min * 100)}
                      max={Math.round(lim.max * 100)}
                      value={Math.round(sel.scale * 100)}
                      onChange={(e) => p.onElement({ scale: +e.target.value / 100 }, "scale")}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold">
                    Rotation · {Math.round((sel.rot * 180) / Math.PI)}°
                    <input className="etb-range" type="range" min={-180} max={180} value={Math.round((sel.rot * 180) / Math.PI)} onChange={(e) => p.onElement({ rot: (+e.target.value * Math.PI) / 180 }, "rot")} />
                  </label>
                  {sel.kind === "line" && (
                    <label className="block text-[11px] font-semibold">
                      Stroke width · {sel.lw.toFixed(0)}
                      <input className="etb-range" type="range" min={3} max={16} value={sel.lw} onChange={(e) => p.onElement({ lw: +e.target.value }, "lw")} />
                    </label>
                  )}
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" className="mini" onClick={p.onToFront}>
                      To front
                    </button>
                    <button type="button" className="mini" onClick={p.onDelete}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <section aria-label="Layers">
            <div className="flex flex-wrap gap-1.5">
              {LAYERS.map((l) => (
                <button key={l.id} type="button" className="mini" aria-pressed={p.layers[l.id]} onClick={() => p.onLayer(l.id, !p.layers[l.id])}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" className="mini" disabled={p.blank} onClick={p.onBlank}>
                Blank plate
              </button>
              <button type="button" className="mini" disabled={!p.blank} onClick={p.onRestore}>
                Restore face
              </button>
            </div>
          </section>

          <label className="block text-[11px] font-semibold">
            Size
            <input className="etb-range" type="range" min={0} max={100} value={Math.round(p.size * 100)} onChange={(e) => p.onSize(+e.target.value / 100)} />
          </label>
          <label className="block text-[11px] font-semibold">
            Depth
            <input className="etb-range" type="range" min={0} max={100} value={Math.round(p.depth * 100)} onChange={(e) => p.onDepth(+e.target.value / 100)} />
          </label>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">Detail</span>
            <div className="seg" role="group" aria-label="Detail">
              {DETAILS.map((d) => (
                <button key={d.id} type="button" aria-pressed={p.detail === d.id} onClick={() => p.onDetail(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">Glasses</span>
            <div className="seg" role="group" aria-label="Glasses">
              {GLASSES.map((g) => (
                <button key={g.id} type="button" aria-pressed={p.glasses === g.id} onClick={() => p.onGlasses(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">Metal</span>
            <div className="flex gap-2" role="group" aria-label="Metal">
              {(Object.keys(METALS) as MetalKey[]).map((m) => (
                <button key={m} type="button" className="swatch" aria-pressed={p.metal === m} aria-label={METALS[m].label} title={METALS[m].label} style={{ background: METALS[m].swatch }} onClick={() => p.onMetal(m)} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">B&amp;W photo</span>
            <button type="button" role="switch" aria-checked={p.bw} aria-label="Black and white photo" className="switch" onClick={() => p.onBw(!p.bw)} />
          </div>
        </div>
      </KioskDisplay>
      <KioskFooter>
        <SteelButton led onClick={p.onPrint} className="flex-1">
          Print
        </SteelButton>
      </KioskFooter>
    </>
  );
}
