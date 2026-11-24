import { readFile } from "fs/promises";
import path from "path";
import { isSafeUploadFilename, mimeForFilename, storageConfig, UPLOAD_DIR } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Streams chart / setup images from Supabase Storage (hosted) or local disk (dev). */
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!isSafeUploadFilename(name)) return new Response("Not found", { status: 404 });

  const headers = {
    "Content-Type": mimeForFilename(name),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };

  const cfg = storageConfig();
  if (cfg) {
    const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${name}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    });
    if (!res.ok) return new Response("Not found", { status: 404 });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return new Response(bytes, { headers });
  }

  try {
    const file = await readFile(path.join(UPLOAD_DIR, name));
    return new Response(new Uint8Array(file), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
