import { avatarColor, initials } from "@/lib/format";

// Simple initials avatar with a deterministic background color.
export function Avatar({ name, id, size = 36 }: { name: string | null; id: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md font-semibold uppercase text-white"
      style={{ width: size, height: size, backgroundColor: avatarColor(id), fontSize: size / 2.6 }}
    >
      {initials(name)}
    </div>
  );
}
