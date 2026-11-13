"use client";

// Poner el punto de un pedido sin depender de los buscadores (spec 033, pin-mapa):
// «Marcar en el mapa» abre el mapa a pantalla completa con el pin fijo al centro
// (se mueve el mapa, no el pin) y «Usar este punto»; «Aquí» toma el GPS, para
// cuando el conductor está parado en la puerta (sirve sin teselas ni señal).
// Lo que se guarda son las coordenadas; sin dirección escrita, va el Plus Code
// (lib/geo/plus-code.ts, sin red). MapLibre + OpenFreeMap: gratis, sin clave.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import { CENTRO_ARICA, type Coordenada } from "@/lib/geo/coordenada";
import { ESTILO, URL_WORKER, ajustarEstilo } from "@/lib/geo/estilo-mapa";
import { fuenteUbicacion } from "@/lib/encomiendas/local/gps-simulado";

const BOTON =
  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-brand active:scale-[0.97] disabled:opacity-50";

export function MarcarPunto({ inicial, onPunto }: { inicial: Coordenada | null; onPunto: (p: Coordenada) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aqui() {
    const fuente = fuenteUbicacion();
    if (!fuente) return setError("Sin GPS en este teléfono.");
    setError(null);
    setBuscandoGps(true);
    fuente.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false);
        onPunto({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBuscandoGps(false);
        setError("Sin ubicación: revisa el permiso de ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(true)} className={BOTON}>
          <MapPin className="h-4 w-4" />
          Marcar en el mapa
        </button>
        <button type="button" onClick={aqui} disabled={buscandoGps} className={BOTON}>
          {buscandoGps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          Aquí
        </button>
      </div>
      {error ? <p className="px-1 text-xs text-warn">{error}</p> : null}
      {abierto ? (
        <MapaMarcar
          inicial={inicial}
          onUsar={(p) => {
            setAbierto(false);
            onPunto(p);
          }}
          onCerrar={() => setAbierto(false)}
        />
      ) : null}
    </div>
  );
}

function MapaMarcar({
  inicial,
  onUsar,
  onCerrar,
}: {
  inicial: Coordenada | null;
  onUsar: (p: Coordenada) => void;
  onCerrar: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const centro = useRef<Coordenada>(inicial ?? CENTRO_ARICA);
  // Con punto, de cerca; sin punto, Arica entera. Se lee una vez: el mapa no se rehace.
  const zoom = useRef(inicial ? 17 : 13);

  useEffect(() => {
    let mapa: import("maplibre-gl").Map | null = null;
    let vivo = true;
    void import("maplibre-gl").then(({ AttributionControl, Map: MapaGL, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      setWorkerUrl(URL_WORKER);
      mapa = new MapaGL({
        container: contenedor.current,
        style: ESTILO,
        center: [centro.current.lng, centro.current.lat],
        zoom: zoom.current,
        attributionControl: false,
      });
      mapa.addControl(new AttributionControl({ compact: true }), "bottom-right");
      mapa.on("load", () => mapa && ajustarEstilo(mapa));
      mapa.on("moveend", () => {
        const c = mapa?.getCenter();
        if (c) centro.current = { lat: c.lat, lng: c.lng };
      });
    });
    return () => {
      vivo = false;
      mapa?.remove();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Marcar en el mapa">
      <div className="flex items-center gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 text-lg font-semibold">Marcar en el mapa</p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={contenedor} className="absolute inset-0" />
        {/* El pin fijo al centro: su punta es el punto que se guarda. */}
        <MapPin
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-full fill-brand text-card"
        />
      </div>
      <div className="border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => onUsar(centro.current)}
          className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15px] font-semibold text-brand-foreground active:scale-[0.97]"
        >
          Usar este punto
        </button>
      </div>
    </div>,
    document.body,
  );
}
