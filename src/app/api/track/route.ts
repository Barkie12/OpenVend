import { z } from "zod";

import { recordPageView } from "@/lib/analytics";
import { getRequestContext } from "@/lib/fraud";
import { consumeRateLimit } from "@/lib/rate-limit";

const TRACK_RATE_LIMIT = 60;
const TRACK_RATE_WINDOW_MS = 60_000;

const trackSchema = z.object({
  path: z.string().min(1).max(500),
  sessionId: z.string().min(8).max(64),
  referrer: z.string().max(1000).nullable(),
  utmSource: z.string().max(200).nullable(),
  utmMedium: z.string().max(200).nullable(),
  utmCampaign: z.string().max(200).nullable(),
});

/** Public pageview beacon. Always answers 204 — analytics must never break the storefront. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getRequestContext();
    const rateLimitKey = `track:${context.ipAddress ?? "unknown"}`;
    if (!consumeRateLimit({ key: rateLimitKey, limit: TRACK_RATE_LIMIT, windowMs: TRACK_RATE_WINDOW_MS })) {
      return new Response(null, { status: 204 });
    }

    const parsed = trackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response(null, { status: 204 });
    }

    await recordPageView({
      path: parsed.data.path,
      sessionId: parsed.data.sessionId,
      referrer: parsed.data.referrer,
      utmSource: parsed.data.utmSource,
      utmMedium: parsed.data.utmMedium,
      utmCampaign: parsed.data.utmCampaign,
      context,
    });
  } catch (trackError) {
    console.warn("[analytics] pageview ingestion failed", trackError);
  }
  return new Response(null, { status: 204 });
}
