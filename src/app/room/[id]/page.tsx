import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import RoomClient from "./RoomClient";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/room/${id}`);
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !room) {
    redirect('/lobby');
  }

  // Set the room as active
  await supabase.from('rooms').update({ last_active_at: new Date().toISOString() }).eq('id', room.id);

  return (
    <RoomClient room={room} user={user} />
  );
}
