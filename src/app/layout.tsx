import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const APP_URL = "https://fitrate-ai.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "FitRate AI — AI Outfit Rating",
    template: "%s | FitRate AI",
  },
  description:
    "Upload your outfit photo and get an instant AI-powered style rating. Score your fit on style, color, shoes, and accessories. Compare looks and share stylish result cards.",
  keywords: [
    "AI outfit rating",
    "fashion AI",
    "outfit score",
    "style rating app",
    "FitRate AI",
    "rate my outfit",
    "outfit feedback",
    "AI style tips",
    "fashion rating",
    "outfit compare",
  ],
  authors: [{ name: "FitRate AI" }],
  creator: "FitRate AI",
  metadataBase: new URL(APP_URL),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: APP_URL,
    title: "FitRate AI — AI Outfit Rating",
    description:
      "Upload your outfit. Get an instant AI style score, detailed feedback, and shareable rating cards.",
    siteName: "FitRate AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "FitRate AI — AI Outfit Rating",
    description:
      "Upload your outfit. Get an instant AI style score, detailed feedback, and shareable rating cards.",
    creator: "@fitrateai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}
