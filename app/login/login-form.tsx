"use client";

import { useActionState, useState } from "react";
import { CandlestickChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ allowSignup }: { allowSignup: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(signIn, {});
  const [registerState, registerAction, registerPending] = useActionState<AuthState, FormData>(
    signUp,
    {},
  );

  const isLogin = mode === "login";
  const state = isLogin ? loginState : registerState;
  const pending = isLogin ? loginPending : registerPending;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CandlestickChart className="size-6" />
          </div>
          <CardTitle className="text-2xl">Trading Hub</CardTitle>
          <CardDescription>
            {isLogin ? "Melde dich an, um fortzufahren" : "Lege deinen Zugang an"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={isLogin ? loginAction : registerAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
              />
            </div>

            {state.error && <p className="text-sm text-loss">{state.error}</p>}
            {state.message && <p className="text-sm text-profit">{state.message}</p>}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Bitte warten …" : isLogin ? "Anmelden" : "Registrieren"}
            </Button>
          </form>

          {allowSignup && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Noch kein Zugang?" : "Schon registriert?"}{" "}
              <button
                type="button"
                onClick={() => setMode(isLogin ? "register" : "login")}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {isLogin ? "Registrieren" : "Anmelden"}
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
