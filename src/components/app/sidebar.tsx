"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, Repeat, UserPlus, LogOut } from "lucide-react";
import type { Channel, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions";
import { CreateChannelDialog } from "@/components/app/create-channel-dialog";

export function Sidebar({ profile, channels }: { profile: Profile; channels: Channel[] }) {
  const pathname = usePathname();
  const isAdmin = profile.role === "admin";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* Workspace header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="font-bold leading-tight">Family Hub</h1>
          <p className="text-xs text-muted-foreground">
            {profile.full_name} · {profile.role}
          </p>
        </div>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </span>
          {isAdmin ? <CreateChannelDialog /> : null}
        </div>

        <nav className="space-y-0.5">
          {channels.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No channels yet{isAdmin ? " — create one above." : "."}
            </p>
          ) : (
            channels.map((c) => {
              const href = `/channels/${c.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={c.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </Link>
              );
            })
          )}
        </nav>
      </div>

      {/* Footer nav */}
      <div className="space-y-0.5 border-t border-border p-2">
        <Link
          href="/workflows"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            pathname.startsWith("/workflows")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Repeat className="h-4 w-4" />
          Workflows
        </Link>

        {isAdmin ? (
          <Link
            href="/admin/invite"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              pathname.startsWith("/admin")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <UserPlus className="h-4 w-4" />
            Invite members
          </Link>
        ) : null}

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
