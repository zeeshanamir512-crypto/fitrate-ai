"use client";

import { useState } from "react";
import { prepareImageFile, readFileAsDataUrl, retainFile } from "@/lib/prepareImageFile";
import { makeThumbnail } from "@/lib/fitHistory";
import { readApiJson } from "@/lib/readApiJson";
import type { OccasionMode } from "@/lib/occasions";
import type { AnalysisResult } from "@/types/analysis";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

type Phase = "idle" | "preparing" | "ready" | "analyzing" | "saving" | "joining";

type Props = {
  battleId: string;
  /** Called when the battle slot is filled (by us, or by someone who beat us to it). */
  onJoined: () => void;
};

/**
 * The challenger's whole flow, hosted directly on the battle page: pick a
 * photo → /api/analyze → /api/save-result → /api/battle/[id]/join. Image
 * handling reuses the same lib pipeline as the homepage (prepareImageFile,
 * makeThumbnail); only the fetch orchestration lives here. The occasion is
 * auto-detected by the analyze call to keep join friction at zero.
 */
export default function JoinBattlePanel({ battleId, onJoined }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = phase === "analyzing" || phase === "saving" || phase === "joining";

  async function ingestFile(raw: File, input?: HTMLInputElement) {
    setPhase("preparing");
    setError(null);
    try {
      const retained = await retainFile(raw);
      const preview = await readFileAsDataUrl(retained);
      setPreviewUrl(preview);

      const prepared = await prepareImageFile(retained);
      if (prepared.size > MAX_FILE_BYTES) {
        setPreviewUrl(null);
        setFile(null);
        setPhase("idle");
        setError(`Image is too large (${Math.round(prepared.size / 1024 / 1024)} MB). Try another photo.`);
        return;
      }
      setFile(prepared);
      setPhase("ready");
    } catch {
      setPreviewUrl(null);
      setFile(null);
      setPhase("idle");
      setError("Could not load this photo. Try JPG/PNG, or on iPhone: Settings → Camera → Formats → Most Compatible.");
    } finally {
      if (input) input.value = "";
    }
  }

  async function handleJoin() {
    if (!file || busy) return;
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 95_000);

    try {
      setPhase("analyzing");
      const formData = new FormData();
      formData.set("file", file);
      formData.set("occasion", "Casual");
      formData.set("brutalMode", "0");
      formData.set("autoDetectOccasion", "1");

      const analyzeRes = await fetch("/api/analyze", { method: "POST", body: formData, signal: controller.signal });
      const analyzed = await readApiJson<{
        error?: string;
        message?: string;
        result?: AnalysisResult;
        detectedOccasion?: OccasionMode | null;
        token?: string;
      }>(analyzeRes);
      if (!analyzed.ok) throw new Error(analyzed.message);
      if (!analyzeRes.ok || !analyzed.data.result) {
        throw new Error(
          analyzed.data.error === "no_outfit"
            ? analyzed.data.message ?? "No outfit detected. Upload a photo of someone wearing clothes."
            : analyzed.data.error ?? "Analysis failed. Please try again."
        );
      }

      setPhase("saving");
      const thumbnailUrl = previewUrl ? (await makeThumbnail(previewUrl)) ?? undefined : undefined;
      const occasion = analyzed.data.detectedOccasion ?? "Casual";
      const saveRes = await fetch("/api/save-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: analyzed.data.result,
          occasion,
          token: analyzed.data.token,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        }),
      });
      const saved = await readApiJson<{ id?: string; error?: string }>(saveRes);
      if (!saved.ok) throw new Error(saved.message);
      if (!saveRes.ok || !saved.data.id) throw new Error(saved.data.error ?? "Could not save your result. Please try again.");

      setPhase("joining");
      const joinRes = await fetch(`/api/battle/${battleId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId: saved.data.id }),
      });
      // 409 = someone else filled the slot first; refreshing shows the now-active
      // battle either way, which beats surfacing an error the user can't act on.
      if (joinRes.ok || joinRes.status === 409) {
        onJoined();
        return;
      }
      const joined = await readApiJson<{ error?: string }>(joinRes);
      throw new Error(joined.ok ? joined.data.error ?? "Could not join this battle." : joined.message);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Analysis timed out. Try a smaller image or retry in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
      setPhase(file ? "ready" : "idle");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const busyLabel =
    phase === "analyzing" ? "Analyzing your fit…" : phase === "saving" ? "Saving your result…" : "Entering the battle…";

  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl border border-dashed border-violet-400/30 bg-slate-950/80 backdrop-blur-xl transition hover:border-violet-400/50">
      {/* Card top glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(139,92,246,0.16) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col p-5 sm:p-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">Outfit B</p>

        {phase === "idle" || phase === "preparing" ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void ingestFile(dropped);
            }}
            className={`flex flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center rounded-2xl border border-dashed bg-gradient-to-br from-violet-500/[0.1] via-slate-950/20 to-indigo-500/[0.07] px-4 py-12 text-center transition ${
              dragOver ? "border-violet-400/70 bg-violet-500/10" : "border-violet-400/25 hover:border-violet-400/50"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void ingestFile(picked, e.target);
              }}
            />
            {phase === "preparing" ? (
              <span className="inline-flex items-center gap-2 text-sm text-violet-200">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200" />
                Preparing photo…
              </span>
            ) : (
              <>
                <span className="mb-3 text-3xl" aria-hidden>
                  ⚔
                </span>
                <p className="text-sm font-bold text-white">Upload your fit to join this battle</p>
                <p className="mt-2 text-xs text-slate-400">
                  Tap or drop a photo — the same AI scores you, then the crowd votes.
                </p>
              </>
            )}
          </label>
        ) : (
          <>
            {previewUrl && (
              <div className="mb-4 overflow-hidden rounded-2xl">
                <img src={previewUrl} alt="Your outfit" className="h-52 w-full object-cover object-top" />
              </div>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={handleJoin}
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_36px_-10px_rgba(139,92,246,0.55)] ring-1 ring-violet-400/30 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {busyLabel}
                </span>
              ) : (
                "⚔ Join this battle"
              )}
            </button>

            {!busy && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  setPhase("idle");
                  setError(null);
                }}
                className="mt-2 text-center text-xs text-slate-500 transition hover:text-slate-300"
              >
                Choose a different photo
              </button>
            )}
          </>
        )}

        {error && <p className="mt-3 text-center text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
