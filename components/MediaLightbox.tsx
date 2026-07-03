"use client";

import { useEffect } from "react";
import type { MessageDTO } from "@/types";
import { isVideoFile } from "@/lib/format";

/** Görsel ve videoları sohbet içinde pop-up olarak gösteren lightbox. */
export default function MediaLightbox({
  message,
  onClose,
}: {
  message: MessageDTO;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!message.fileUrl) return null;
  const isVideo = message.type === "file" && isVideoFile(message.fileName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        title="Kapat"
        className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full text-2xl text-white hover:opacity-70"
        style={{ background: "rgba(0,0,0,0.4)" }}
      >
        ✕
      </button>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full items-center justify-center">
        {isVideo ? (
          <video
            src={message.fileUrl}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[90vw] rounded-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.fileUrl}
            alt={message.fileName ?? "resim"}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}
