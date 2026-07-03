import { redirect } from "next/navigation";
import { getChannels, getCurrentProfile } from "@/lib/data";
import { Sidebar } from "@/components/app/sidebar";

// Shared shell for every signed-in page: sidebar on the left, content on the right.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Strip the lock-code hash before it ever reaches the client — the sidebar
  // only needs to know whether a channel IS locked, not the hash itself.
  const channels = (await getChannels()).map(({ lock_code_hash, ...c }) => ({
    ...c,
    locked: !!lock_code_hash,
  }));

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar profile={profile} channels={channels} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
