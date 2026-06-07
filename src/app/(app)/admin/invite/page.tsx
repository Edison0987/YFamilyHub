import { redirect } from "next/navigation";
import { getCurrentProfile, getProfiles } from "@/lib/data";
import { InviteForm } from "@/components/app/invite-form";
import { Badge } from "@/components/ui/badge";

export default async function InvitePage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") redirect("/");

  const members = await getProfiles();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-semibold">Invite members</h2>
        <p className="text-sm text-muted-foreground">
          Create an account for a family member. They sign in with the email + temporary password you set.
        </p>
      </header>

      <div className="grid gap-8 p-6 lg:grid-cols-2">
        <InviteForm />

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Current members
          </h3>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-sm">{m.full_name}</span>
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
