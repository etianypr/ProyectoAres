"use client";

// Diagnóstico de la APK (spec 015): qué funciones nativas tiene este teléfono, un
// botón para probar el escáner y otro para probar la lectura de una etiqueta
// (spec 021, US3). Se llega desde el menú lateral, solo en la APK. No guarda
// nada: lo que muestra se lee al abrir la pantalla. Las consultas del día a ORS
// (spec 024) sirven para ver cuánto gasta un día de ruta.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, FlaskConical, Minus, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { esApp, versionInstalada } from "@/lib/nativo/entorno";
import { permisosTelefono } from "@/lib/nativo/telefono";
import { escanearCodigo } from "@/lib/nativo/escaner";
import { entrarAlModoPrueba, esApkDePrueba, salirDelModoPrueba, useModoPrueba } from "@/lib/encomiendas/local/modo-prueba";
import { fijarConfigGps, useConfigGps, VELOCIDADES } from "@/lib/encomiendas/local/gps-simulado";
import { consultasOrsDeHoy, type ConsultasOrs } from "@/lib/geo/ors/cliente";
import { apagarRed, cargarRed, redApagada } from "@/lib/geo/red/grafo";
import { origenDelUltimoTrazado } from "@/lib/geo/ruta-por-calles";
import { ProbarBarridoNomina } from "./_componentes/probar-barrido-nomina";
import { ProbarEscanerVivo } from "./_componentes/probar-escaner-vivo";
import { ProbarEtiqueta } from "./_componentes/probar-etiqueta";
import { CintaModoPrueba } from "../encomiendas/_componentes/cinta-modo-prueba";

type Estado = "si" | "no" | "pendiente";

