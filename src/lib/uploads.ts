import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * When Supabase credentials are present (e.g. on Vercel) images live in a
 * Supabase Storage bucket; locally they fall back to disk. The public URL stays
 * `/api/uploads/<name>` either way — the route proxies from Storage when enabled.
 */
export function storageConfig(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key, bucket: process.env.SUPABASE_UPLOAD_BUCKET ?? "journal-uploads" };
}

function storageHeaders(cfg: { key: string }, mime?: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
  if (mime) headers["Content-Type"] = mime;
  return headers;
}

const MAX_LABEL = "5MB";
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;
export const UPLOAD_ACCEPT = ACCEPTED.join(",");

type Matcher = { ext: string; mime: string; magic: (b: Buffer) => boolean };

const TYPES: Record<string, Matcher> = {
  "image/png": { ext: "png", mime: "image/png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": {
    ext: "webp",
    mime: "image/webp",
    magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
};

const FILENAME_SAFE = /^[a-zA-Z0-9._-]{1,80}$/;

export function mimeForFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return TYPES["image/png"].mime;
  if (ext === "jpg" || ext === "jpeg") return TYPES["image/jpeg"].mime;
  if (ext === "webp") return TYPES["image/webp"].mime;
  return "application/octet-stream";
}

/** Validates and stores a chart / setup image. Returns its public URL or an error. */
export async function saveUpload(file: File | null | undefined): Promise<{ url: string } | { error: string }> {
  if (!file || typeof file.size !== "number" || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: `Images must be ${MAX_LABEL} or smaller.` };

  const declared = file.type;
  const matcher = TYPES[declared];
  if (!matcher) return { error: "Use a PNG, JPEG or WebP image." };

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matcher.magic(bytes)) return { error: "That file does not look like a valid image." };

  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${matcher.ext}`;
  const cfg = storageConfig();
  if (cfg) {
    const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${name}`, {
      method: "POST",
      headers: storageHeaders(cfg, matcher.mime),
      body: new Uint8Array(bytes),
    });
    if (!res.ok) return { error: "Could not store the image. Try again." };
    return { url: `/api/uploads/${name}` };
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), bytes, { flag: "wx" });
  return { url: `/api/uploads/${name}` };
}

/** Only images stored by this app can be deleted — never arbitrary paths. */
export async function removeUpload(url: string | null | undefined): Promise<void> {
  if (!isUploadUrl(url)) return;
  const name = (url as string).replace("/api/uploads/", "");
  if (!FILENAME_SAFE.test(name)) return;
  const cfg = storageConfig();
  if (cfg) {
    await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${name}`, {
      method: "DELETE",
      headers: storageHeaders(cfg),
    }).catch(() => {});
    return;
  }
  try {
    await unlink(path.join(UPLOAD_DIR, name));
  } catch {
    /* already gone */
  }
}

export function isUploadUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("/api/uploads/") && FILENAME_SAFE.test(url.replace("/api/uploads/", ""));
}

export function isSafeUploadFilename(name: string): boolean {
  return FILENAME_SAFE.test(name) && !name.includes("..");
}

/** http(s) links only, and short enough to render safely. */
export function normalizeChartLink(raw: string): { url?: string; error?: string } {
  const value = raw.trim();
  if (!value) return { url: undefined };
  if (value.length > 500) return { error: "That link is too long — keep it under 500 characters." };
  if (!/^https?:\/\/[^\s<>"']+$/i.test(value)) return { error: "Paste a valid link to your chart (it must start with http:// or https://)." };
  return { url: value };
}
