"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { actualizarFotoChofer } from "./actions";
import { ChoferAvatar } from "@/components/ui/avatar";

export function FotoUploader({
  choferId,
  fotoUrl,
  nombre,
}: {
  choferId: string;
  fotoUrl?: string | null;
  nombre: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(fotoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vista previa inmediata en cualquier modo.
    setSrc(URL.createObjectURL(file));
    setMsg("");

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `choferes/${choferId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fotos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("fotos").getPublicUrl(path);
      const fd = new FormData();
      fd.set("id", choferId);
      fd.set("foto_url", data.publicUrl);
      await actualizarFotoChofer(fd);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <ChoferAvatar src={src} name={nombre} size={80} />

      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs text-white">
          …
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-foreground shadow ring-2 ring-white transition-colors hover:bg-brand-dark"
        title="Cambiar foto"
        aria-label="Cambiar foto"
      >
        <Camera className="h-3.5 w-3.5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
      />

      {msg ? (
        <p className="absolute left-1/2 top-full mt-1 w-40 -translate-x-1/2 text-center text-[11px] text-muted">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
