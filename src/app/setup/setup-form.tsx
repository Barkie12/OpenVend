"use client";

import { useActionState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { completeSetup, type SetupFormState } from "./actions";

const INITIAL_STATE: SetupFormState = { error: null };

interface SetupFormProps {
  currencies: readonly string[];
}

export function SetupForm({ currencies }: SetupFormProps) {
  const [formState, formAction, isPending] = useActionState(completeSetup, INITIAL_STATE);

  return (
    <form action={formAction}>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Set up your shop</CardTitle>
          <CardDescription>
            One-time setup: name your shop and create the owner account you will sign in with.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop name</Label>
              <Input id="shopName" name="shopName" placeholder="Nebula Keys" required minLength={2} maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue={currencies[0]}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminName">Your name</Label>
              <Input id="adminName" name="adminName" placeholder="Jane Doe" required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email</Label>
              <Input id="adminEmail" name="adminEmail" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                name="adminPassword"
                type="password"
                required
                minLength={10}
                maxLength={128}
                placeholder="At least 10 characters"
              />
            </div>
          </div>
          {formState.error ? <p className="text-sm text-destructive">{formState.error}</p> : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating shop…" : "Create shop"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
