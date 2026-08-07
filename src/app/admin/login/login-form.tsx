"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginPhase = "credentials" | "totp";

interface LoginFormProps {
  setupJustCompleted: boolean;
}

export function LoginForm({ setupJustCompleted }: LoginFormProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<LoginPhase>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function goToAdmin(): void {
    router.push("/admin");
    router.refresh();
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    const signInResult = await authClient.signIn.email({ email, password });
    if (signInResult.error) {
      setErrorMessage(signInResult.error.message ?? "Sign-in failed");
      setIsSubmitting(false);
      return;
    }
    const requiresTotp =
      typeof signInResult.data === "object" &&
      signInResult.data !== null &&
      "twoFactorRedirect" in signInResult.data;
    if (requiresTotp) {
      setPhase("totp");
      setIsSubmitting(false);
      return;
    }
    goToAdmin();
  }

  async function submitTotp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    const verifyResult = await authClient.twoFactor.verifyTotp({ code: totpCode });
    if (verifyResult.error) {
      setErrorMessage(verifyResult.error.message ?? "Invalid code");
      setIsSubmitting(false);
      return;
    }
    goToAdmin();
  }

  if (phase === "totp") {
    return (
      <form onSubmit={submitTotp}>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Two-factor authentication</CardTitle>
            <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="totpCode">Code</Label>
            <Input
              id="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              required
            />
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            {setupJustCompleted
              ? "Setup complete — sign in with your new owner account."
              : "Sign in to manage your shop."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
