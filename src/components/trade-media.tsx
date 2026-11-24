import { Icon } from "./icons";

/** Attached chart screenshot / setup picture, click to view full size. */
export function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-panel-2">
      <a href={src} target="_blank" rel="noopener noreferrer" className="group block">
        {/* Uploaded files are served unoptimized from /api/uploads with immutable caching. */}
        {/* contain: a chart must never be cropped at the edges. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="h-[196px] w-full bg-panel-2 object-contain transition-opacity group-hover:opacity-90" />
      </a>
      <figcaption className="flex items-center justify-between border-t border-line bg-white px-3 py-2">
        <span className="text-[10px] text-muted">{caption}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-link text-[10px]">
          View full size
          <Icon name="arrow" size={11} />
        </a>
      </figcaption>
    </figure>
  );
}

/** Shortcut to the live chart stored on the trade. */
export function TradingViewCard({ url }: { url: string }) {
  let host = "chart link";
  let label = url;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "");
    label = parsed.pathname && parsed.pathname !== "/" ? `${parsed.pathname}${parsed.search}` : parsed.hostname;
  } catch {
    /* keep the raw string */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full min-h-[96px] items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-4 transition-colors hover:border-brand/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#131722] text-white">
          <Icon name="chart" size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Open in {host}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted">{label}</span>
        </span>
      </span>
      <Icon name="link" size={16} className="shrink-0 text-muted transition-colors group-hover:text-brand" />
    </a>
  );
}

export function Placeholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-[196px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 bg-panel-2/40 px-6 text-center">
      <Icon name="image" size={22} className="text-dim" />
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-[10px] leading-relaxed text-dim">{hint}</span>
    </div>
  );
}
