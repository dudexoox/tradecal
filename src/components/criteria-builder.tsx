"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * Dynamic checklist builder: one condition per line, stored as newline text
 * (hidden input) so the server never has to parse structure.
 */
export function CriteriaBuilder({
  name,
  label,
  hint,
  placeholder,
  defaultText = "",
  tone = "brand",
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultText?: string;
  tone?: "brand" | "down";
}) {
  const [items, setItems] = useState<string[]>(() =>
    defaultText.split("\n").map((s) => s.trim()).filter(Boolean),
  );
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    setItems((prev) => [...prev, value]);
    setDraft("");
  };

  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));
  const accent = tone === "down" ? "text-down" : "text-brand";

  return (
    <div>
      <span className="label">{label}</span>
      {hint && <p className="-mt-1 mb-2 text-[10px] leading-relaxed text-muted">{hint}</p>}
      <input type="hidden" name={name} value={items.join("\n")} />

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-2 px-3 py-3 text-[11px] text-dim">
          Nothing added yet — each condition becomes a checkable line in your playbook.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="group flex items-start gap-2.5 rounded-lg border border-line bg-panel-2/40 px-3 py-2"
            >
              <span className={`num mt-0.5 text-[10px] font-semibold ${accent}`}>{String(index + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-xs leading-relaxed text-fg/90">{item}</span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${item}`}
                className="rounded p-0.5 text-dim opacity-70 transition-colors hover:text-down group-hover:opacity-100"
              >
                <Icon name="down" size={13} className="rotate-45" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="field h-9 flex-1"
        />
        <button type="button" onClick={add} className="btn-ghost h-9 px-3 text-xs">
          <Icon name="plus" size={14} />Add
        </button>
      </div>
    </div>
  );
}
