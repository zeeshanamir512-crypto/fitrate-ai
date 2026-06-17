"use client";

import { toPng } from "html-to-image";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AnalyzingOverlay } from "@/components/AnalyzingOverlay";
import { AnimatedScoreBars } from "@/components/AnimatedScoreBars";
import { AnimatedScoreReveal } from "@/components/AnimatedScoreReveal";
import { BrutalModeToggle } from "@/components/BrutalModeToggle";
import { FashionBadges } from "@/components/FashionBadges";
import { LiveAnalysisPreview } from "@/components/LiveAnalysisPreview";
import { OccasionSelect, type OccasionMode } from "@/components/OccasionSelect";
import { ShareableResultCard } from "@/components/ShareableResultCard";
import { inferFashionBadges, sanitizeFashionBadges, type FashionBadgeId } from "@/lib/fashionBadges";
import { addToFitHistory, loadFitHistory, makeThumbnail, saveFitHistory, type FitHistoryEntry } from "@/lib/fitHistory";
import { prepareImageFile, readFileAsDataUrl, retainFile } from "@/lib/prepareImageFile";
import { readApiJson } from "@/lib/readApiJson";
import { RecentFits } from "@/components/RecentFits";
import { StreakBadge } from "@/components/StreakBadge";
import { getStreak, updateStreak } from "@/lib/streak";
import type { AnalysisResult, Difficulty } from "@/types/analysis";
type AppMode = "single" | "compare";

