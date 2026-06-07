"use client";

import { createClient } from "@/lib/supabase/client";
import type { NewAttachment } from "@/lib/actions";

/**
 * Upload a single file to the private "attachments" storage bucket and return
 * the metadata needed to save an attachment row.
 */
export async function uploadFile(file: File, channelId: string, userId: string): Promise<NewAttachment> {
  const supabase = createClient();

  // Keep the original name but prefix a unique, path-safe key.
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${channelId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await supabase.storage.from("attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
}

/** Create a temporary signed URL to view/download a private attachment. */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from("attachments").createSignedUrl(storagePath, 60 * 60);
  return data?.signedUrl ?? null;
}
