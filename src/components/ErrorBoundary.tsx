"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#030712] px-6 text-center">
          <p className="text-5xl" aria-hidden>⚠️</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Something went wrong</h1>
          <p className="max-w-sm text-sm leading-relaxed text-slate-400">
            FitRate AI hit an unexpected error. Refresh the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_-8px_rgba(79,70,229,0.55)] transition hover:-translate-y-0.5"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
