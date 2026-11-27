"use client";

import { useMemo, useState } from "react";
import type { TradeTag } from "@/db/schema";
import { Icon } from "./icons";

/** Chip editor for trade tags. New names are created server-side on save. */
export function TagPicker({ allTags, selected }: { allTags: TradeTag[]; selected: string[] }) {
  const [names, setNames] = useState<string[]>(() => selected.slice(0, 12));
  const [query, setQuery] = useState("");
  const colours = useMemo(() => new Map(allTags.map((tag) => [tag.name.toLowerCase(), tag.color])), [allTags]);
  const selectedLower = new Set(names.map((name) => name.toLowerCase()));
  const suggestions = allTags
    .filter(
      (tag) =>
        !selectedLower.has(tag.name.toLowerCase()) &&
        (!query.trim() || tag.name.toLowerCase().includes(query.trim().toLowerCase())),
    )
    .slice(0, 8);

  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!name || names.length >= 12) return;
    if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setNames((current) => [...current, name]);
    }
    setQuery("");
  };

  const remove = (name: string) => setNames((current) => current.filter((item) => item !== name));

  return (
    <div>
      <input type="hidden" name="tags" value={names.join(",")} />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line-2 bg-white px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
        {names.map((name) => {
          const color = colours.get(name.toLowerCase()) ?? "#0781fe";
          return (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ backgroundColor: `${color}14`, color }}
            >
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                aria-label={`Remove ${name}`}
                className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
              >
                <Icon name="plus" size={10} className="rotate-45" />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(query);
            } else if (event.key === "Backspace" && !query && names.length > 0) {
              setNames((current) => current.slice(0, -1));
            }
          }}
          placeholder={names.length ? "Add another tag…" : "Type a tag and press Enter"}
          className="h-8 min-w-[150px] flex-1 border-0 bg-transparent px-1 text-xs text-fg outline-none placeholder:text-dim"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => {
            const active = tag.name.toLowerCase() === query.trim().toLowerCase();
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => add(tag.name)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                  active
                    ? "border-brand/40 bg-brand/7 text-brand"
                    : "border-line bg-panel-2 text-muted hover:border-brand/30 hover:text-fg"
                }`}
              >
                <Icon name="plus" size={10} />
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
