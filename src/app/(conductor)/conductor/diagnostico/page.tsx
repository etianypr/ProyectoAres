"use client";

// Diagnóstico de la APK (spec 015): qué funciones nativas tiene este teléfono y un
// botón para probar el escáner. Se llega desde el menú lateral, solo en la APK.
// No guarda nada: lo que muestra se lee al abrir la pantalla.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { esApp, versionInstalada } from "@/lib/nativo/entorno";
import { permisosTelefono } from "@/lib/nativo/telefono";
import { escanearCodigo } from "@/lib/nativo/escaner";

type Estado = "si" | "no" | "pendiente";

type Info = {
  app: boolean;
  version: string | null;
  llamadas: Estado;
  registro: Estado;
  ubicacion: Estado;
};

function estadoDe(permiso: string | undefined): Estado {
  if (permiso === "granted") return "si";
  if (permiso === "denied") return "no";
  return "pendiente";
}

function Fila({ etiqueta, estado, detalle }: { etiqueta: string; estado: Estado; detalle?: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      {estado === "si" ? (
        <Check className="h-4 w-4 shrink-0 text-ok" aria-label="Sí" />
      ) : estado === "no" ? (
        <X className="h-4 w-4 shrink-0 text-danger" aria-label="No" />
      ) : (
        <Minus className="h-4 w-4 shrink-0 text-muted" aria-label="Sin decidir" />
      )}
      <span className="min-w-0 flex-1">{etiqueta}</span>
      {detalle ? <span className="shrink-0 text-xs text-muted">{detalle}</span> : null}
    </li>
  );
}

export default function DiagnosticoPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [lectura, setLectura] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);

  useEffect(() => {
    void (async () => {
      const [version, telefono] = await Promise.all([versionInstalada(), permisosTelefono()]);
      // En la APK lo dice el plugin (el WebView no trae navigator.permissions).
      const ubicacion =
        telefono?.ubicacion ??
        (await navigator.permissions
          ?.query({ name: "geolocation" })
          .then((r) => r.state)
          .catch(() => undefined));
      setInfo({
        app: esApp(),
        version,
        llamadas: estadoDe(telefono?.llamadas),
        registro: estadoDe(telefono?.registro),
        ubicacion: estadoDe(ubicacion),
      });
    })();
  }, []);

  async function probarEscaner() {
    setEscaneando(true);
    setLectura(null);
    const codigo = await escanearCodigo();
    setLectura(codigo ?? "Sin lectura (cancelado o sin escáner)");
    setEscaneando(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/conductor/encomiendas" className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ArrowLeft className="h-4 w-4" />
        Volver a la ruta
      </Link>
      <h1 className="text-lg font-semibold">Diagnóstico de la app</h1>

      {info ? (
        <ul className="divide-y divide-divider rounded-2xl bg-card shadow-soft">
          <Fila etiqueta="App instalada (APK)" estado={info.app ? "si" : "no"} detalle={info.version ?? undefined} />
          <Fila etiqueta="Llamar con un toque" estado={info.llamadas} />
          <Fila etiqueta="Saber si contestó (registro de llamadas)" estado={info.registro} />
          <Fila etiqueta="Ubicación" estado={info.ubicacion} />
        </ul>
      ) : (
        <p className="text-sm text-muted">Revisando…</p>
      )}

      <p className="text-xs text-muted">
        Los permisos sin decidir se piden la primera vez que se usan. Un permiso negado se cambia en
        Ajustes → Apps → ARES → Permisos.
      </p>

      <button
        type="button"
        disabled={escaneando || !info?.app}
        onClick={() => void probarEscaner()}
        className={cn(
          "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:opacity-50",
        )}
      >
        <ScanLine className="h-4 w-4" />
        {escaneando ? "Escaneando…" : "Probar escáner"}
      </button>
      {lectura ? (
        <p className="break-all rounded-2xl bg-card px-4 py-3 font-mono text-sm shadow-soft">{lectura}</p>
      ) : null}
    </div>
  );
}
