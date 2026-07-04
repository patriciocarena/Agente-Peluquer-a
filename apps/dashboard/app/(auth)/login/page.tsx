/**
 * app/(auth)/login/page.tsx — Card de login centrada (AUTH-01),
 * per 02-UI-SPEC.md §Layout ("Login: la Card centrada de login es el sole
 * focal point") + §Copywriting Contract.
 *
 * react-hook-form + zodResolver para UX client-side (onBlur); la Server
 * Action `signIn` re-valida con el mismo schema y es la fuente de verdad.
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { signIn } from "@/app/actions/auth";
import { signInSchema, type SignInInput } from "@/lib/schemas/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  function onSubmit(values: SignInInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="mt-16 w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError ? (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={isPending}>
                Iniciar sesión
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
