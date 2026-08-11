'use client';
import { Window } from "@/components/ui/Window";
import { Button } from "@/components/ui/Button";
import { login, signup } from "./actions";
import { useState, Suspense } from "react";

import { useSearchParams } from "next/navigation";

function LoginInner({ isLogin, setIsLogin }: { isLogin: boolean; setIsLogin: (v: boolean) => void }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-5 mix-blend-multiply bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] bg-[size:3px_3px]"></div>
      
      <div className="relative z-10 w-full max-w-sm">
        <Window title="Authentication">
          <div className="p-8">
            <h1 className="font-pixel text-2xl text-center mb-6">Enter The Shore</h1>
            
            <form className="flex flex-col gap-4">
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
                  className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-pink border-2 border-ink p-2 mt-2 rounded text-xs text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                {isLogin ? (
                  <>
                    <Button variant="primary" formAction={login} className="flex-1">
                      Log In
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setIsLogin(false)} className="flex-1 border-[2px] text-ink hover:bg-cream py-2 px-0 text-[12px]">
                      Create Account
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" formAction={signup} className="flex-1">
                      Sign Up
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setIsLogin(true)} className="flex-1 border-[2px] text-ink hover:bg-cream py-2 px-0 text-[12px]">
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
  const [isLogin, setIsLogin] = useState(true);

  return (
    <Suspense fallback={null}>
      <LoginInner isLogin={isLogin} setIsLogin={setIsLogin} />
    </Suspense>
  );
}
