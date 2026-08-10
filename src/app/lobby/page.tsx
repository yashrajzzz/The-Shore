import { Window } from "@/components/ui/Window";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CreateRoomModal } from "@/components/ui/CreateRoomModal";
import { ClosableWindow } from "@/components/ui/ClosableWindow";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ hide?: string }>;
}) {
  const { hide } = await searchParams;
  const isHidden = hide === 'true';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .order('created_at', { ascending: false });

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0];

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-5 mix-blend-multiply bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] bg-[size:3px_3px]"></div>
      
      <div className="relative z-10 w-full max-w-4xl mt-12">
        {!isHidden ? (
          <ClosableWindow title="My Rooms">
            <div className="p-8 min-h-[400px]">
              <div className="flex justify-between items-center mb-8 border-b-[2.5px] border-ink pb-4">
                <div>
                  <h1 className="font-pixel text-3xl mb-1">Hello, {displayName}!</h1>
                  <p className="text-sm text-ink-soft">Join a room or start your own vibe.</p>
                </div>
                <CreateRoomModal />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms && rooms.length > 0 ? rooms.map((room) => (
                  <Link href={`/room/${room.id}`} key={room.id}>
                    <div className="h-full bg-cream/80 backdrop-blur-sm border-2 border-ink rounded-xl p-4 shadow-[4px_4px_0_var(--color-ink)] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[5px_5px_0_var(--color-ink)] transition-all cursor-pointer">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-2">
                          <span className="w-3 h-3 rounded-full border-[1.5px] border-ink bg-teal-3 block" />
                          <span className="w-3 h-3 rounded-full border-[1.5px] border-ink bg-coral block" />
                        </div>
                        <span className="text-[10px] bg-paper border border-ink px-2 py-0.5 rounded-full">Active</span>
                      </div>
                      <h3 className="font-pixel text-xl mb-1">{room.name}</h3>
                      <p className="text-xs text-ink-soft line-clamp-1">
                        {room.background_urls && room.background_urls.length > 0 ? `${room.background_urls.length} Slideshow Backgrounds` : 'Standard room'}
                      </p>
                    </div>
                  </Link>
                )) : (
                  <div className="col-span-full flex items-center justify-center p-12 text-ink-soft border-2 border-dashed border-ink-soft rounded-xl">
                    <p className="font-mono text-sm">No active rooms right now. Be the first!</p>
                  </div>
                )}
              </div>
            </div>
          </ClosableWindow>
        ) : (
          <div className="flex justify-center mt-32">
            <Link href="/lobby">
              <div className="bg-paper/40 backdrop-blur-md px-6 py-4 rounded-xl border-2 border-ink shadow-[4px_4px_0_var(--color-ink)] text-center cursor-pointer hover:-translate-y-1 transition-all">
                <p className="font-pixel text-xl text-ink">Enjoy the view!</p>
                <p className="text-xs mt-2 text-ink-soft font-mono">Click anywhere here to reopen your rooms</p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
