import { notFound } from "next/navigation";
import { getChannel, getChannelMessages, getCurrentProfile, getProfiles } from "@/lib/data";
import { ChannelView } from "@/components/app/channel-view";
import { ChannelLockGate } from "@/components/app/channel-lock-gate";

// Server Component: load everything the channel needs, then hand off to the
// client component that adds realtime + interactivity.
export default async function ChannelPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params; // Next.js 16: params is async

  const [channel, profile] = await Promise.all([getChannel(id), getCurrentProfile()]);
  if (!channel || !profile) notFound();

  // Locked channels never fetch/ship messages until the code is verified —
  // the gate component fetches them itself, only after a correct code.
  if (channel.lock_code_hash) {
    return (
      <ChannelLockGate channelId={channel.id} channelName={channel.name} currentProfile={profile} />
    );
  }

  const [messages, profiles] = await Promise.all([getChannelMessages(id), getProfiles()]);

  return (
    <ChannelView
      channel={channel}
      initialMessages={messages}
      currentProfile={profile}
      profiles={profiles}
    />
  );
}
