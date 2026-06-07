"use client";

import { useRef, useState } from "react";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { sendMessage } from "@/lib/actions";
import { uploadFile } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  channelId,
  parentId = null,
  currentUserId,
  placeholder = "Write a message…",
  onOptimisticSend,
}: {
  channelId: string;
  parentId?: string | null;
  currentUserId: string;
  placeholder?: string;
  // When provided, the parent handles upload + send (used for instant,
  // optimistic rendering). The composer just clears the input immediately.
  onOptimisticSend?: (args: { body: string; files: File[] }) => void;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (busy) return;
    if (!body.trim() && files.length === 0) return;

    // Optimistic path: hand off to the parent and clear the input instantly,
    // so the message shows up immediately (like Messenger).
    if (onOptimisticSend) {
      onOptimisticSend({ body, files });
      setBody("");
      setFiles([]);
      setError(null);
      return;
    }

    // Direct path (used by the thread reply box): upload + send, then clear.
    setBusy(true);
    setError(null);
    try {
      // 1. Upload any attachments to Supabase Storage from the browser.
      const attachments = [];
      for (const file of files) {
        attachments.push(await uploadFile(file, channelId, currentUserId));
      }
      // 2. Save the message (+ attachment rows) via a server action.
      await sendMessage({ channelId, parentId, body, attachments });
      setBody("");
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a new line.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border bg-card p-3">
      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs"
            >
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} aria-label="Remove file">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Attach files"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-none"
        />

        <Button onClick={submit} disabled={busy} size="icon" aria-label="Send">
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
