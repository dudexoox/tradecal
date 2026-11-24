"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * A strategy condition list you can actually tick through — used on the
 * strategy page to walk a review, and inside the trade form so every trade is
 * checked against the strategy that was selected.
 */
export function CriteriaChecklist({
  items,
  label = "Entry checklist",
  tone = "brand",
  defaultOpen = true,
}: {
  items: string[];
  label?: string;
  tone?: "brand" | "down";
  defaultOpen?: boolean;
}) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;
  const done = checked.filter(Boolean).length;
  const toneClass = tone === "down" ? "text-down" : "text-brand";

  return (
    <div className="rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Icon name={tone === "down" ? "flag" : "checkCircle"} size={15} className={toneClass} />
          {label}
        </span>
        <span className="flex items-center gap-2 text-[10px] text-muted">
          <span className={`num ${done === items.length ? "text-up" : ""}`}>
            {done}/{items.length}
          </span>
          <Icon name="chevron" size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </span>
      </button>

      {open && (
        <ul className="space-y-1 border-t border-line p-3">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-panel-2/60">
                <input
                  type="checkbox"
                  checked={checked[index] ?? false}
                  onChange={() => setChecked((prev) => prev.map((c, i) => (i === index ? !c : c)))}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
                />
                <span
                  className={`text-xs leading-relaxed transition-colors ${
                    checked[index] ? "text-dim line-through" : "text-fg/90"
                  }`}
                >
                  {item}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
