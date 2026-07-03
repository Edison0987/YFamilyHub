"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { Channel, MessageWithMeta, Profile } from "@/lib/types";
import { unlockChannel } from "@/lib/actions";
import { ChannelView } from "@/components/app/channel-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Shown instead of ChannelView for a locked channel. Requires the correct
// code EVERY time it's opened — nothing about the unlock persists.
export function ChannelLockGate({
  channelId,
  channelName,
  currentProfile,
}: {
  channelId: string;
  channelName: string;
  currentProfile: Profile;
}) {
  const [unlocked, setUnlocked] = useState<{
    channel: Channel;
    messages: MessageWithMeta[];
    profiles: Profile[];
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const data = await unlockChannel(channelId, code);
      setUnlocked(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock.");
    } finally {
      setPending(false);
    }
  }

  if (unlocked) {
    return (
      <ChannelView
        channel={unlocked.channel}
        initialMessages={unlocked.messages}
        currentProfile={currentProfile}
        profiles={unlocked.profiles}
      />
    );
  }

  return (
    <div className="flex h-full flex-1 items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">#{channelName} is protected</h2>
          <p className="text-sm text-muted-foreground">Enter the access code to continue.</p>
        </div>
        <Input
          type="password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