type CompareOutfitsResult = {
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "Tie";
  closeness: "Clear win" | "Close win" | "Tie";
  winnerReason: string;
  outfitAFeedback: string;
  outfitBFeedback: string;
  weakerOutfitTips: string[];
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const BRUTAL_MODE_STORAGE_KEY = "fitrate-brutal-mode";

const ATMOS_SPARKS = [
  { t: "9%", l: "11%", dur: "12s", del: "0s" },
  { t: "17%", l: "76%", dur: "14s", del: "1.2s" },
  { t: "34%", l: "23%", dur: "11s", del: "2.1s" },
  { t: "41%", l: "89%", dur: "13s", del: "0.4s" },
  { t: "56%", l: "7%", dur: "15s", del: "3.2s" },
  { t: "61%", l: "51%", dur: "10s", del: "1.6s" },
  { t: "71%", l: "93%", dur: "12s", del: "2.7s" },
  { t: "86%", l: "36%", dur: "13s", del: "0.9s" },
  { t: "22%", l: "58%", dur: "16s", del: "4s" },
  { t: "48%", l: "69%", dur: "11s", del: "2.4s" },
  { t: "13%", l: "44%", dur: "14s", del: "3.6s" },
  { t: "77%", l: "19%", dur: "12s", del: "1.5s" },
  { t: "92%", l: "82%", dur: "13s", del: "5s" },
  { t: "63%", l: "31%", dur: "15s", del: "2s" }
] as const;

function formatCompareScore(score: number): string {
  const rounded = Math.min(10, Math.max(1, Math.round(score * 2) / 2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compareWinnerDisplayLabel(winner: CompareOutfitsResult["winner"]): string {
  if (winner === "Tie") return "It’s a tie";
  return winner === "A" ? "Outfit A" : "Outfit B";
}

/** Share-card safe truncation (matches single-card vibe). */
function shortenCompareText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}\u2026`;
}

function buildCompareSummary(feedback: string, maxChars: number): string {
  return shortenCompareText(feedback, maxChars);
}

function buildImproveTip(tips: string[], maxChars: number): string {
  const first = tips.find((t) => t.trim().length > 0)?.trim();
  if (!first) return "—";
  return shortenCompareText(first, maxChars);
}

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>("single");
  const [occasionMode, setOccasionMode] = useState<OccasionMode>("Casual");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);

  const [previewUrlA, setPreviewUrlA] = useState<string | null>(null);
  const [previewUrlB, setPreviewUrlB] = useState<string | null>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareOutfitsResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [brutalMode, setBrutalMode] = useState(false);
  const [resultRevealKey, setResultRevealKey] = useState(0);
  const [fitHistory, setFitHistory] = useState<FitHistoryEntry[]>([]);
  const [shareCardExportLoading, setShareCardExportLoading] = useState(false);
  const [shareCardExportError, setShareCardExportError] = useState<string | null>(null);
  const [battleLoading, setBattleLoading] = useState(false);

  const [compareShareCardPreviewVisible, setCompareShareCardPreviewVisible] = useState(false);
  const [compareShareCardExportLoading, setCompareShareCardExportLoading] = useState(false);
  const [compareShareCardExportError, setCompareShareCardExportError] = useState<string | null>(null);

  const previewBlobRef = useRef<string | null>(null);
  const compareBlobARef = useRef<string | null>(null);
  const compareBlobBRef = useRef<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const compareShareCardRef = useRef<HTMLDivElement | null>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const compareResultSectionRef = useRef<HTMLElement | null>(null);

  const [singleDragOver, setSingleDragOver] = useState(false);
  const [compareDragA, setCompareDragA] = useState(false);
  const [compareDragB, setCompareDragB] = useState(false);

  const [streak, setStreak] = useState(0);
  const [streakJustIncreased, setStreakJustIncreased] = useState(false);

  const [aiDetectedOccasion, setAiDetectedOccasion] = useState<OccasionMode | null>(null);
  const [isDetectingOccasion, setIsDetectingOccasion] = useState(false);

  const scoreRingGradientId = useId().replace(/:/g, "");

  const canAnalyze = useMemo(() => Boolean(selectedFile) && !isAnalyzing, [selectedFile, isAnalyzing]);
  const canCompare = useMemo(() => Boolean(fileA && fileB) && !isComparing, [fileA, fileB, isComparing]);

  const displayBadges = useMemo((): FashionBadgeId[] => {
    if (!result) return [];
    const fromApi = sanitizeFashionBadges(result.fashionBadges);
    return fromApi.length > 0 ? fromApi : inferFashionBadges(result);
  }, [result]);

  useEffect(() => {
    return () => {
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
      if (compareBlobARef.current) URL.revokeObjectURL(compareBlobARef.current);
      if (compareBlobBRef.current) URL.revokeObjectURL(compareBlobBRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BRUTAL_MODE_STORAGE_KEY);
    if (stored === "1") setBrutalMode(true);
    setFitHistory(loadFitHistory());
    setStreak(getStreak());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BRUTAL_MODE_STORAGE_KEY, brutalMode ? "1" : "0");
  }, [brutalMode]);

  useEffect(() => {
    setShareCardExportError(null);
    setShareCardExportLoading(false);
  }, [result]);

  useEffect(() => {
    setCompareShareCardPreviewVisible(false);
    setCompareShareCardExportError(null);
    setCompareShareCardExportLoading(false);
  }, [compareResult]);

  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [result]);

  useEffect(() => {
    if (!compareResult) return;
    const id = window.setTimeout(() => {
      compareResultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [compareResult]);

  useEffect(() => {
    if (!selectedFile) {
      setAiDetectedOccasion(null);
      setIsDetectingOccasion(false);
      return;
    }

    let cancelled = false;
    setAiDetectedOccasion(null);
    setIsDetectingOccasion(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("file", selectedFile);
        const response = await fetch("/api/detect-occasion", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        if (cancelled || !response.ok) return;
        const data = (await response.json()) as { occasion?: string };
        if (cancelled) return;
        const detected = data.occasion as OccasionMode | undefined;
        if (detected) {
          setOccasionMode(detected);
          setAiDetectedOccasion(detected);
        }
      } catch {
        // silently fall back — keep current selection
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setIsDetectingOccasion(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      setIsDetectingOccasion(false);
    };
  }, [selectedFile]);

  // Small helper: clean up previous blob preview when user picks another file.
  function clearPreviewBlob() {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
  }

  function handleOccasionChange(val: OccasionMode) {
    setOccasionMode(val);
    setAiDetectedOccasion(null);
  }

  function switchAppMode(next: AppMode) {
    setAppMode(next);
    setErrorMessage(null);
    setCompareError(null);

    if (next === "compare") {
      setResult(null);
      setShareCardExportError(null);
      setCompareShareCardPreviewVisible(false);
      setCompareShareCardExportError(null);
      clearPreviewBlob();
      setPreviewUrl(null);
      setSelectedFile(null);
    } else {
      clearCompareBlobA();
      clearCompareBlobB();
      setCompareResult(null);
      setCompareShareCardPreviewVisible(false);
      setCompareShareCardExportError(null);
      setPreviewUrlA(null);
      setPreviewUrlB(null);
      setFileA(null);
      setFileB(null);
    }
  }

  function clearCompareBlobA() {
    if (compareBlobARef.current) {
      URL.revokeObjectURL(compareBlobARef.current);
      compareBlobARef.current = null;
    }
  }

  function clearCompareBlobB() {
    if (compareBlobBRef.current) {
      URL.revokeObjectURL(compareBlobBRef.current);
      compareBlobBRef.current = null;
    }
  }

  function handleCompareImageA(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleCompareFilePick(file, "A", event.target);
  }

  function handleCompareImageB(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleCompareFilePick(file, "B", event.target);
  }

  async function handleCompareFilePick(file: File, side: "A" | "B", input?: HTMLInputElement) {
    setIsPreparingImage(true);
    setCompareError(null);
    setCompareResult(null);

    try {
      const retained = await retainFile(file);
      const previewDataUrl = await readFileAsDataUrl(retained);

      if (side === "A") {
        clearCompareBlobA();
        setPreviewUrlA(previewDataUrl);
      } else {
        clearCompareBlobB();
        setPreviewUrlB(previewDataUrl);
      }

      const prepared = await prepareImageFile(retained);
      if (prepared.size > MAX_FILE_BYTES) {
        if (side === "A") {
          setPreviewUrlA(null);
          setFileA(null);
        } else {
          setPreviewUrlB(null);
          setFileB(null);
        }
        setCompareError(`Photo ${side} is too large (${Math.round(prepared.size / 1024 / 1024)} MB). Try another photo.`);
        return;
      }

      if (side === "A") setFileA(prepared);
      else setFileB(prepared);
    } catch {
      if (side === "A") {
        clearCompareBlobA();
        setPreviewUrlA(null);
        setFileA(null);
      } else {
        clearCompareBlobB();
        setPreviewUrlB(null);
        setFileB(null);
      }
      setCompareError(
        `Could not load photo ${side}. Try JPG/PNG, or on iPhone: Settings → Camera → Formats → Most Compatible.`
      );
    } finally {
      setIsPreparingImage(false);
      if (input) input.value = "";
    }
  }

  async function ingestSingleFile(file: File, input?: HTMLInputElement) {
    setIsPreparingImage(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const retained = await retainFile(file);
      const previewDataUrl = await readFileAsDataUrl(retained);
      clearPreviewBlob();
      setPreviewUrl(previewDataUrl);

      const prepared = await prepareImageFile(retained);
      if (prepared.size > MAX_FILE_BYTES) {
        setPreviewUrl(null);
        setSelectedFile(null);
        setErrorMessage(`Image is too large (${Math.round(prepared.size / 1024 / 1024)} MB). Try another photo.`);
        return;
      }

      setSelectedFile(prepared);
    } catch {
      clearPreviewBlob();
      setPreviewUrl(null);
      setSelectedFile(null);
      setErrorMessage(
        "Could not load this photo. Try JPG/PNG, or on iPhone: Settings → Camera → Formats → Most Compatible."
      );
    } finally {
      setIsPreparingImage(false);
      if (input) input.value = "";
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void ingestSingleFile(file, event.target);
  }

  function handleSingleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setSingleDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void ingestSingleFile(file);
  }

  function handleCompareDrop(event: React.DragEvent<HTMLLabelElement>, side: "A" | "B") {
    event.preventDefault();
    if (side === "A") setCompareDragA(false);
    else setCompareDragB(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleCompareFilePick(file, side);
  }

  async function handleAnalyzeOutfit() {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setResult(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 95_000);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("occasion", occasionMode);
      formData.set("brutalMode", brutalMode ? "1" : "0");

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      const parsed = await readApiJson<{ error?: string; message?: string; result?: AnalysisResult }>(response);
      if (!parsed.ok) {
        setErrorMessage(parsed.message);
        return;
      }
      const data = parsed.data;

      if (!response.ok) {
        if (data.error === "no_outfit") {
          setErrorMessage(`❌ ${data.message ?? "No outfit detected. Please upload a photo of yourself or someone wearing clothes."}`);
        } else {
          setErrorMessage(data.error ?? "Something went wrong during analysis.");
        }
        return;
      }

      if (!data.result) {
        setErrorMessage("Missing analysis result from server.");
        return;
      }

      setResult(data.result);
      setResultRevealKey((k) => k + 1);

      const { count, increased } = updateStreak();
      setStreak(count);
      if (increased) {
        setStreakJustIncreased(true);
        setTimeout(() => setStreakJustIncreased(false), 2500);
      }

      // Save to history (async, non-blocking)
      void (async () => {
        const thumb = previewUrl ? await makeThumbnail(previewUrl) : null;
        const sanitizedBadges = sanitizeFashionBadges(data.result!.fashionBadges);
        const updated = addToFitHistory(loadFitHistory(), {
          score: data.result!.overallRating,
          occasion: occasionMode,
          badges: sanitizedBadges.length > 0 ? sanitizedBadges : inferFashionBadges(data.result!).slice(0, 2),
          styleIdentity: data.result!.styleIdentity,
          thumbnail: thumb,
        });
        saveFitHistory(updated);
        setFitHistory(updated);
      })();
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("Analysis timed out. Try a smaller image or retry in a moment.");
      } else {
        setErrorMessage("Failed to analyze image. Please check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  }

  async function handleCompareOutfits() {
    if (!fileA || !fileB) return;

    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);

    try {
      const formData = new FormData();
      formData.set("fileA", fileA);
      formData.set("fileB", fileB);
      formData.set("occasion", occasionMode);

      const response = await fetch("/api/compare", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      const parsed = await readApiJson<{ error?: string; message?: string; compare?: CompareOutfitsResult }>(response);
      if (!parsed.ok) {
        setCompareError(parsed.message);
        return;
      }
      const data = parsed.data;

      if (!response.ok) {
        if (data.error === "no_outfit") {
          setCompareError(`❌ ${data.message ?? "No outfit detected. Please upload a photo of yourself or someone wearing clothes."}`);
        } else {
          setCompareError(data.error ?? "Comparison failed.");
        }
        return;
      }
      if (!data.compare) {
        setCompareError("Missing comparison result from server.");
        return;
      }
      setCompareResult(data.compare);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setCompareError("Comparison timed out. Try smaller images or retry shortly.");
      } else {
        setCompareError("Failed to compare outfits. Check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsComparing(false);
    }
  }

  async function handleDownloadShareCard() {
    const node = shareCardRef.current;
    if (!node || typeof window === "undefined") return;

    setShareCardExportLoading(true);
    setShareCardExportError(null);

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#020617"
      });

      const link = document.createElement("a");
      link.download = "fitrate-ai-outfit-rating.png";
      link.href = dataUrl;
      link.click();
    } catch {
      setShareCardExportError("Could not create the image. Try again or use a different browser.");
    } finally {
      setShareCardExportLoading(false);
    }
  }

  async function handleStartBattle() {
    if (!result || battleLoading) return;
    setBattleLoading(true);
    try {
      let thumbnailUrl: string | undefined;
      if (previewUrl) {
        thumbnailUrl = (await makeThumbnail(previewUrl)) ?? undefined;
      }
      const res = await fetch("/api/save-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, occasion: occasionMode, ...(thumbnailUrl ? { thumbnailUrl } : {}) }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (res.ok && data.id) {
        window.location.href = `/battle/new?a=${data.id}`;
      }
    } catch {
      // silently fail — button just stops loading
    } finally {
      setBattleLoading(false);
    }
  }

  async function handleDownloadCompareShareCard() {
    const node = compareShareCardRef.current;
    if (!node || typeof window === "undefined") return;

    setCompareShareCardExportLoading(true);
    setCompareShareCardExportError(null);

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#020617"
      });

      const link = document.createElement("a");
      link.download = "fitrate-ai-compare-card.png";
      link.href = dataUrl;
      link.click();
    } catch {
      setCompareShareCardExportError("Could not create the image. Try again or use a different browser.");
    } finally {
      setCompareShareCardExportLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#030712] px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-24 sm:pt-6">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_110%_78%_at_50%_-16%,rgba(99,102,241,0.34),transparent_58%),radial-gradient(ellipse_56%_46%_at_100%_2%,rgba(139,92,246,0.24),transparent_52%),radial-gradient(ellipse_52%_42%_at_0%_94%,rgba(34,211,238,0.18),transparent_50%),radial-gradient(ellipse_40%_36%_at_72%_72%,rgba(167,139,250,0.08),transparent_55%)]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 -z-10 fitrate-mesh opacity-[0.92]" aria-hidden />
      <div
        className="fitrate-blob-a pointer-events-none fixed -right-28 top-0 -z-10 h-[min(420px,55vw)] w-[min(420px,90vw)] rounded-full bg-indigo-600/32 blur-[110px]"
        aria-hidden
      />
      <div
        className="fitrate-blob-b pointer-events-none fixed -left-24 bottom-10 -z-10 h-[360px] w-[360px] rounded-full bg-cyan-500/[0.24] blur-[95px]"
        aria-hidden
      />
      <div
        className="fitrate-blob-c pointer-events-none fixed left-[28%] top-[42%] -z-10 h-[280px] w-[280px] rounded-full bg-violet-600/[0.2] blur-[85px]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 -z-10 fitrate-page-texture fitrate-noise opacity-[0.62]" aria-hidden />

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="fitrate-atmos-aurora absolute -left-[28%] top-[6%] h-[min(560px,72vh)] w-[min(920px,92vw)] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.26)_0%,transparent_70%)] blur-[100px]" />
        <div className="fitrate-atmos-aurora fitrate-atmos-aurora-delay absolute -right-[22%] bottom-[10%] h-[min(460px,58vh)] w-[min(760px,88vw)] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.16)_0%,transparent_68%)] blur-[88px]" />
        {ATMOS_SPARKS.map((s, i) => (
          <span
            key={`${s.t}-${s.l}-${i}`}
            className="fitrate-atmos-spark"
            style={
              {
                top: s.t,
                left: s.l,
                ["--atmos-dur"]: s.dur,
                ["--atmos-del"]: s.del
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <nav className="sticky top-0 z-[70] mx-auto mb-5 flex max-w-6xl justify-center px-1 sm:top-4 sm:mb-6">
        <div className="flex w-full min-w-0 max-w-5xl items-center justify-between gap-2 rounded-2xl border border-white/[0.1] bg-slate-950/70 px-2.5 py-2 shadow-[0_20px_60px_-18px_rgba(79,70,229,0.45)] backdrop-blur-2xl ring-1 ring-indigo-400/20 sm:gap-3 sm:rounded-full sm:px-5 sm:py-2">
          <a
            href="#"
            className="shrink-0 bg-gradient-to-r from-white via-indigo-100 to-violet-300 bg-clip-text text-sm font-bold tracking-tight text-transparent sm:text-base"
          >
            FitRate AI
          </a>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto text-[11px] font-medium text-slate-400 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] sm:gap-4 sm:overflow-visible sm:text-xs [&::-webkit-scrollbar]:hidden">
            <StreakBadge streak={streak} justIncreased={streakJustIncreased} />
            <a href="#features" className="fitrate-nav-link shrink-0 rounded-full transition hover:bg-white/[0.06] hover:text-white">
              Features
            </a>
            <a href="#app-panel" className="fitrate-nav-link shrink-0 rounded-full transition hover:bg-white/[0.06] hover:text-white">
              Studio
            </a>
            <a href="#compare-results" className="fitrate-nav-link shrink-0 rounded-full transition hover:bg-white/[0.06] hover:text-white">
              Compare
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full px-2 py-1 transition hover:bg-white/[0.06] hover:text-white sm:inline"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      <div className="relative mx-auto max-w-6xl scroll-mt-28">
        <div className="relative mb-10 lg:mb-14 lg:grid lg:grid-cols-[1fr,minmax(260px,300px)] lg:items-center lg:gap-10">
          <header className="animate-fade-in relative text-center lg:text-left">
            <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-3xl opacity-45 lg:opacity-100">
              <span className="fitrate-hero-dot absolute left-[8%] top-[12%] h-1 w-1 rounded-full bg-indigo-300 blur-[1px]" style={{ animationDelay: "0s" }} />
              <span className="fitrate-hero-dot absolute left-[22%] top-[55%] h-1.5 w-1.5 rounded-full bg-cyan-300/90 blur-[1px]" style={{ animationDelay: "0.4s" }} />
              <span className="fitrate-hero-dot absolute right-[18%] top-[20%] h-1 w-1 rounded-full bg-violet-300 blur-[1px]" style={{ animationDelay: "0.8s" }} />
              <span className="fitrate-hero-dot absolute right-[10%] top-[60%] h-1 w-1 rounded-full bg-indigo-200/80 blur-[1px]" style={{ animationDelay: "1.2s" }} />
              <span className="fitrate-hero-dot absolute left-[46%] top-[28%] h-1 w-1 rounded-full bg-cyan-200/70 blur-[1px]" style={{ animationDelay: "1.6s" }} />
              <span className="fitrate-hero-dot absolute left-[12%] top-[78%] h-[3px] w-[3px] rounded-full bg-violet-200/70 blur-[1px]" style={{ animationDelay: "2s" }} />
            </div>
            <p className="relative mx-auto mb-3 max-w-xl text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-400/80 sm:text-[11px] sm:tracking-[0.32em] lg:mx-0">
              Neural style engine
            </p>
            <div className="relative mx-auto inline-block lg:mx-0">
              <div
                className="fitrate-hero-title-glow pointer-events-none absolute -inset-16 rounded-full bg-gradient-to-r from-indigo-600/48 via-violet-500/38 to-cyan-400/28 blur-3xl"
                aria-hidden
              />
              <h1 className="fitrate-hero-headline relative break-words text-[clamp(2.25rem,10vw,3rem)] font-bold tracking-[-0.04em] sm:text-6xl sm:tracking-[-0.045em] md:text-7xl md:tracking-[-0.05em]">
                <span className="bg-gradient-to-br from-white via-indigo-50 to-slate-400 bg-clip-text text-transparent">FitRate </span>
                <span className="fitrate-title-shine bg-gradient-to-br from-indigo-200 via-white to-cyan-200 bg-clip-text text-transparent">AI</span>
              </h1>
            </div>
            <p className="relative mx-auto mt-5 max-w-xl text-balance text-[15px] font-medium leading-relaxed text-slate-300 sm:text-lg lg:mx-0">
              Upload your outfit. Get rated by AI. Improve your style instantly.
            </p>
            <p className="relative mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500 lg:mx-0">
              Analyze fits, compare outfits, and share your rating card.
            </p>
            <div className="relative mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/35 bg-gradient-to-r from-indigo-500/15 to-violet-500/10 px-3.5 py-1.5 text-[11px] font-medium text-indigo-100 shadow-[0_0_28px_-4px_rgba(99,102,241,0.55)] backdrop-blur-md animate-pulse-glow-badge lg:mx-0">
              <span aria-hidden className="text-indigo-300">
                ✦
              </span>
              AI Stylist powered
            </div>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3 lg:justify-start">
              <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-medium text-indigo-200/95 shadow-md shadow-indigo-950/30 backdrop-blur-sm transition hover:border-indigo-400/45 hover:bg-indigo-500/15">
                AI Stylist
              </span>
              <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium text-violet-200/95 shadow-md shadow-violet-950/25 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-violet-500/15">
                Outfit Compare
              </span>
              <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-medium text-cyan-200/95 shadow-md shadow-cyan-950/20 backdrop-blur-sm transition hover:border-cyan-400/45 hover:bg-cyan-500/15">
                Share Cards
              </span>
            </div>

            <div className="pointer-events-none absolute -right-4 top-1/4 hidden xl:block">
              <span className="fitrate-float-badge inline-flex rounded-full border border-indigo-400/30 bg-slate-950/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-200 shadow-lg shadow-indigo-950/40" style={{ animationDelay: "0.2s" }}>
                8.5/10 Streetwear
              </span>
            </div>
            <div className="pointer-events-none absolute -left-8 top-[58%] hidden xl:block">
              <span className="fitrate-float-badge inline-flex rounded-full border border-amber-400/35 bg-slate-950/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100 shadow-lg shadow-amber-950/30" style={{ animationDelay: "0.7s" }}>
                Winner Fit
              </span>
            </div>
            <div className="pointer-events-none absolute right-[12%] top-[8%] hidden 2xl:block">
              <span className="fitrate-float-badge inline-flex rounded-full border border-cyan-400/30 bg-slate-950/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100 shadow-lg" style={{ animationDelay: "1.1s" }}>
                AI Rated
              </span>
            </div>
          </header>

          <aside className="animate-fade-in mx-auto mt-8 w-full min-w-0 max-w-full sm:max-w-[300px] lg:mx-0 lg:mt-0">
            <LiveAnalysisPreview />
          </aside>
        </div>

        <div id="features" className="mb-8 grid w-full min-w-0 scroll-mt-28 gap-3 sm:mb-10 sm:grid-cols-3 sm:gap-4">
          <div className="group relative rounded-2xl p-px shadow-lg shadow-indigo-950/30 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-20px_rgba(99,102,241,0.45)]">
            <div className="h-full rounded-2xl border border-white/[0.06] bg-slate-900/60 p-4 ring-1 ring-white/[0.05] backdrop-blur-xl transition group-hover:border-indigo-400/40 sm:p-5">
              <span className="text-2xl leading-none" aria-hidden>
                ✨
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight text-white">AI Style Rating</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Get instant AI feedback on your outfit.</p>
            </div>
          </div>
          <div className="group relative rounded-2xl p-px shadow-lg shadow-violet-950/25 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-20px_rgba(139,92,246,0.42)]">
            <div className="h-full rounded-2xl border border-white/[0.06] bg-slate-900/60 p-4 ring-1 ring-white/[0.05] backdrop-blur-xl transition group-hover:border-violet-400/40 sm:p-5">
              <span className="text-2xl leading-none" aria-hidden>
                ⚡
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight text-white">Compare Fits</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">See which outfit works better—same occasion.</p>
            </div>
          </div>
          <div className="group relative rounded-2xl p-px shadow-lg shadow-cyan-950/20 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-20px_rgba(34,211,238,0.35)] sm:col-span-1">
            <div className="h-full rounded-2xl border border-white/[0.06] bg-slate-900/60 p-4 ring-1 ring-white/[0.05] backdrop-blur-xl transition group-hover:border-cyan-400/35 sm:p-5">
              <span className="text-2xl leading-none" aria-hidden>
                📸
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight text-white">Share Cards</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Export stylish, social-ready rating cards.</p>
            </div>
          </div>
        </div>

        <RecentFits history={fitHistory} />

        <div
          id="app-panel"
          className="mt-8 rounded-[1.35rem] bg-gradient-to-br from-indigo-500/48 via-violet-500/30 to-cyan-500/20 p-px shadow-[0_44px_128px_-34px_rgba(79,70,229,0.62),0_0_80px_-40px_rgba(34,211,238,0.14)] ring-1 ring-white/[0.1]"
        >
          <div className="relative w-full min-w-0 overflow-hidden rounded-[1.3rem] border border-white/[0.1] bg-slate-900/70 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),inset_0_-1px_0_0_rgba(99,102,241,0.07)] backdrop-blur-3xl sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_62%_at_18%_-4%,rgba(99,102,241,0.14),transparent),radial-gradient(ellipse_65%_52%_at_100%_102%,rgba(34,211,238,0.1),transparent),radial-gradient(ellipse_45%_38%_at_50%_108%,rgba(167,139,250,0.06),transparent)]" aria-hidden />
            <div className="relative">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">Mode</p>
          <div className="relative mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.08] bg-slate-950/95 p-1 shadow-inner shadow-black/60 ring-1 ring-white/[0.05] sm:mb-7">
            <div
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.125rem)] rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 shadow-[0_0_32px_-4px_rgba(99,102,241,0.75)] ring-1 ring-white/25 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                appMode === "compare" ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0"
              }`}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => switchAppMode("single")}
              className={`fitrate-mode-toggle relative z-10 rounded-xl px-3 py-3 text-center text-xs font-semibold transition-colors duration-200 sm:py-3 sm:text-sm ${
                appMode === "single" ? "text-white" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              Single outfit
            </button>
            <button
              type="button"
              onClick={() => switchAppMode("compare")}
              className={`fitrate-mode-toggle relative z-10 rounded-xl px-3 py-3 text-center text-xs font-semibold transition-colors duration-200 sm:py-3 sm:text-sm ${
                appMode === "compare" ? "text-white" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              Compare outfits
            </button>
          </div>

          <label htmlFor="occasion" className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Occasion mode
            {isDetectingOccasion && (
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-600 border-t-indigo-400" aria-hidden />
            )}
          </label>
          <OccasionSelect id="occasion" value={occasionMode} onChange={handleOccasionChange} disabled={isDetectingOccasion} />
          {aiDetectedOccasion && (
            <p className="-mt-4 mb-4 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-indigo-400/85">
              ✨ AI detected: <span className="font-semibold text-indigo-300">{aiDetectedOccasion}</span>
            </p>
          )}

          {appMode === "single" && <BrutalModeToggle enabled={brutalMode} onChange={setBrutalMode} />}

          {appMode === "single" ? (
            <>
              <label
                onDragEnter={(e) => {
                  e.preventDefault();
                  setSingleDragOver(true);
                }}
                onDragLeave={() => setSingleDragOver(false)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={handleSingleDrop}
                className={`fitrate-upload-dropzone relative flex min-h-[11.5rem] cursor-pointer touch-manipulation flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-slate-950/40 bg-gradient-to-br from-indigo-500/[0.1] via-slate-950/20 to-cyan-500/[0.07] px-4 py-8 sm:min-h-[200px] sm:px-6 sm:py-10 ${
                  singleDragOver
                    ? "scale-[1.01] border-indigo-400/70 shadow-[0_0_60px_-6px_rgba(99,102,241,0.58)] ring-2 ring-indigo-400/45"
                    : "border-white/[0.14] hover:border-indigo-400/50 hover:bg-slate-900/55"
                }`}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(155deg,rgba(255,255,255,0.07)_0%,transparent_38%,rgba(99,102,241,0.06)_72%,transparent_100%)]"
                  aria-hidden
                />
                <div className="fitrate-upload-scan-track" aria-hidden>
                  <div className="fitrate-upload-scan-line" />
                </div>
                <input
                  id="outfit-file"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <span className="relative z-[1] pointer-events-none flex flex-col items-center text-center">
                  <svg
                    className={`mb-3 h-14 w-14 text-indigo-400/90 sm:h-16 sm:w-16 ${singleDragOver ? "" : "fitrate-upload-icon"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.15}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
                    />
                  </svg>
                  <span className="block max-w-[16rem] text-[15px] font-semibold leading-snug tracking-tight text-white drop-shadow-[0_2px_16px_rgba(99,102,241,0.15)] sm:max-w-none">
                    Drag &amp; drop your fit
                  </span>
                  <span className="mt-1.5 block text-xs font-medium text-slate-400">or tap to browse</span>
                  <span className="mt-3 block max-w-[18rem] text-balance text-[11px] font-medium leading-snug tracking-wide text-slate-500 sm:max-w-none">
                    JPG · PNG · WebP · iPhone photos (auto-compressed)
                  </span>
                </span>
              </label>

              <div className="fitrate-studio-ai-root mt-4 sm:mt-5">
                <div className="fitrate-studio-ai-hover flex flex-col">
                  <div className="fitrate-studio-ai-glow-ring group relative overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/60 shadow-[0_20px_56px_-24px_rgba(79,70,229,0.35)] ring-1 ring-indigo-400/15">
                    {previewUrl ? (
                      <>
                        <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit]" aria-hidden>
                          {[
                            { left: "10%", top: "14%", dur: "5.2s", del: "0s" },
                            { left: "82%", top: "18%", dur: "5.8s", del: "0.2s" },
                            { left: "48%", top: "38%", dur: "5.4s", del: "0.35s" },
                            { left: "72%", top: "62%", dur: "6.1s", del: "0.5s" },
                            { left: "18%", top: "72%", dur: "5.6s", del: "0.15s" },
                            { left: "56%", top: "88%", dur: "5.9s", del: "0.4s" }
                          ].map((p) => (
                            <span
                              key={`${p.left}-${p.top}`}
                              className="fitrate-studio-ai-particle absolute h-0.5 w-0.5 rounded-full bg-indigo-200/45 blur-[0.5px]"
                              style={
                                {
                                  left: p.left,
                                  top: p.top,
                                  ["--fitrate-studio-particle-dur"]: p.dur,
                                  ["--fitrate-studio-particle-delay"]: p.del
                                } as React.CSSProperties
                              }
                            />
                          ))}
                        </div>
                        <img
                          src={previewUrl}
                          alt="Outfit preview"
                          className="relative z-0 h-52 w-full object-cover object-center transition duration-500 group-hover:scale-[1.03] sm:h-64 md:h-72"
                        />
                      </>
                    ) : (
                      <div className="flex h-48 flex-col items-center justify-center gap-2 px-4 text-center text-sm sm:h-56">
                        {isPreparingImage ? (
                          <p className="text-indigo-200/90">Preparing photo…</p>
                        ) : (
                          <p className="text-slate-500">Preview appears here after you choose a photo.</p>
                        )}
                        {errorMessage && !isPreparingImage && (
                          <p className="text-xs text-rose-300">{errorMessage}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAnalyzeOutfit}
                    disabled={!canAnalyze || isPreparingImage}
                    className="btn-premium relative mt-5 w-full touch-manipulation overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-4 text-sm font-semibold text-white shadow-[0_12px_40px_-8px_rgba(79,70,229,0.65)] ring-1 ring-indigo-400/30 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-8px_rgba(99,102,241,0.55)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-[0.42] disabled:shadow-none disabled:ring-0 sm:mt-6 sm:py-3.5"
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="pointer-events-none absolute inset-x-3 bottom-2 z-0 h-[3px] overflow-hidden rounded-full bg-black/25 sm:inset-x-4" aria-hidden>
                          <span className="fitrate-studio-ai-analyze-bar block h-full w-full rounded-full bg-gradient-to-r from-white/25 via-white/50 to-cyan-200/45 shadow-[0_0_12px_rgba(255,255,255,0.25)]" />
                        </span>
                        <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Analyzing with stylist AI...
                        </span>
                      </>
                    ) : (
                      "Analyze Outfit"
                    )}
                  </button>
                </div>
              </div>
              <AnalyzingOverlay visible={isAnalyzing} brutalMode={brutalMode} />
              {errorMessage && <p className="mt-3 text-sm text-rose-300">{errorMessage}</p>}
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2.5 sm:space-y-3">
                  <label htmlFor="compare-file-a" className="block text-[11px] font-semibold uppercase tracking-wide text-indigo-300/90">
                    Outfit A
                  </label>
                  <label
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setCompareDragA(true);
                    }}
                    onDragLeave={() => setCompareDragA(false)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleCompareDrop(e, "A")}
                    className={`fitrate-upload-dropzone relative flex min-h-[8.75rem] cursor-pointer touch-manipulation flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-slate-950/40 bg-gradient-to-br from-indigo-500/[0.11] via-slate-950/15 to-cyan-500/[0.05] px-3 py-6 sm:min-h-[156px] sm:py-8 ${
                      compareDragA
                        ? "scale-[1.01] border-indigo-400/70 shadow-[0_0_52px_-8px_rgba(99,102,241,0.52)] ring-2 ring-indigo-400/42"
                        : "border-white/[0.14] hover:border-indigo-400/50 hover:bg-slate-900/48"
                    }`}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(155deg,rgba(255,255,255,0.06)_0%,transparent_40%,rgba(99,102,241,0.055)_100%)]"
                      aria-hidden
                    />
                    <div className="fitrate-upload-scan-track" aria-hidden>
                      <div className="fitrate-upload-scan-line" />
                    </div>
                    <input
                      id="compare-file-a"
                      type="file"
                      accept="image/*"
                      onChange={handleCompareImageA}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    />
                    <span className="relative z-[1] pointer-events-none flex flex-col items-center text-center">
                      <svg
                        className={`mb-2 h-11 w-11 text-indigo-400/90 sm:mb-3 sm:h-12 sm:w-12 ${compareDragA ? "" : "fitrate-upload-icon"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.15}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                      <span className="block text-[13px] font-semibold tracking-tight text-white drop-shadow-[0_2px_14px_rgba(99,102,241,0.14)] sm:text-[14px]">
                        Drag &amp; drop your fit
                      </span>
                      <span className="mt-1 block text-[11px] font-medium text-slate-400 sm:text-xs">or click to browse</span>
                      <span className="mt-2 block text-[10px] font-medium tracking-wide text-slate-500 sm:text-[11px]">JPG · PNG · WebP</span>
                    </span>
                  </label>
                  <div className="group overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/60 shadow-[0_16px_48px_-24px_rgba(79,70,229,0.3)] ring-1 ring-indigo-400/12">
                    {previewUrlA ? (
                      <img
                        src={previewUrlA}
                        alt="Outfit A preview"
                        className="h-32 max-h-[200px] w-full object-cover object-center transition duration-500 group-hover:scale-[1.03] sm:h-36 sm:max-h-[220px]"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center px-2 text-center text-[11px] text-slate-500 sm:h-36 sm:text-xs">
                        Preview for A
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2.5 sm:space-y-3">
                  <label htmlFor="compare-file-b" className="block text-[11px] font-semibold uppercase tracking-wide text-violet-300/90">
                    Outfit B
                  </label>
                  <label
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setCompareDragB(true);
                    }}
                    onDragLeave={() => setCompareDragB(false)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleCompareDrop(e, "B")}
                    className={`fitrate-upload-dropzone relative flex min-h-[8.75rem] cursor-pointer touch-manipulation flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-slate-950/40 bg-gradient-to-br from-violet-500/[0.12] via-slate-950/15 to-indigo-500/[0.06] px-3 py-6 sm:min-h-[156px] sm:py-8 ${
                      compareDragB
                        ? "scale-[1.01] border-violet-400/65 shadow-[0_0_52px_-8px_rgba(139,92,246,0.52)] ring-2 ring-violet-400/42"
                        : "border-white/[0.14] hover:border-violet-400/52 hover:bg-slate-900/48"
                    }`}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(155deg,rgba(255,255,255,0.06)_0%,transparent_40%,rgba(139,92,246,0.055)_100%)]"
                      aria-hidden
                    />
                    <div className="fitrate-upload-scan-track" aria-hidden>
                      <div className="fitrate-upload-scan-line fitrate-upload-scan-line-delay" />
                    </div>
                    <input
                      id="compare-file-b"
                      type="file"
                      accept="image/*"
                      onChange={handleCompareImageB}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    />
                    <span className="relative z-[1] pointer-events-none flex flex-col items-center text-center">
                      <svg
                        className={`mb-2 h-11 w-11 text-violet-400/90 sm:mb-3 sm:h-12 sm:w-12 ${compareDragB ? "" : "fitrate-upload-icon"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.15}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                      <span className="block text-[13px] font-semibold tracking-tight text-white drop-shadow-[0_2px_14px_rgba(139,92,246,0.16)] sm:text-[14px]">
                        Drag &amp; drop your fit
                      </span>
                      <span className="mt-1 block text-[11px] font-medium text-slate-400 sm:text-xs">or click to browse</span>
                      <span className="mt-2 block text-[10px] font-medium tracking-wide text-slate-500 sm:text-[11px]">JPG · PNG · WebP</span>
                    </span>
                  </label>
                  <div className="group overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/60 shadow-[0_16px_48px_-24px_rgba(139,92,246,0.28)] ring-1 ring-violet-400/14">
                    {previewUrlB ? (
                      <img
                        src={previewUrlB}
                        alt="Outfit B preview"
                        className="h-32 max-h-[200px] w-full object-cover object-center transition duration-500 group-hover:scale-[1.03] sm:h-36 sm:max-h-[220px]"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center px-2 text-center text-[11px] text-slate-500 sm:h-36 sm:text-xs">
                        Preview for B
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompareOutfits}
                disabled={!canCompare}
                className="btn-premium mt-6 w-full touch-manipulation rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-500 px-4 py-4 text-sm font-semibold text-white shadow-[0_12px_40px_-8px_rgba(109,40,217,0.55)] ring-1 ring-violet-400/25 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-8px_rgba(139,92,246,0.5)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-[0.42] disabled:shadow-none disabled:ring-0 sm:mt-7 sm:py-3.5"
              >
                {isComparing ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Comparing outfits…
                  </span>
                ) : (
                  "Compare Outfits"
                )}
              </button>
              {compareError && <p className="mt-3 text-sm text-rose-300">{compareError}</p>}
            </>
          )}
            </div>
          </div>
        </div>
      </div>

      {result && appMode === "single" && (
        <section ref={resultSectionRef} className="animate-slide-up mx-auto mt-12 w-full max-w-6xl space-y-8">
          <div className="w-full min-w-0 rounded-3xl border border-white/[0.1] bg-slate-900/55 p-4 shadow-[0_28px_90px_-28px_rgba(79,70,229,0.35)] ring-1 ring-indigo-400/15 backdrop-blur-xl sm:p-9">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl md:tracking-tight">
                  {brutalMode ? "Brutal Stylist Verdict" : "Your Stylist Analysis"}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Judged for{" "}
                  <span className="font-semibold text-indigo-300">{occasionMode}</span>
                  {brutalMode && (
                    <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Brutal mode
                    </span>
                  )}
                </p>
                <FashionBadges badges={displayBadges} animateKey={resultRevealKey} />
              </div>
              <AnimatedScoreReveal rating={result.overallRating} gradientId={scoreRingGradientId} animateKey={resultRevealKey} />
            </div>

            {typeof result.aiConfidence === "number" && (
              <p className="mt-4 text-xs text-slate-300">
                AI confidence: <span className="font-semibold text-indigo-100">{Math.round(result.aiConfidence)}%</span> (based on image clarity
                and outfit visibility)
              </p>
            )}

            <AnimatedScoreBars result={result} animateKey={resultRevealKey} />

            <ShareableResultCard
              ref={shareCardRef}
              result={result}
              badges={displayBadges}
              occasion={occasionMode}
              outfitPreviewUrl={previewUrl}
              brutalMode={brutalMode}
              onDownload={handleDownloadShareCard}
              downloadLoading={shareCardExportLoading}
              downloadError={shareCardExportError}
            />

            <div className="mt-4">
              <button
                type="button"
                onClick={handleStartBattle}
                disabled={battleLoading}
                className="w-full rounded-xl border border-violet-400/30 bg-gradient-to-r from-violet-600/20 via-indigo-600/20 to-violet-600/20 px-4 py-3 text-sm font-bold text-violet-200 ring-1 ring-violet-400/20 transition hover:border-violet-400/50 hover:bg-gradient-to-r hover:from-violet-600/30 hover:via-indigo-600/30 hover:to-violet-600/30 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {battleLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200" />
                    Saving…
                  </span>
                ) : (
                  "⚔ Start a Battle"
                )}
              </button>
            </div>
          </div>

          <article className="w-full min-w-0 rounded-3xl border border-white/[0.08] bg-slate-900/40 p-4 shadow-xl ring-1 ring-white/[0.04] backdrop-blur-lg sm:p-8">
            <h3 className="text-lg font-semibold tracking-tight text-white">Detected Outfit Pieces</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetectedItem label="Outerwear" value={result.detectedItems.outerwear} />
              <DetectedItem label="Top" value={result.detectedItems.top} />
              <DetectedItem label="Bottoms" value={result.detectedItems.bottoms} />
              <DetectedItem label="Shoes" value={result.detectedItems.shoes} />
              <DetectedItem label="Silhouette" value={result.detectedItems.silhouette} />
              <DetectedItem label="Style Vibe" value={result.detectedItems.styleVibe} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4 ring-1 ring-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Accessories</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.detectedItems.accessories.length > 0 ? (
                    result.detectedItems.accessories.map((item) => (
                      <span key={item} className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-slate-200">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-300">No clear accessories detected</span>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4 ring-1 ring-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Main Colors</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.detectedItems.mainColors.length > 0 ? (
                    result.detectedItems.mainColors.map((item) => (
                      <span key={item} className="rounded-full border border-indigo-100/30 bg-indigo-500/20 px-2.5 py-1 text-xs text-indigo-100">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-300">No clear colors detected</span>
                  )}
                </div>
              </div>
            </div>
          </article>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="w-full min-w-0 rounded-3xl border border-white/[0.08] bg-slate-900/40 p-4 shadow-lg ring-1 ring-white/[0.04] backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Style Identity</p>
              <p className="mt-2 text-sm text-slate-100">{result.styleIdentity}</p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Main Feedback</p>
              <p className="mt-2 text-sm text-slate-200">{result.mainFeedback}</p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Color Advice</p>
              <p className="mt-2 text-sm text-slate-200">{result.colorAdvice}</p>
            </article>

            <article className="w-full min-w-0 rounded-3xl border border-white/[0.08] bg-slate-900/40 p-4 shadow-lg ring-1 ring-white/[0.04] backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Best Part</p>
              <p className="mt-2 text-sm text-emerald-100">{result.bestPart}</p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Weakest Part</p>
              <p className="mt-2 text-sm text-rose-100">{result.weakestPart}</p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Style Keywords</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.styleKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-indigo-100/25 bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-100 transition hover:border-indigo-200/60"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </article>
          </div>

          <article className="w-full min-w-0 rounded-3xl border border-white/[0.08] bg-slate-900/40 p-4 shadow-xl ring-1 ring-white/[0.04] backdrop-blur-lg sm:p-8">
            <h3 className="text-lg font-semibold tracking-tight text-white">3 Upgrade Ideas</h3>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {result.upgradeIdeas.map((idea, index) => (
                <div
                  key={`idea-${index}-${idea.title}`}
                  className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-5 ring-1 ring-white/[0.03] transition duration-200 hover:-translate-y-0.5 hover:border-indigo-400/30"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{idea.title}</p>
                    <DifficultyBadge difficulty={idea.difficulty} />
                  </div>
                  <p className="text-sm text-slate-300">{idea.description}</p>
                </div>
              ))}
            </div>
          </article>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="w-full min-w-0 rounded-3xl border border-teal-400/20 bg-teal-950/30 p-4 shadow-lg ring-1 ring-teal-400/15 backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 sm:p-8">
              <h3 className="text-lg font-semibold text-teal-100">Do This</h3>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-teal-50/95">
                {result.dos.map((item, index) => (
                  <li key={`do-${index}-${item}`} className="flex gap-2">
                    <span>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="w-full min-w-0 rounded-3xl border border-rose-400/20 bg-rose-950/35 p-4 shadow-lg ring-1 ring-rose-400/15 backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 sm:p-8">
              <h3 className="text-lg font-semibold text-rose-100">Avoid This</h3>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-rose-50/95">
                {result.donts.map((item, index) => (
                  <li key={`dont-${index}-${item}`} className="flex gap-2">
                    <span>×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      )}

      {compareResult && appMode === "compare" && (
        <section ref={compareResultSectionRef} id="compare-results" className="animate-slide-up mx-auto mt-10 w-full max-w-6xl scroll-mt-28 space-y-6 sm:mt-12 sm:space-y-8">
          <div className="w-full min-w-0 rounded-3xl border border-white/[0.1] bg-slate-900/55 p-4 shadow-[0_28px_90px_-28px_rgba(139,92,246,0.28)] ring-1 ring-violet-400/15 backdrop-blur-xl sm:p-9">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Compare results</h2>
            <p className="mt-2 text-sm text-slate-400">
              Judged for <span className="font-semibold text-indigo-300">{occasionMode}</span>
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setCompareShareCardPreviewVisible(true)}
                className="w-full rounded-xl border border-indigo-400/40 bg-gradient-to-r from-indigo-500/15 to-violet-500/10 px-5 py-2.5 text-sm font-semibold text-indigo-50 shadow-[0_8px_32px_-12px_rgba(99,102,241,0.45)] ring-1 ring-indigo-400/25 transition duration-300 hover:-translate-y-0.5 hover:border-indigo-300/55 hover:shadow-[0_14px_40px_-10px_rgba(99,102,241,0.5)] sm:w-auto"
              >
                Create Compare Share Card
              </button>
            </div>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
              Uploaded photos are not included in the compare share card.
            </p>

            {compareShareCardPreviewVisible && (
              <div className="mt-5 space-y-3">
                <div
                  ref={compareShareCardRef}
                  className="mx-auto box-border w-full max-w-[440px] rounded-[1.75rem] border border-white/[0.12] bg-[#020617] p-7 shadow-[0_36px_90px_-20px_rgba(139,92,246,0.48)] ring-1 ring-violet-400/25 sm:p-8"
                >
                  <div className="border-b border-white/[0.1] pb-5 text-center">
                    <p className="text-lg font-bold tracking-tight text-white">FitRate AI</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/90">
                      AI Outfit Comparison
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                      Occasion{" "}
                      <span className="font-semibold text-indigo-200">{occasionMode}</span>
                    </p>
                  </div>

                  <div className="mt-5 space-y-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/90">Winner</p>
                    <p className="text-xl font-bold text-white sm:text-2xl">{compareWinnerDisplayLabel(compareResult.winner)}</p>
                    <span className="fitrate-pill-pulse inline-flex rounded-full border border-sky-400/40 bg-gradient-to-r from-sky-500/20 to-cyan-500/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-50 ring-1 ring-sky-400/30">
                      {compareResult.closeness}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div
                      className={`relative overflow-hidden rounded-2xl border px-3 py-4 text-center ${
                        compareResult.winner === "A"
                          ? "border-amber-400/45 bg-amber-500/10 shadow-[0_0_28px_rgba(251,191,36,0.18)] ring-1 ring-amber-400/25"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      {compareResult.winner === "A" && (
                        <div
                          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_-20%,rgba(251,191,36,0.22),transparent_65%)]"
                          aria-hidden
                        />
                      )}
                      <p className="relative text-[10px] font-semibold uppercase tracking-wide text-indigo-200/95">Outfit A</p>
                      <p className="relative mt-2 text-3xl font-bold tabular-nums tracking-tight text-white">
                        {formatCompareScore(compareResult.scoreA)}
                        <span className="text-lg font-semibold text-slate-500">/10</span>
                      </p>
                      {compareResult.winner === "A" && (
                        <span className="relative mt-2 inline-block rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                          Winner
                        </span>
                      )}
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-2xl border px-3 py-4 text-center ${
                        compareResult.winner === "B"
                          ? "border-amber-400/45 bg-amber-500/10 shadow-[0_0_28px_rgba(251,191,36,0.18)] ring-1 ring-amber-400/25"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      {compareResult.winner === "B" && (
                        <div
                          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_-20%,rgba(251,191,36,0.22),transparent_65%)]"
                          aria-hidden
                        />
                      )}
                      <p className="relative text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">Outfit B</p>
                      <p className="relative mt-2 text-3xl font-bold tabular-nums tracking-tight text-white">
                        {formatCompareScore(compareResult.scoreB)}
                        <span className="text-lg font-semibold text-slate-500">/10</span>
                      </p>
                      {compareResult.winner === "B" && (
                        <span className="relative mt-2 inline-block rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                          Winner
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 space-y-4 border-t border-white/10 pt-5 text-left">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reason</p>
                      <p className="mt-1 text-sm leading-snug text-slate-100">
                        &ldquo;{shortenCompareText(compareResult.winnerReason, 130)}&rdquo;
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Summaries</p>
                      <p className="text-sm leading-snug text-slate-200">
                        <span className="font-semibold text-indigo-200">A:</span>{" "}
                        {buildCompareSummary(compareResult.outfitAFeedback, 95)}
                      </p>
                      <p className="text-sm leading-snug text-slate-200">
                        <span className="font-semibold text-violet-200">B:</span>{" "}
                        {buildCompareSummary(compareResult.outfitBFeedback, 95)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">Improve weaker look</p>
                      <p className="mt-1 text-sm leading-snug text-emerald-100/95">
                        {buildImproveTip(compareResult.weakerOutfitTips, 125)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-6 text-center text-[10px] text-slate-500">Generated with FitRate AI</p>
                </div>

                <div className="mx-auto flex w-full max-w-[440px] flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCompareShareCard}
                    disabled={compareShareCardExportLoading}
                    className="btn-premium w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-8px_rgba(99,102,241,0.55)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-[0.5] disabled:shadow-none disabled:ring-0"
                  >
                    {compareShareCardExportLoading ? "Creating image…" : "Download Compare Card"}
                  </button>
                  {compareShareCardExportError && (
                    <p className="text-center text-xs text-rose-300">{compareShareCardExportError}</p>
                  )}
                </div>
              </div>
            )}

            <div className="relative mt-6 overflow-hidden rounded-2xl border border-amber-400/45 bg-gradient-to-b from-amber-500/[0.18] via-slate-950/85 to-slate-950/95 px-5 py-7 text-center shadow-[0_0_64px_-12px_rgba(251,191,36,0.45)] ring-1 ring-amber-400/35 sm:mt-8 sm:px-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-10%,rgba(251,191,36,0.35),transparent_68%)]" aria-hidden />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-amber-500/[0.06] to-transparent" aria-hidden />
              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-amber-100/95">Winner</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-white drop-shadow-[0_0_24px_rgba(251,191,36,0.25)] sm:text-4xl">
                  {compareResult.winner === "Tie" ? "It’s a tie" : compareResult.winner === "A" ? "Outfit A" : "Outfit B"}
                </p>
                <span className="fitrate-pill-pulse mt-4 inline-flex rounded-full border border-amber-400/45 bg-gradient-to-r from-amber-500/25 to-amber-600/15 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 ring-1 ring-amber-300/40">
                  {compareResult.closeness}
                </span>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">{compareResult.winnerReason}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 md:gap-6">
            <article
              className={`relative overflow-hidden rounded-3xl border bg-slate-950/55 p-5 shadow-xl ring-1 backdrop-blur-lg transition duration-300 hover:-translate-y-1 sm:p-8 ${
                compareResult.winner === "A"
                  ? "border-amber-400/45 shadow-[0_0_48px_-14px_rgba(251,191,36,0.42)] ring-amber-400/25"
                  : compareResult.winner === "Tie"
                    ? "border-amber-300/25 ring-amber-500/15"
                    : "border-white/[0.08] ring-white/[0.04]"
              }`}
            >
              {compareResult.winner === "A" && (
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_-15%,rgba(251,191,36,0.16),transparent_68%)]"
                  aria-hidden
                />
              )}
              <div className="relative flex flex-wrap items-end justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-300">Outfit A</p>
                {compareResult.winner === "A" && (
                  <span className="rounded-full border border-amber-400/45 bg-amber-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-50 shadow-[0_0_16px_-2px_rgba(251,191,36,0.45)]">
                    Winner
                  </span>
                )}
              </div>
              <p className="relative mt-4 flex flex-wrap items-baseline gap-1 tabular-nums">
                <span className="text-5xl font-bold tracking-tight text-white">{formatCompareScore(compareResult.scoreA)}</span>
                <span className="text-2xl font-semibold text-slate-500">/10</span>
              </p>
              <p className="relative mt-5 border-t border-white/[0.07] pt-5 text-sm leading-relaxed text-slate-300">{compareResult.outfitAFeedback}</p>
            </article>

            <article
              className={`relative overflow-hidden rounded-3xl border bg-slate-950/55 p-5 shadow-xl ring-1 backdrop-blur-lg transition duration-300 hover:-translate-y-1 sm:p-8 ${
                compareResult.winner === "B"
                  ? "border-amber-400/45 shadow-[0_0_48px_-14px_rgba(251,191,36,0.42)] ring-amber-400/25"
                  : compareResult.winner === "Tie"
                    ? "border-amber-300/25 ring-amber-500/15"
                    : "border-white/[0.08] ring-white/[0.04]"
              }`}
            >
              {compareResult.winner === "B" && (
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_-15%,rgba(251,191,36,0.16),transparent_68%)]"
                  aria-hidden
                />
              )}
              <div className="relative flex flex-wrap items-end justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300">Outfit B</p>
                {compareResult.winner === "B" && (
                  <span className="rounded-full border border-amber-400/45 bg-amber-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-50 shadow-[0_0_16px_-2px_rgba(251,191,36,0.45)]">
                    Winner
                  </span>
                )}
              </div>
              <p className="relative mt-4 flex flex-wrap items-baseline gap-1 tabular-nums">
                <span className="text-5xl font-bold tracking-tight text-white">{formatCompareScore(compareResult.scoreB)}</span>
                <span className="text-2xl font-semibold text-slate-500">/10</span>
              </p>
              <p className="relative mt-5 border-t border-white/[0.07] pt-5 text-sm leading-relaxed text-slate-300">{compareResult.outfitBFeedback}</p>
            </article>
          </div>

          <article className="rounded-3xl border border-white/[0.08] bg-slate-900/40 p-5 shadow-xl ring-1 ring-white/[0.04] backdrop-blur-lg sm:p-8">
            <h3 className="text-lg font-semibold tracking-tight text-white">Sharpen the weaker look</h3>
            <p className="mt-2 text-xs text-slate-400">
              {compareResult.scoreA !== compareResult.scoreB
                ? compareResult.scoreA < compareResult.scoreB
                  ? "Tips biased toward Outfit A (lower score)."
                  : "Tips biased toward Outfit B (lower score)."
                : "Balanced pointers when scores are tied."}
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-200">
              {compareResult.weakerOutfitTips.map((tip, i) => (
                <li key={`tip-${i}-${tip.slice(0, 20)}`} className="leading-relaxed">
                  {tip}
                </li>
              ))}
            </ol>
          </article>
        </section>
      )}
    </main>
  );
}

