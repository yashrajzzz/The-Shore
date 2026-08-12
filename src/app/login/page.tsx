'use client';
import { Window } from "@/components/ui/Window";
import { Button } from "@/components/ui/Button";
import { login, signup } from "./actions";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";

function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [signupSuccess, setSignupSuccess] = useState(false);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/lobby';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setSignupSuccess(false);

    startTransition(async () => {
      if (isLogin) {
        const result = await login(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        // Hard navigation so the browser picks up the session cookie
        window.location.href = redirectTo;
      } else {
        const result = await signup(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        if (result?.needsConfirmation) {
          setSignupSuccess(true);
          return;
        }
        // Auto-confirmed: navigate directly
        window.location.href = redirectTo;
      }
    });
  };

  if (signupSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="fixed inset-0 z-0 pointer-events-none opacity-5 mix-blend-multiply bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] bg-[size:3px_3px]"></div>

        <div className="relative z-10 w-full max-w-sm">
          <Window title="Authentication">
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-2 border-2 border-ink flex items-center justify-center shadow-[3px_3px_0_var(--color-ink)]">
                <CheckCircle2 size={28} className="text-ink" />
              </div>
              <h2 className="font-pixel text-2xl">Check Your Email!</h2>
              <p className="text-xs font-mono text-ink-soft leading-relaxed">
                We&apos;ve sent a confirmation link to your email address. Click the link to activate your account, then come back and log in.
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={() => { setSignupSuccess(false); setIsLogin(true); }}
                className="mt-2"
              >
                Back to Login
              </Button>
            </div>
          </Window>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-5 mix-blend-multiply bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] bg-[size:3px_3px]"></div>

      <div className="relative z-10 w-full max-w-sm">
        <Window title="Authentication">
          <div className="p-8">
            <h1 className="font-pixel text-2xl text-center mb-6">Enter The Shore</h1>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {!isLogin && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-ink-soft uppercase tracking-wider" htmlFor="display_name">Display Name</label>
                  <input
                    id="display_name"
                    name="display_name"
                    type="text"
                    required={!isLogin}
                    className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2"
                    placeholder="e.g. DJ Cool"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-soft uppercase tracking-wider" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2"
                  placeholder="you@example.com"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-soft uppercase tracking-wider" htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2"
                  placeholder="••••••••"
                />
                {!isLogin && (
                  <span className="text-[9px] text-ink-soft/60 font-mono mt-0.5">Minimum 6 characters</span>
                )}
              </div>

              {error && (
                <div className="bg-pink border-2 border-ink p-2 mt-2 rounded text-xs text-center font-mono">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                {isLogin ? (
                  <>
                    <Button type="submit" variant="primary" disabled={isPending} className="flex-1">
                      {isPending ? 'Logging In...' : 'Log In'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setIsLogin(false); setError(null); }} className="flex-1 border-[2px] text-ink hover:bg-cream py-2 px-0 text-[12px]">
                      Create Account
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="submit" variant="primary" disabled={isPending} className="flex-1">
                      {isPending ? 'Signing Up...' : 'Sign Up'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setIsLogin(true); setError(null); }} className="flex-1 border-[2px] text-ink hover:bg-cream py-2 px-0 text-[12px]">
                      Back to Login
                    </Button>
                  </>
                )}
              </div>
            </form>
          </div>
        </Window>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm font-mono text-ink-soft animate-pulse">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
