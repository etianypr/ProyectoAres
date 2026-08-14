"use client";

// Carga y edición de pedidos EN EL TELÉFONO. Reemplazó al formulario que había
// en components/encomiendas/pedido-form.tsx, que mandaba un FormData a una
// server action para escribir en la base: la oficina ya no carga pedidos (no le
// llegarían a ningún teléfono), así que ese formulario se eliminó. Este guarda
// en IndexedDB y no toca la red más que para ubicar la dirección en el mapa.

import { useState } from "react";
import { Save, Check, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DireccionInput } from "@/components/ui/direccion-input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { geocodificarDireccion } from "@/lib/geocoding";
import { guardarPedido, type PedidoLocal } from "@/lib/encomiendas/local/almacen";

const VACIO = { nombre: "", telefono: "", direccion: "", notas: "" };

/** Dirección que el chofer eligió de la lista de sugerencias: el texto tal cual
 *  lo devolvió el buscador y sus coordenadas. Mientras el campo diga exactamente
 *  ese texto, esas son las coordenadas que se guardan — sin volver a
 *  geocodificar y sin margen de error. */
type DireccionElegida = { texto: string; lat: number; lng: number };

export function PedidoFormLocal({
  pedido,
  onGuardado,
  onCancelar,
}: {
  /** Pedido a editar. Sin esto es uno nuevo. */
  pedido?: PedidoLocal;
  onGuardado: () => void;
  onCancelar?: () => void;
}) {
  const editando = pedido != null;
  const [campos, setCampos] = useState(
    pedido
      ? {
          nombre: pedido.nombre,
          telefono: pedido.telefono,
          direccion: pedido.direccion,
          notas: pedido.notas ?? "",
        }
      : VACIO,
  );
  const [elegida, setElegida] = useState<DireccionElegida | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  function set(campo: keyof typeof VACIO, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setListo(false);
  }

  const direccionConfirmada = elegida != null && elegida.texto === campos.direccion.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nombre = campos.nombre.trim();
    const telefono = campos.telefono.trim();
    const direccion = campos.direccion.trim();
    if (!nombre) return setError("El nombre del destinatario es obligatorio.");
    if (!telefono) return setError("El teléfono es obligatorio.");
    if (!direccion) return setError("La dirección es obligatoria.");

    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      // Tres caminos, de mejor a peor:
      //  1. La eligió de la lista → ya viene con las coordenadas exactas de esa
      //     puerta y no hace falta consultar nada.
      //  2. Está editando y no tocó la dirección → se conservan las que tenía
      //     (evita gastar una consulta al corregir solo el teléfono).
      //  3. La escribió a mano → se geocodifica el texto, como siempre.
      const deLaLista = elegida && elegida.texto === direccion ? elegida : null;
      const conservaCoordenadas = !deLaLista && editando && pedido.direccion === direccion;
      const coord =
        deLaLista ?? (conservaCoordenadas ? null : await geocodificarDireccion(direccion));

      await guardarPedido(
        {
          nombre,
          telefono,
          direccion,
          lat: conservaCoordenadas ? pedido.lat : (coord?.lat ?? null),
          lng: conservaCoordenadas ? pedido.lng : (coord?.lng ?? null),
          notas: campos.notas.trim() || null,
        },
        pedido?.id,
      );

      // El pedido se guarda igual sin coordenadas —el chofer puede corregir la
      // dirección después—, pero no va a entrar en la ruta hasta que se pueda
      // ubicar, así que hay que decirlo.
      if (!conservaCoordenadas && !coord) {
        setAviso("Guardado, pero no se pudo ubicar la dirección en el mapa. Revísala.");
      }

      // Al cargar pedidos siempre se hace en tanda: tras guardar uno nuevo el
      // formulario se limpia y sigue ahí, listo para el siguiente. Al editar,
      // en cambio, se cierra.
      if (editando) {
        onGuardado();
        return;
      }
      setCampos(VACIO);
      setElegida(null);
      setListo(true);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en el teléfono.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4">
        <Field label="Nombre del destinatario" htmlFor="pl_nombre">
          <Input
            id="pl_nombre"
            value={campos.nombre}
            onChange={(e) => set("nombre", e.target.value)}
          />
        </Field>
        <Field label="Teléfono" htmlFor="pl_telefono">
          <Input
            id="pl_telefono"
            type="tel"
            placeholder="+56 9 1234 5678"
            value={campos.telefono}
            onChange={(e) => set("telefono", e.target.value)}
          />
        </Field>
        <Field
          label="Dirección"
          htmlFor="pl_direccion"
          hint={
            direccionConfirmada
              ? undefined
              : "Escribe y elige una de las direcciones que aparecen: así queda ubicada en el mapa."
          }
        >
          <DireccionInput
            id="pl_direccion"
            value={campos.direccion}
            onChange={(texto) => set("direccion", texto)}
            onSeleccionar={(s) => setElegida({ texto: s.direccion, lat: s.lat, lng: s.lng })}
            confirmada={direccionConfirmada}
          />
          {direccionConfirmada ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-ok">
              <MapPin className="h-3 w-3" />
              Ubicada en el mapa
            </p>
          ) : null}
        </Field>
        <Field label="Notas" htmlFor="pl_notas">
          <Textarea
            id="pl_notas"
            placeholder="Opcional"
            value={campos.notas}
            onChange={(e) => set("notas", e.target.value)}
          />
        </Field>

        {error ? (
          <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {aviso ? (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{aviso}</p>
        ) : null}
      </div>

      {/* Guardar contra el borde derecho y Cancelar a su izquierda: el pulgar
          del chofer cae en esa esquina, y es el mismo orden que el resto de los
          diálogos del sistema (ver el modal de "Agregar día" en el panel).
          El aviso de guardado se va al otro extremo con mr-auto, así no empuja
          los botones ni les cambia el lugar de un guardado al siguiente. */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {listo && !aviso ? (
          <span className="mr-auto flex items-center gap-1 text-sm text-ok">
            <Check className="h-4 w-4" />
            Agregado — listo para el siguiente
          </span>
        ) : null}
        {onCancelar ? (
          <button
            type="button"
            onClick={onCancelar}
            // Con padding y no como texto suelto: en el teléfono tiene que ser
            // tan tocable como el botón que tiene al lado.
            className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-foreground active:bg-background"
          >
            Cancelar
          </button>
        ) : null}
        <Button type="submit" disabled={guardando}>
          <Save className="h-4 w-4" />
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar pedido"}
        </Button>
      </div>
    </form>
  );
}