type Info = {
  app: boolean;
  version: string | null;
  llamadas: Estado;
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
  const [ors, setOrs] = useState<ConsultasOrs | null>(null);
  // El mapa de calles propio (spec 031): de cuándo es, y el interruptor para
  // armar la ruta con OpenRouteService si un día falla.
  const [fechaRed, setFechaRed] = useState<string | null>(null);
  const [rutaConOrs, setRutaConOrs] = useState(false);
  const [lectura, setLectura] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const modoPrueba = useModoPrueba();
  const gps = useConfigGps();
  // Entrar o salir pide un segundo toque: salir borra lo de la prueba.
  const [confirmando, setConfirmando] = useState(false);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);

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
        ubicacion: estadoDe(ubicacion),
      });
      setOrs(consultasOrsDeHoy());
      setRutaConOrs(redApagada());
      setFechaRed((await cargarRed())?.fecha ?? null);
    })();
  }, []);

  async function cambiarModoPrueba() {
    setErrorPrueba(null);
    try {
      if (modoPrueba) await salirDelModoPrueba(info?.version ?? null);
      else await entrarAlModoPrueba();
    } catch (e) {
      setErrorPrueba(e instanceof Error ? e.message : "No se pudo cambiar el modo prueba.");
    }
    setConfirmando(false);
  }

  async function probarEscaner() {
    setEscaneando(true);
    setLectura(null);
    const codigo = await escanearCodigo();
    setLectura(codigo ?? "Sin lectura (cancelado o sin escáner)");
    setEscaneando(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* La misma cinta de la pantalla de reparto (spec 033, diag-apagados). */}
      <CintaModoPrueba visible={modoPrueba} />
      <Link href="/conductor/encomiendas" className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ArrowLeft className="h-4 w-4" />
        Volver a la ruta
      </Link>
      <h1 className="text-lg font-semibold">Diagnóstico de la app</h1>

      {info ? (
        <ul className="divide-y divide-divider rounded-2xl bg-card shadow-soft">
          <Fila etiqueta="App instalada (APK)" estado={info.app ? "si" : "no"} detalle={info.version ?? undefined} />
          <Fila etiqueta="Llamar con un toque" estado={info.llamadas} />
          <Fila etiqueta="Ubicación" estado={info.ubicacion} />
        </ul>
      ) : (
        <p className="text-sm text-muted">Revisando…</p>
      )}

      {ors ? (
        <p className="text-xs text-muted">
          OpenRouteService hoy, desde este teléfono: <span className="font-mono">{ors.matriz}</span> matrices y{" "}
          <span className="font-mono">{ors.trazado}</span> trazados.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs text-muted">
          Mapa de calles propio: {rutaConOrs ? "apagado" : fechaRed ? <span className="font-mono">{fechaRed}</span> : "sin cargar"}.
          {origenDelUltimoTrazado() === "red" ? " La última ruta la dibujó el mapa propio." : null}
          {origenDelUltimoTrazado() === "ors" ? " La última ruta la dibujó OpenRouteService." : null}
        </p>
        <label className="flex items-center gap-2 px-1 text-sm font-medium">
          <input
            type="checkbox"
            checked={rutaConOrs}
            onChange={(e) => {
              apagarRed(e.target.checked);
              setRutaConOrs(e.target.checked);
            }}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Armar la ruta con OpenRouteService
        </label>
      </div>

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
        {/* Fuera de la APK se dice por qué no anda (spec 033, diag-apagados). */}
        {escaneando ? "Escaneando…" : info && !info.app ? "Probar escáner · Solo en la app" : "Probar escáner"}
      </button>
      {lectura ? (
        <p className="break-all rounded-2xl bg-card px-4 py-3 font-mono text-sm shadow-soft">{lectura}</p>
      ) : null}

      <ProbarEtiqueta enApp={info?.app ?? false} />

      <ProbarEscanerVivo enApp={info?.app ?? false} />

      <ProbarBarridoNomina enApp={info?.app ?? false} />

      {/* Modo prueba (terreno 2026-10-28): ver lib/encomiendas/local/modo-prueba.ts. */}
      <section className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0 text-warn" />
          <h2 className="flex-1 text-sm font-semibold">Modo prueba</h2>
          <span className={cn("text-xs font-semibold", modoPrueba ? "text-warn" : "text-muted")}>
            {modoPrueba ? "Encendido" : "Apagado"}
          </span>
        </div>
        <p className="text-xs text-muted">
          {modoPrueba
            ? "Nada se envía a la oficina ni por WhatsApp. Al salir se borran los pedidos de prueba de este teléfono."
            : "Nada se envía a la oficina ni por WhatsApp mientras esté encendido."}
        </p>
        {errorPrueba ? <p className="text-xs text-danger">{errorPrueba}</p> : null}
        {/* El GPS simulado (gps-simulado.ts): parte en la central y avanza solo por
            el tramo de la línea del día hasta la parada activa, o en línea recta si
            no hay tramo (spec 020, R12). Mueve solo a ARES: Google Maps navega con
            la ubicación real. */}
        {modoPrueba ? (
          <div className="space-y-2 rounded-xl bg-background p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={gps.activo}
                onChange={(e) => fijarConfigGps({ activo: e.target.checked })}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              GPS simulado en la central
            </label>
            {gps.activo ? (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="mr-1">Velocidad</span>
                {VELOCIDADES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => fijarConfigGps({ velocidad: v })}
                    aria-pressed={gps.velocidad === v}
                    className={cn(
                      "h-8 min-w-11 rounded-full border px-2 font-mono font-semibold",
                      gps.velocidad === v ? "border-brand bg-brand text-brand-foreground" : "border-separator bg-card text-foreground",
                    )}
                  >
                    ×{v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {esApkDePrueba(info?.version) ? (
          <p className="text-xs font-semibold text-warn">La app de prueba siempre está en modo prueba.</p>
        ) : confirmando ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="h-11 rounded-full border border-separator bg-card text-sm font-semibold text-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void cambiarModoPrueba()}
              className="h-11 rounded-full bg-warn text-sm font-semibold text-white"
            >
              {modoPrueba ? "Salir y borrar" : "Entrar"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="h-11 w-full rounded-full border border-separator bg-card text-sm font-semibold text-warn"
          >
            {modoPrueba ? "Salir del modo prueba" : "Entrar al modo prueba"}
          </button>
        )}
      </section>
    </div>
  );
}
