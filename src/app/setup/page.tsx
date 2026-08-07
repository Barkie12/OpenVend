import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SUPPORTED_CURRENCIES, getSetupState, isSetupComplete } from "@/lib/shop";

import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setup - OpenVend",
};

export default async function SetupPage() {
  const setupState = await getSetupState();
  if (isSetupComplete(setupState)) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SetupForm currencies={SUPPORTED_CURRENCIES} />
    </main>
  );
}
