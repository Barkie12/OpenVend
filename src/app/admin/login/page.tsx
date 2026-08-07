import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/session";
import { getSetupState, isSetupComplete } from "@/lib/shop";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in - OpenVend",
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const setupState = await getSetupState();
  if (!isSetupComplete(setupState)) {
    redirect("/setup");
  }

  const adminSession = await getAdminSession();
  if (adminSession) {
    redirect("/admin");
  }

  const resolvedSearchParams = await searchParams;
  const setupJustCompleted = resolvedSearchParams.setup === "complete";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm setupJustCompleted={setupJustCompleted} />
    </main>
  );
}