function pieceForShareSummary(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^not clearly visible$/i.test(trimmed)) return null;
  if (/^none visible$/i.test(trimmed)) return null;
  return trimmed;
}

function shortenShareText(text: string, max: number): string {
  return shortenCompareText(text, max);
}

function buildDetectedOutfitSummary(r: AnalysisResult): string {
  const outerwear = pieceForShareSummary(r.detectedItems.outerwear);
  const top = pieceForShareSummary(r.detectedItems.top);
  const bottoms = pieceForShareSummary(r.detectedItems.bottoms);
  const shoes = pieceForShareSummary(r.detectedItems.shoes);
  const core = [top, bottoms, shoes].filter((p): p is string => Boolean(p));

  let line =
    core.length >= 3
      ? `${core[0]} • ${core[1]} • ${core[2]}`
      : core.length === 2 && outerwear
        ? `${outerwear} • ${core[0]} • ${core[1]}`
        : core.concat(outerwear ? [outerwear] : []).slice(0, 4).join(" • ");

  if (!line) line = shortenShareText(r.detectedItems.styleVibe || r.styleIdentity, 160);
  return line;
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const badgeClass =
    difficulty === "Easy"
      ? "border-emerald-300/30 bg-emerald-500/20 text-emerald-100"
      : difficulty === "Medium"
        ? "border-amber-300/30 bg-amber-500/20 text-amber-100"
        : "border-rose-300/30 bg-rose-500/20 text-rose-100";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}>
      {difficulty}
    </span>
  );
}

function DetectedItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4 ring-1 ring-white/[0.03] transition duration-200 hover:border-indigo-400/20">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-100">{value}</p>
    </div>
  );
}
