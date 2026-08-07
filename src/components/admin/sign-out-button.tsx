"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground"
      onClick={handleSignOut}
      disabled={isSigningOut}
    >
      <LogOut className="size-4" />
      {isSigningOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
