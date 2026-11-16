"use client";

// Resolver los pedidos sin ubicar o con el lugar en duda en la misma pantalla, sin abrir el
// pedido (dueño, 2026-11-16: «nunca tengas que ir a editar el pedido para resolver»). Va junto
// a las propuestas de la IA en el paso 3 de «Cargar guía» y en «Por resolver» de la hoja:
//   · calle en varios lugares o solo la calle → sus opciones con mapa, población y cruces,
//     ordenadas por cercanía a la ruta, y «Elegir» (no se le pregunta a la IA: no sabe dónde
//     anda la ruta y elegía el lugar equivocado);
//   · sin ubicar y sin propuesta de la IA → el campo de dirección con sugerencias.

import { useState } from "react";
import { MapPinOff } from "lucide-react";
import { DireccionInput } from "@/components/direccion/direccion-input";
import { telefonoParaGuardar } from "@/lib/comun/telefono";
import { cambiarDireccion, elegirLugar, fijarTelefono, type Pedido } from "@/lib/encomiendas/local/almacen";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { ProblemaGuardado } from "@/lib/encomiendas/problemas";
import { BotonTelefono, CampoTelefono } from "./campo-telefono";
import { OpcionesDeLugar } from "./opciones-lugar";

type ConOpciones = Extract<ProblemaGuardado, { opciones: unknown }>;

/** El ⚠ de lugar del pedido, si tiene. */
export const lugarEnDuda = (p: Pedido): ConOpciones | null =>
  (p.problemas.find((x) => x.tipo === "calle_repetida" || x.tipo === "solo_calle") as ConOpciones | undefined) ?? null;

/** Lo que se resuelve en «Por confirmar»: lugar en duda, o sin ubicar; con una propuesta de la
 *  IA a la vista, se confirma esa. */
export const sePuedeResolverAqui = (p: Pedido) =>
  p.resultado === "pendiente" && !p.propuestaIA && (lugarEnDuda(p) != null || p.lat == null || p.lng == null);

export function PorConfirmar({ pedidos, onResuelto }: { pedidos: Pedido[]; onResuelto: (pedidoId: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El teléfono anotado en cada tarjeta y si su campo está abierto, como en las propuestas de la IA. */
  const [telefonos, setTelefonos] = useState<Record<string, string>>({});
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const conTelefono = (p: Pedido) => abiertos[p.id] ?? p.telefono.trim() !== "";
  /** El teléfono escrito se guarda al resolver, como «Confirmar» (solo en el teléfono). */
  async function guardarTelefono(p: Pedido) {
    const escrito = telefonos[p.id]?.trim() ? telefonoParaGuardar(telefonos[p.id]) : null;
    if (escrito && escrito !== p.telefono) await fijarTelefono(p.id, escrito);
  }

  async function hacer(id: string, accion: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      onResuelto(id);
    } catch {
      setError("No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p> : null}
      {pedidos.map((p) => {
        const duda = lugarEnDuda(p);
        const of = p.of ? <p className="text-xs text-muted">OF {formatoOf(p.of)}</p> : null;
        if (duda) {
          // El formato de las propuestas de la IA: la OF, lo que decía, el teléfono para llamar y
          // los lugares. La dirección no se edita aquí: se elige uno (dueño, 2026-11-16).
          return (
            <OpcionesDeLugar
              key={p.id}
              enTarjeta
              problema={duda}
              ocupado={ocupado}
              encabezado={
                <>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      {of}
                      <p className="text-base font-semibold leading-tight">{p.direccion}</p>
                    </div>
                    <BotonTelefono
                      abierto={conTelefono(p)}
                      onClick={() => setAbiertos((s) => ({ ...s, [p.id]: !conTelefono(p) }))}
                    />
                  </div>
                  {conTelefono(p) ? (
                    <CampoTelefono
                      valor={telefonos[p.id] ?? p.telefono}
                      onCambiar={(t) => setTelefonos((s) => ({ ...s, [p.id]: t }))}
                    />
                  ) : null}
                </>
              }
              onElegir={(o) =>
                void hacer(p.id, async () => {
                  await guardarTelefono(p);
                  await elegirLugar(p.id, o);
                })
              }
            />
          );
        }
        return (
          <EscribirDireccion key={p.id} pedido={p} of={of} ocupado={ocupado} onGuardar={(texto, punto) =>
            void hacer(p.id, () =>
              cambiarDireccion(p.id, texto, punto, `Dirección corregida manualmente; decía «${p.direccion}»`),
            )
          } />
        );
      })}
    </div>
  );
}

function EscribirDireccion({
  pedido,
  of,
  ocupado,
  onGuardar,
}: {
  pedido: Pedido;
  of: React.ReactNode;
  ocupado: boolean;
  onGuardar: (texto: string, punto: { lat: number; lng: number }) => void;
}) {
  const [texto, setTexto] = useState(pedido.direccion);
  return (
    <div className="space-y-2 rounded-2xl bg-card p-3 shadow-soft">
      {of}
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
        <MapPinOff className="h-3.5 w-3.5 shrink-0" />
        Sin ubicar · elige la dirección en la lista
      </p>
      <DireccionInput
        etiqueta="Dirección"
        value={texto}
        onChange={setTexto}
        disabled={ocupado}
        onSeleccionar={(s) => onGuardar(s.direccion, { lat: s.lat, lng: s.lng })}
      />
    </div>
  );
}
