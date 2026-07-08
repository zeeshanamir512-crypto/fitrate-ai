import { ImageResponse } from "next/og";
import { getSharedResult } from "@/lib/resultStore";
import { formatScore } from "@/lib/formatScore";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

export default async function OgImage({ params }: Props) {
  const { id } = await params;
  const data = await getSharedResult(id);

  const score = data?.result.overallRating ?? 0;
  const styleIdentity = data?.result.styleIdentity ?? "Outfit Rating";
  const occasion = data?.occasion ?? "Casual";

  const scoreColor =
    score >= 8 ? "#34d399" : score >= 6 ? "#a5b4fc" : "#fbbf24";

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
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 450,
            background:
              "radial-gradient(ellipse, rgba(99,102,241,0.22) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Brand */}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#818cf8",
            fontWeight: 700,
            letterSpacing: "0.18em",
            marginBottom: 12,
          }}
        >
          FITRATE AI
        </div>

        {/* Score */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontSize: 148,
              fontWeight: 900,
              color: scoreColor,
              lineHeight: 1,
              textShadow: `0 0 60px ${scoreColor}66`,
            }}
          >
            {formatScore(score)}
          </span>
          <span
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#64748b",
              marginLeft: 4,
              marginBottom: 18,
            }}
          >
            /10
          </span>
        </div>

        {/* Style identity */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#e2e8f0",
            fontWeight: 600,
            marginBottom: 12,
            textAlign: "center",
            maxWidth: 760,
          }}
        >
          {styleIdentity}
        </div>

        {/* Occasion tag */}
        <div
          style={{
            display: "flex",
            background: "rgba(99,102,241,0.18)",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: 100,
            padding: "6px 24px",
            fontSize: 17,
            color: "#a5b4fc",
            marginBottom: 36,
          }}
        >
          {occasion}
        </div>

        {/* CTA pill */}
        <div
          style={{
            display: "flex",
            background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
            borderRadius: 16,
            padding: "16px 52px",
            fontSize: 24,
            color: "white",
            fontWeight: 700,
            marginBottom: 24,
          }}
        >
          Can you beat my score?
        </div>

        {/* URL */}
        <div
          style={{
            display: "flex",
            fontSize: 16,
            color: "#334155",
            letterSpacing: "0.04em",
          }}
        >
          fitrate-ai.vercel.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
