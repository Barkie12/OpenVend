import { getLiveVisitorCount } from "@/lib/analytics";
import { getAdminSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ count: await getLiveVisitorCount() });
}
