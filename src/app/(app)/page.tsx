import { redirect } from "next/navigation";
import { getChannels } from "@/lib/data";

// Landing route: send the user to the first channel, or show an empty state.
export default async function Home() {
  const channels = await getChannels();
  if (channels.length > 0) redirect(`/channels/${channels[0].id}`);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold">Welcome to Family Hub 👋</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        No channels yet. An admin can create the first channel using the + button in the sidebar.
      </p>
    </div>
  );
}
