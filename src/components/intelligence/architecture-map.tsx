"use client";

import { useRef, useState } from "react";
import { Download, ExternalLink, Minus, Plus, RotateCcw, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panel } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";
import type { ArchitectureNode } from "@/lib/intelligence/architecture";

type Node = ArchitectureNode & { links: { path: string; url: string }[] };
export function ArchitectureMap({ name, nodes }: { name: string; nodes: Node[] }) {
  const [selection, choose] = useState(nodes[0]?.id);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const activeDrag = useRef<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const selected = nodes.find((node) => node.id === selection);
  const height = 140 + Math.ceil(nodes.length / 3) * 95;
  function download() {
    if (!svg.current) return;
    const copy = svg.current.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "900");
    copy.setAttribute("height", String(height));
    copy.querySelector("g[data-pan]")?.removeAttribute("transform");
    const href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
    const link = document.createElement("a"); link.href = href; link.download = "repolens-architecture.svg"; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(230px,0.44fr)]">
    <section className={cn(panel, "min-w-0 overflow-hidden")} aria-label="Repository architecture diagram">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Waypoints className="size-4 text-accent-hover" /> Repository structure</p>
        <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="Zoom out" disabled={zoom <= .65} onClick={() => setZoom((value) => Math.max(.65, value - .2))}><Minus /></Button><span className="text-xs text-text-muted">{Math.round(zoom * 100)}%</span><Button size="icon" variant="ghost" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + .2))}><Plus /></Button><Button size="icon" variant="ghost" aria-label="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw /></Button><Button size="sm" variant="outline" onClick={download}><Download /> SVG</Button></div>
      </div>
      <svg ref={svg} viewBox={`0 0 900 ${height}`} className="block min-h-52 w-full touch-none select-none bg-background/80" role="group" aria-label="Select a detected category. Drag the background to pan." onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId); activeDrag.current = { x: event.clientX, y: event.clientY };
      }} onPointerMove={(event) => {
        const old = activeDrag.current; if (!old || !svg.current) return;
        const factor = 900 / svg.current.clientWidth;
        const x = (event.clientX - old.x) * factor, y = (event.clientY - old.y) * factor;
        activeDrag.current = { x: event.clientX, y: event.clientY };
        setPan((origin) => ({ x: origin.x + x, y: origin.y + y }));
      }} onPointerUp={() => { activeDrag.current = null; }} onPointerCancel={() => { activeDrag.current = null; }}>
        <g data-pan="" transform={`translate(${pan.x} ${pan.y}) translate(450 60) scale(${zoom}) translate(-450 -60)`} fontFamily="system-ui, sans-serif">
          {nodes.map((node, i) => { const x = 60 + i % 3 * 280, y = 120 + Math.floor(i / 3) * 95; return <path key={node.id} d={`M450 83 C450 ${100 + Math.floor(i / 3) * 95} ${x + 110} ${y - 15} ${x + 110} ${y}`} stroke="#7473af" strokeWidth="2" fill="none" opacity=".65" />; })}
          <rect x="315" y="28" rx="12" width="270" height="55" fill="#272348" stroke="#8e83fb" />
          <text x="450" y="62" textAnchor="middle" fill="#f2efff" fontSize="17" fontWeight="600">{name.length > 28 ? `${name.slice(0, 27)}…` : name}</text>
          {nodes.map((node, i) => { const x = 60 + i % 3 * 280, y = 120 + Math.floor(i / 3) * 95; return <g key={node.id} role="button" tabIndex={0} aria-label={node.label} aria-pressed={selection === node.id} onClick={() => choose(node.id)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); choose(node.id); } }} className="cursor-pointer">
            <rect x={x} y={y} rx="10" width="220" height="61" fill={selection === node.id ? "#3b306e" : "#202136"} stroke={selection === node.id ? "#a89cff" : "#57577a"} />
            <text x={x + 110} y={y + 25} textAnchor="middle" fill="#f0effb" fontSize="15" fontWeight="600">{node.label}</text><text x={x + 110} y={y + 46} textAnchor="middle" fill="#bdbbd9" fontSize="12">{node.count} matched paths</text>
          </g>; })}
        </g>
      </svg>
      <p className="border-t border-border-subtle p-3 text-xs text-text-muted">Connections show grouping by file evidence, not observed runtime calls or data flow.</p>
    </section>
    <section className={cn(panel, "min-w-0 p-4")} aria-label="Architecture evidence">
      <label className="block text-xs font-medium text-text-muted">Explore component<select value={selection} onChange={(e) => choose(e.target.value)} className="mt-2 block min-h-9 w-full rounded-md border border-border bg-surface-elevated px-2 text-sm text-text-primary">{nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
      {selected && <><p className="my-3 text-sm leading-relaxed text-text-secondary">{selected.description}</p><ul className="space-y-2">{selected.links.map((item) => <li key={item.path}><a href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 break-all font-mono text-xs text-accent-hover hover:underline"><ExternalLink className="mt-0.5 size-3.5 shrink-0" />{item.path}</a></li>)}</ul></>}
    </section>
  </div>;
}
