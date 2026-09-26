"use client";

import { useEffect, useRef, useState } from "react";
import { IconMic } from "@/components/ui/Icons";

/** Dictate into a composer with the browser's speech recognition. Renders nothing where it isn't supported. */
export default function VoiceButton({ onText, className = "icon-btn" }: { onText: (text: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    r.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text.trim()) onTextRef.current(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    return () => r.abort();
  }, []);

  if (!supported) return null;
  return (
    <button
      type="button"
      className={`${className} voice${listening ? " listening" : ""}`}
      title={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      onClick={() => {
        if (listening) rec.current?.stop();
        else {
          try {
            rec.current?.start();
            setListening(true);
          } catch {}
        }
      }}
    >
      <IconMic size={16} />
    </button>
  );
}
