"use client";

import { avatarColor, initials as getInitials } from "@/lib/avatarColor";

export default function Avatar({
  src,
  name,
  size = 40,
  online,
  shape = "circle",
}: {
  src?: string | null;
  name: string;
  size?: number;
  online?: boolean;
  shape?: "circle" | "square";
}) {
  const radius = shape === "square" ? "30%" : "50%";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <div
          className="flex size-full items-center justify-center font-semibold text-white"
          style={{ fontSize: size * 0.38, borderRadius: radius, background: avatarColor(name) }}
        >
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className="absolute right-0 bottom-0 block size-3 rounded-full border-2"
          style={{
            background: online ? "#3aa06a" : "var(--muted)",
            borderColor: "var(--panel)",
          }}
        />
      )}
    </div>
  );
}
