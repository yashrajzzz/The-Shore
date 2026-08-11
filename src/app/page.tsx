import Link from "next/link";
import { Window } from "@/components/ui/Window";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      {/* Background decoration matching prototype */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-5 mix-blend-multiply bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] bg-[size:3px_3px]"></div>
      
      <div className="relative z-10 w-full max-w-md">
        <Window title="The Shore — welcome">
          <div className="p-8 flex flex-col items-center text-center gap-6">
            <h1 className="font-pixel text-4xl">Join the Vibe</h1>
            <p className="text-sm text-ink-soft">
              Listen to music in sync with up to 10 friends. Custom backgrounds, real-time chat, and shared queues.
            </p>
            
            <div className="flex gap-4 w-full mt-4">
              <Link href="/login" className="flex-1">
                <Button variant="primary" className="w-full py-3 text-sm">
                  Log In
                </Button>
              </Link>
              <Link href="/login" className="flex-1">
                <Button variant="secondary" className="w-full py-3 text-sm text-ink border-[2px] hover:bg-cream">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </Window>
        
        <p className="mt-8 text-center text-[10px] text-ink-soft">
          prototype — The Shore · rooms cap at 10 listeners · v0.1
        </p>
      </div>
    </div>
  );
}
