import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth, type AdminSession } from "@/lib/auth";

export async function getAdminSession(): Promise<AdminSession | null> {
  return getAuth().api.getSession({ headers: await headers() });
}

/** Gate for admin pages and actions; redirects to the login page when signed out. */
export async function requireAdminSession(): Promise<AdminSession> {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    redirect("/admin/login");
  }
  return adminSession;
}
