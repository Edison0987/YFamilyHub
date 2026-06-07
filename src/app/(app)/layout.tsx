import { redirect } from "next/navigation";
import { getChannels, getCurrentProfile } from "@/lib/data";
import { Sidebar } from "@/components/app/sidebar";

// Shared shell for every signed-in page: sidebar on the left, content on the right.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const channels = await getChannels();

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar profile={profile} channels={channels} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
