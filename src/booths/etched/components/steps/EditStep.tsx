"use client";
/**
 * EDIT: tools (select one, then tap the plate), Size / Depth sliders, Detail, metal swatches,
 * B&W toggle for the printed photo, Undo / Clear / Delete, and the Print key.
 */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";
import type { Detail } from "../../lib/faceStrokes";
import { unitPolylines, type DecoKind } from "../../lib/heightMap";
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
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
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
  tool: DecoKind | null;
  onTool: (t: DecoKind | null) => void;
  textValue: string;
  onText: (v: string) => void;
  size: number;
  onSize: (v: number) => void;
  depth: number;
  onDepth: (v: number) => void;
  detail: Detail;
  onDetail: (d: Detail) => void;
  metal: MetalKey;
  onMetal: (m: MetalKey) => void;
  bw: boolean;
  onBw: (v: boolean) => void;
  hasSelection: boolean;
  canUndo: boolean;
  hasDecos: boolean;
  onDelete: () => void;
  onUndo: () => void;
  onClear: () => void;
  onPrint: () => void;
}

export default function EditStep(p: Props) {
  return (
    <>
      <KioskDisplay>
        <div className="flex flex-col gap-3.5">
          <section aria-label="Tools">
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className="tool" aria-pressed={p.tool === t.id} aria-label={t.label} title={t.label} onClick={() => p.onTool(p.tool === t.id ? null : t.id)}>
                  <ToolIcon kind={t.id} />
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] opacity-80">{p.tool ? `Tap the plate to place: ${TOOLS.find((t) => t.id === p.tool)?.label}.` : "Pick a tool, then tap the plate. Tap a mark to select and drag it."}</p>
            {p.tool === "text" && (
              <input className="text-field mt-1.5" value={p.textValue} maxLength={10} onChange={(e) => p.onText(e.target.value)} aria-label="Text to place" />
            )}
            <div className="mt-2 flex gap-1.5">
              <button type="button" className="mini" disabled={!p.hasSelection} onClick={p.onDelete}>
                Delete
              </button>
              <button type="button" className="mini" disabled={!p.canUndo} onClick={p.onUndo}>
                Undo
              </button>
              <button type="button" className="mini" disabled={!p.hasDecos} onClick={p.onClear}>
                Clear
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
