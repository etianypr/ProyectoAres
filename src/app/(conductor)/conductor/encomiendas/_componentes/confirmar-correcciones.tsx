"use client";

// Las correcciones de la IA, una por una, para que el conductor las confirme
// (spec 018; terreno 2026-10-27). Cada una muestra lo que decía, lo que propone
// la IA, por qué y DÓNDE queda en el mapa: el conductor conoce Arica, y eso es lo
// que le permite decir "sí, es ahí". Nada se aplica sin su toque.
//
// Si no es ahí, tocar la dirección abre el campo de dirección de siempre con la de la IA ya
// escrita, y "Confirmar" guarda la que él eligió de la lista, después de verla en
// el mapa. Por eso no hay "Descartar" (dueño, 2026-11-11): la que no se confirma
// queda sin ubicar, como estaba. Se confirman de a una, y en cada una se puede
// anotar el teléfono del receptor y llamarlo (dueño, 2026-11-13).

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { DireccionInput } from "@/components/direccion/direccion-input";
import { MapaPunto } from "@/components/direccion/mapa-punto";
import { BotonTelefono, CampoTelefono } from "./campo-telefono";
import {
  aplicarCorreccion,
  type CorreccionEditada,
  type PropuestaCorreccion,
} from "@/lib/encomiendas/local/corregir-direcciones";

/** Lo escrito al tocar la dirección y la última dirección elegida de la lista. El punto
 *  vale mientras el texto sea el de la elegida: si sigue escribiendo, no hay
 *  punto (ni "Confirmar") hasta que elija otra. */
type Edicion = { texto: string; elegida: CorreccionEditada };

const puntoDe = (e: Edicion): CorreccionEditada | null => (e.texto.trim() === e.elegida.direccion ? e.elegida : null);

export function ConfirmarCorrecciones({
  propuestas,
  onAplicada,
  onConfirmada,
}: {
  propuestas: PropuestaCorreccion[];
  /** Se confirmó una: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
  /** Cada confirmada, para que quien tiene la lista la saque (spec 033). */
  onConfirmada?: (pedidoId: string) => void;
}) {
  /** Las confirmadas, con la dirección que quedó en el pedido. */
  const [confirmadas, setConfirmadas] = useState<Record<string, string>>({});
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  /** El teléfono anotado en cada tarjeta; sin tocar, el que ya tiene el pedido. */
  const [telefonos, setTelefonos] = useState<Record<string, string>>({});
  /** «Teléfono · opcional» abierto con su botón; con teléfono en el pedido, de entrada. */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const conTelefono = (p: PropuestaCorreccion) => abiertos[p.pedidoId] ?? p.telefono.trim() !== "";
  const [error, setError] = useState<string | null>(null);
  const pendientes = propuestas.filter((p) => confirmadas[p.pedidoId] == null);

  async function confirmar(lista: { p: PropuestaCorreccion; editada?: CorreccionEditada }[]) {
    // De a una (dueño, 2026-11-13: sin «Confirmar las n seguras»).
    setError(null);
    for (const { p, editada } of lista) {
      setGuardando(p.pedidoId);
      try {
        await aplicarCorreccion(p, editada, telefonos[p.pedidoId]);
        setConfirmadas((c) => ({ ...c, [p.pedidoId]: editada?.direccion ?? p.direccion }));
        onConfirmada?.(p.pedidoId);
      } catch {
        setError("No se pudo guardar una corrección. Intenta de nuevo.");
        break;
      }
    }
    setGuardando(null);
    onAplicada();
  }

  const editar = (id: string, cambio: (e: Edicion) => Edicion) =>
    setEdiciones((s) => (s[id] ? { ...s, [id]: cambio(s[id]) } : s));

  if (propuestas.length === 0) return null;

  return (
    <div className="space-y-2.5 text-left">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Sparkles className="h-4 w-4" />
        {pendientes.length === 0
          ? "Correcciones revisadas"
          : pendientes.length === 1
            ? "La IA corrigió 1 · confírmala"
            : `La IA corrigió ${pendientes.length} · confírmalas`}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {propuestas.map((p) => {
        const guardada = confirmadas[p.pedidoId];
        if (guardada != null) {
          return (
            <p key={p.pedidoId} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-soft">
              <Check className="h-4 w-4 shrink-0 text-ok" />
              <span className="min-w-0 flex-1 truncate">{guardada}</span>
            </p>
          );
        }
        const edicion = ediciones[p.pedidoId];
        const punto = edicion ? puntoDe(edicion) : null;
        return (
          <div key={p.pedidoId} className="space-y-2 rounded-2xl bg-card p-3 shadow-soft">
            <p className="text-xs text-muted">{p.nombre}</p>
            <p className="text-xs text-muted">
              Decía: <span className="line-through">{p.original}</span>
            </p>
            {edicion ? (
              <DireccionInput
                etiqueta="Dirección"
                value={edicion.texto}
                onChange={(texto) => editar(p.pedidoId, (e) => ({ ...e, texto }))}
                onSeleccionar={(s) =>
                  editar(p.pedidoId, () => ({
                    texto: s.direccion,
                    elegida: { direccion: s.direccion, lat: s.lat, lng: s.lng },
                  }))
                }
                confirmada={punto != null}
                punto={punto}
                reservarMapa
              />
            ) : (
              <>
                <div className="flex items-start gap-2">
                  {/* La dirección misma abre el campo con sugerencias: se edita solo si
                      se quiere cambiar (dueño, 2026-11-13; antes, el lápiz). */}
                  <button
                    type="button"
                    disabled={guardando != null}
                    onClick={() =>
                      setEdiciones((s) => ({
                        ...s,
                        [p.pedidoId]: {
                          texto: p.direccion,
                          elegida: { direccion: p.direccion, lat: p.lat, lng: p.lng },
                        },
                      }))
                    }
                    aria-label={`Cambiar la dirección: ${p.direccion}`}
                    className="min-w-0 flex-1 rounded-lg text-left text-base font-semibold leading-tight underline decoration-separator decoration-dotted underline-offset-4 active:bg-background disabled:opacity-50"
                  >
                    {p.direccion}
                  </button>
                  <BotonTelefono
                    abierto={conTelefono(p)}
                    onClick={() => setAbiertos((s) => ({ ...s, [p.pedidoId]: !conTelefono(p) }))}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.soloCalle ? (
                    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">Solo la calle</span>
                  ) : p.enLaCuadra ? (
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium">En la cuadra</span>
                  ) : null}
                  {!p.segura ? (
                    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">Dudosa</span>
                  ) : null}
                </div>
                <MapaPunto lat={p.lat} lng={p.lng} etiqueta={p.direccion} alto={130} />
              </>
            )}
            {conTelefono(p) ? (
              <CampoTelefono
                valor={telefonos[p.pedidoId] ?? p.telefono}
                onCambiar={(t) => setTelefonos((s) => ({ ...s, [p.pedidoId]: t }))}
              />
            ) : null}
            <button
              type="button"
              disabled={guardando != null || (edicion != null && punto == null)}
              onClick={() => void confirmar([{ p, editada: punto ?? undefined }])}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {guardando === p.pedidoId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar
            </button>
          </div>
        );
      })}
    </div>
  );
}
