"use client";

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type OccasionMode =
  | "Casual"
  | "School"
  | "Date"
  | "Gym"
  | "Party"
  | "Streetwear"
  | "Smart casual";

export const OCCASIONS: OccasionMode[] = [
  "Casual",
  "School",
  "Date",
  "Gym",
  "Party",
  "Streetwear",
  "Smart casual"
];

const OCCASION_EMOJI: Record<OccasionMode, string> = {
  Casual: "👕",
  School: "🎒",
  Date: "🌹",
  Gym: "💪",
  Party: "✨",
  Streetwear: "🧢",
  "Smart casual": "👔"
};

export type OccasionSelectProps = {
  value: OccasionMode;
  onChange: (value: OccasionMode) => void;
  /** Matches previous native select `id` for label association */
  id?: string;
  disabled?: boolean;
};

export function OccasionSelect({ value, onChange, id: idProp, disabled = false }: OccasionSelectProps) {
  const reactId = useId();
  const triggerId = idProp ?? `occasion-select-${reactId}`;
  const listboxId = `${triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = useMemo(() => OCCASIONS.indexOf(value), [value]);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !open) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const margin = 12;
    let left = r.left;
    let width = r.width;
    if (left + width > vw - margin) {
      left = Math.max(margin, vw - margin - width);
    }
    if (left < margin) {
      width = Math.min(width, vw - margin * 2);
      left = margin;
    }
    setMenuStyle({
      position: "fixed",
      top: r.bottom + gap,
      left,
      width,
      zIndex: 100
    });
  }, [open]);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [open, updateMenuPosition, value]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: Event) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const optionId = `${listboxId}-opt-${activeIndex}`;
    requestAnimationFrame(() => {
      document.getElementById(optionId)?.scrollIntoView({ block: "nearest" });
    });
  }, [activeIndex, open, listboxId]);

  const selectOption = useCallback(
    (mode: OccasionMode) => {
      onChange(mode);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          setActiveIndex((i) => Math.min(i + 1, OCCASIONS.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          setActiveIndex((i) => Math.max(i - 1, 0));
        }
        break;
      case "Enter":
      case " ":
        if (open) {
          e.preventDefault();
          selectOption(OCCASIONS[activeIndex]!);
        }
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(OCCASIONS.length - 1);
        }
        break;
      default:
        break;
    }
  };

  const activeDescendant = open ? `${listboxId}-opt-${activeIndex}` : undefined;

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-activedescendant={activeDescendant}
        style={menuStyle}
        tabIndex={-1}
        className="fitrate-occasion-menu max-h-[min(50vh,20rem)] origin-top overflow-y-auto overscroll-contain rounded-xl border border-indigo-400/25 bg-slate-950/95 p-1.5 shadow-[0_24px_56px_-12px_rgba(15,23,42,0.9),0_0_40px_-12px_rgba(99,102,241,0.35)] shadow-indigo-950/50 ring-1 ring-violet-400/15 backdrop-blur-xl [scrollbar-width:thin]"
      >
        {OCCASIONS.map((occasion, index) => {
          const selected = occasion === value;
          const active = index === activeIndex;
          return (
            <li
              key={occasion}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={selected}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors duration-150 select-none ${
                active
                  ? "bg-gradient-to-r from-indigo-500/35 via-violet-500/22 to-cyan-500/18 text-white ring-1 ring-indigo-400/30"
                  : "text-slate-200 hover:bg-indigo-500/20 hover:text-white"
              } ${selected ? "font-semibold" : "font-medium"}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => selectOption(occasion)}
            >
              <span className="text-lg leading-none" aria-hidden>
                {OCCASION_EMOJI[occasion]}
              </span>
              <span className="min-w-0 flex-1 truncate">{occasion}</span>
              {selected && (
                <span className="shrink-0 text-indigo-300" aria-hidden>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ul>,
      document.body
    );

  return (
    <div ref={rootRef} className="relative mb-6 w-full">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? activeDescendant : undefined}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.12] bg-slate-950/75 px-4 py-3 text-left text-sm text-slate-100 shadow-inner shadow-black/20 ring-1 ring-indigo-400/15 backdrop-blur-md transition-[border-color,box-shadow,background-color] duration-200 ease-out outline-none hover:border-indigo-400/40 hover:shadow-[0_0_32px_-8px_rgba(99,102,241,0.45)] hover:ring-indigo-400/35 focus-visible:border-indigo-400/50 focus-visible:shadow-[0_0_40px_-6px_rgba(99,102,241,0.55)] focus-visible:ring-2 focus-visible:ring-indigo-400/40 disabled:pointer-events-none disabled:opacity-45 ${
          open ? "border-indigo-400/45 shadow-[0_0_36px_-6px_rgba(99,102,241,0.5)] ring-indigo-400/35" : ""
        }`}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-lg leading-none" aria-hidden>
            {OCCASION_EMOJI[value]}
          </span>
          <span className="truncate font-medium">{value}</span>
        </span>
        <span
          className={`pointer-events-none inline-flex size-5 shrink-0 items-center justify-center text-indigo-300/90 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="block size-5 max-h-5 max-w-5 shrink-0"
          >
            <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {menu}
    </div>
  );
}
