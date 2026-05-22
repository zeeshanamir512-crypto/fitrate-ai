import type { CSSProperties } from "react";

const ANALYSIS_ROWS = [
  { label: "Color harmony", pct: 92, barWidthClass: "w-[92%]" },
  { label: "Fit & silhouette", pct: 88, barWidthClass: "w-[88%]" },
  { label: "Trend match", pct: 95, barWidthClass: "w-[95%]" },
  { label: "Occasion match", pct: 86, barWidthClass: "w-[86%]" }
] as const;

const PARTICLES = [
  { left: "12%", top: "18%" },
  { left: "78%", top: "22%" },
  { left: "44%", top: "42%" },
  { left: "88%", top: "58%" },
  { left: "18%", top: "72%" },
  { left: "62%", top: "84%" }
] as const;

export function LiveAnalysisPreview() {
  return (
    <div className="fitrate-live-preview-root relative w-full">
      <div className="fitrate-live-preview-hover relative w-full">
        <div
          className="fitrate-live-preview-glow-ring relative w-full rounded-2xl bg-gradient-to-br from-indigo-400/75 via-violet-500/65 to-cyan-400/60 p-px"
          aria-label="Live AI analysis preview"
        >
          <div className="relative overflow-hidden rounded-[15px] border border-white/20 bg-slate-950/55 px-3.5 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09)] backdrop-blur-xl ring-1 ring-white/[0.1] sm:px-4 sm:py-4">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_90%_at_50%_-28%,rgba(99,102,241,0.22),transparent_52%),radial-gradient(ellipse_72%_62%_at_100%_100%,rgba(34,211,238,0.11),transparent_48%)]"
              aria-hidden
            />

            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
              {PARTICLES.map((p, i) => (
                <span
                  key={`${p.left}-${p.top}`}
                  className="fitrate-live-preview-particle absolute h-0.5 w-0.5 rounded-full bg-indigo-200/50 blur-[0.5px]"
                  style={
                    {
                      left: p.left,
                      top: p.top,
                      "--fitrate-particle-delay": `${i * 0.25}s`,
                      "--fitrate-particle-dur": `${5.5 + i * 0.35}s`
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            <div className="relative flex flex-col gap-3.5 sm:gap-4">
              <div className="flex items-start justify-between gap-2 border-b border-white/[0.12] pb-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-indigo-200 sm:text-[10px]">
                    Live AI analysis
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold tracking-tight text-white sm:text-[13px]">
                    Preview
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/[0.16] px-2 py-1 text-[10px] font-semibold text-emerald-50 shadow-[0_0_18px_-5px_rgba(52,211,153,0.6)] backdrop-blur-sm">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
                    aria-hidden
                  />
                  Live
                </div>
              </div>

              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Overall rating</p>
                <div className="mt-1 flex flex-wrap items-end gap-1 tabular-nums">
                  <span className="bg-gradient-to-br from-white via-indigo-50 to-cyan-100 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-[2.35rem]">
                    9.1
                  </span>
                  <span className="pb-0.5 text-sm font-semibold text-slate-400 sm:text-base">/10</span>
                </div>
              </div>

              <ul className="space-y-2.5">
                {ANALYSIS_ROWS.map((row, i) => (
                  <li key={row.label}>
                    <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                      <span className="min-w-0 truncate text-slate-300">{row.label}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-slate-100">{row.pct}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-950/90 shadow-inner shadow-black/50 ring-1 ring-white/[0.1]">
                      <div
                        className={`fitrate-live-preview-bar h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 ${row.barWidthClass}`}
                        style={
                          {
                            ["--fitrate-bar-delay"]: `${0.2 + i * 0.07}s`
                          } as CSSProperties
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-white/[0.14] bg-gradient-to-br from-indigo-500/[0.2] via-slate-950/45 to-cyan-500/[0.14] p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_0_28px_-12px_rgba(99,102,241,0.35)] backdrop-blur-md ring-1 ring-indigo-400/35 sm:p-3.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-indigo-100 sm:text-[10px]">AI tip</p>
                <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-slate-200 sm:text-xs">
                  Try a silver accessory or a sharper sneaker shape to make the fit stand out more.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
