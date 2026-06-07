"use client";

import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { getSignedUrl } from "@/lib/upload";

// Renders a single attachment: an inline preview for images, a link otherwise.
export function AttachmentView({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = (attachment.mime_type ?? "").startsWith("image/");

  useEffect(() => {
    let active = true;
    getSignedUrl(attachment.storage_path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [attachment.storage_path]);

  if (isImage) {
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url ?? undefined}
          alt={attachment.file_name}
          className="max-h-64 w-auto rounded-md border border-border object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent"
    >
      <FileText className="h-4 w-4" />
      <span className="max-w-[200px] truncate">{attachment.file_name}</span>
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
    </a>
  );
}
