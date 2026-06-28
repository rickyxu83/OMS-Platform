import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface ErrorToastProps {
  message?: string;
  enabled?: boolean;
}

export function ErrorToast({ message, enabled = true }: ErrorToastProps) {
  const lastMessageRef = useRef("");

  useEffect(() => {
    const text = String(message || "").trim();
    if (!text || !enabled) {
      if (!text) lastMessageRef.current = "";
      return;
    }
    if (lastMessageRef.current === text) return;
    lastMessageRef.current = text;
    toast.error(text);
  }, [enabled, message]);

  return null;
}
