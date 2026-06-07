"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function InviteForm() {
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      try {
        await inviteUser(formData);
        setResult({ ok: true, msg: "Member created. Share the email + temporary password with them." });
      } catch (e) {
        setResult({ ok: false, msg: e instanceof Error ? e.message : "Failed to invite." });
      }
    });
  }

  return (
    <form
      action={(fd) => onSubmit(fd)}
      className="max-w-md space-y-4"
      // Reset fields after a successful submit.
      key={result?.ok ? Math.random() : "form"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" placeholder="Jane Doe" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="jane@example.com" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="text" placeholder="min 6 characters" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
      </div>

      {result ? (
        <p className={`text-sm ${result.ok ? "text-emerald-400" : "text-red-400"}`}>{result.msg}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create member"}
      </Button>
    </form>
  );
}
