import { ImageResponse } from "next/og";

export const alt = "FitRate AI — AI Outfit Rating";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#030712",
          padding: "64px",
          position: "relative",
          overflow: "hidden",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Background glows */}
        <div
          style={{
            position: "absolute",
            top: "-160px",
            left: "-160px",
            width: "560px",
            height: "560px",
            background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 68%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            right: "-80px",
            width: "440px",
            height: "440px",
            background: "radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 68%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "80px",
            left: "200px",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "28px",
          }}
        >
          {/* Badge pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(99,102,241,0.14)",
              border: "1px solid rgba(99,102,241,0.38)",
              borderRadius: "100px",
              padding: "10px 24px",
            }}
          >
            <span style={{ fontSize: "20px" }}>✨</span>
            <span
              style={{
                color: "#a5b4fc",
                fontSize: "15px",
                fontWeight: 600,
                letterSpacing: "0.14em",
              }}
            >
              AI FASHION RATING
            </span>
          </div>

          {/* App name */}
          <div
            style={{
              display: "flex",
              fontSize: "96px",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            FitRate AI
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              marginTop: "-4px",
            }}
          >
            {["Rate", "Score", "Share", "Elevate"].map((word, i) => (
              <div key={word} style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <span
                  style={{
                    fontSize: "32px",
                    fontWeight: 600,
                    color: i === 0 ? "#818cf8" : i === 1 ? "#a78bfa" : i === 2 ? "#22d3ee" : "#c4b5fd",
                  }}
                >
                  {word}
                </span>
                {i < 3 && (
                  <span style={{ fontSize: "24px", color: "#1e293b", fontWeight: 300 }}>·</span>
                )}
              </div>
            ))}
          </div>

          {/* Subtitle */}
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              color: "#64748b",
              textAlign: "center",
              marginTop: "4px",
              letterSpacing: "0.01em",
            }}
          >
            Upload your fit · Get an AI score · Share your style
          </div>

          {/* Score preview chips */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            {[
              { label: "Fit", score: "9", color: "#4ade80" },
              { label: "Color", score: "8.5", color: "#60a5fa" },
              { label: "Shoes", score: "8", color: "#a78bfa" },
              { label: "Trend", score: "9.5", color: "#fb923c" },
            ].map(({ label, score, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  padding: "14px 22px",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "28px", fontWeight: 700, color }}>{score}</span>
                <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* URL watermark */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            right: "48px",
            color: "#334155",
            fontSize: "16px",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          fitrate-ai.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
