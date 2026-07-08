import { ImageResponse } from "next/og";
import { getSharedCompareResult } from "@/lib/compareResultStore";
import { formatScore } from "@/lib/formatScore";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

export default async function OgImage({ params }: Props) {
  const { id } = await params;
  const data = await getSharedCompareResult(id);

  const compare = data?.compare;
  const scoreA = compare?.scoreA ?? 0;
  const scoreB = compare?.scoreB ?? 0;
  const winner = compare?.winner ?? "Tie";
  const occasion = data?.occasion ?? "Casual";
  const winnerText = winner === "Tie" ? "It’s a tie" : winner === "A" ? "Outfit A wins" : "Outfit B wins";

  const winColor = "#fbbf24";
  const idle = "#64748b";

  const tile = (label: string, score: number, isWinner: boolean, accent: string) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: 300,
        height: 300,
        borderRadius: 32,
        border: `2px solid ${isWinner ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.12)"}`,
        background: isWinner ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.03)",
      }}
    >
      <span style={{ display: "flex", fontSize: 24, color: accent, fontWeight: 700, letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          marginTop: 8,
          color: isWinner ? "#ffffff" : "#e2e8f0",
        }}
      >
        <span style={{ fontSize: 120, fontWeight: 900, lineHeight: 1 }}>{formatScore(score)}</span>
        <span style={{ fontSize: 40, fontWeight: 700, color: "#64748b", marginLeft: 4 }}>/10</span>
      </span>
      {isWinner && (
        <span style={{ display: "flex", marginTop: 10, fontSize: 20, color: winColor, fontWeight: 800, letterSpacing: "0.1em" }}>
          WINNER
        </span>
      )}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #030712 0%, #0d0826 55%, #1a0d3e 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 800,
            height: 450,
            background: "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#818cf8",
            fontWeight: 700,
            letterSpacing: "0.18em",
            marginBottom: 24,
          }}
        >
          FITRATE AI · OUTFIT COMPARE
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {tile("OUTFIT A", scoreA, winner === "A", "#a5b4fc")}
          <span style={{ display: "flex", fontSize: 56, fontWeight: 900, color: idle }}>VS</span>
          {tile("OUTFIT B", scoreB, winner === "B", "#c4b5fd")}
        </div>

        <div style={{ display: "flex", marginTop: 30, fontSize: 40, fontWeight: 800, color: "#ffffff" }}>
          {winnerText}
        </div>

        <div
          style={{
            display: "flex",
            background: "rgba(99,102,241,0.18)",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: 100,
            padding: "6px 24px",
            fontSize: 17,
            color: "#a5b4fc",
            marginTop: 16,
          }}
        >
          {occasion}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
