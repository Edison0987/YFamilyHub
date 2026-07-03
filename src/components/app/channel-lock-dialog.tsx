"use client";

import { useState, useTransition } from "react";
import { Lock, Unlock } from "lucide-react";
import { setChannelLock } from "@/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChannelLockDialog({
  channelId,
  channelName,
  locked,
}: {
  channelId: string;
  channelName: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setChannelLock(channelId, code);
        setOpen(false);
        setCode("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update.");
      }
    });
  }

  function removeLock() {
    setError(null);
    startTransition(async () => {
      try {
        await setChannelLock(channelId, "");
        setOpen(false);
        setCode("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label={locked ? "Change access code" : "Add access code"}
          className="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {locked ? "Change" : "Set"} access code for #{channelName}
          </DialogTitle>
          <DialogDescription>
            Anyone opening this channel will need to enter this code, every time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lock-code">New code</Label>
            <Input
              id="lock-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 1234"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex items-center justify-between gap-2">
            {locked ? (
              <Button type="button" variant="outline" onClick={removeLock} disabled={pending}>
                Remove lock
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" onClick={save} disabled={pending || !code.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
