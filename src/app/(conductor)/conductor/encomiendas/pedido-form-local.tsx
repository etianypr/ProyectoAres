"use client";

// Carga y edición de pedidos EN EL TELÉFONO. Reemplazó al formulario que había
// en components/encomiendas/pedido-form.tsx, que mandaba un FormData a una
// server action para escribir en la base: la oficina ya no carga pedidos (no le
// llegarían a ningún teléfono), así que ese formulario se eliminó. Este guarda
// en IndexedDB y no toca la red más que para ubicar la dirección en el mapa.
//
// ----------------------------------------------------------------------------
// LAS DOS REGLAS QUE MANDAN ACÁ
//
// 1. ESCRIBIR MENOS. El chofer carga treinta pedidos de pie al lado de la
//    camioneta. El teléfono se normaliza solo (no hay que teclear "+569"), el
//    teclado que aparece es el que corresponde a cada campo, y guardar deja el
//    formulario listo para el siguiente sin volver a tocar nada.
//
// 2. NADA DUDOSO ENTRA EN SILENCIO. Si la dirección aparece en dos lugares, o
//    solo se encontró la calle, el formulario PREGUNTA en vez de quedarse con la
//    primera coincidencia. Es el caso medido que motivó esto: "Los Aromos 120"
//    existe en Arica y en el valle de Azapa, a nueve kilómetros, y tomando la
//    primera el chofer se enteraba al llegar.
//
//    La escapatoria existe igual ("Guardar sin ubicar"): el pedido se guarda con
//    una advertencia visible y el chofer lo corrige después. Lo que no puede
//    pasar es que entre a una ruta como si estuviera confirmado.

import { useMemo, useState } from "react";
import { AlertTriangle, Check, MapPin, Save, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DireccionInput } from "@/components/ui/direccion-input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ubicarDireccion, type SugerenciaDireccion } from "@/lib/geocoding";
import { normalizarTelefono } from "@/lib/telefono";
import {
  guardarPedido,
  reiniciarDisponibilidad,
  type PedidoLocal,
} from "@/lib/encomiendas/local/almacen";

const VACIO = { nombre: "", telefono: "", direccion: "", notas: "" };

/** Dirección que el chofer eligió de la lista de sugerencias: el texto tal cual
 *  lo devolvió el buscador y sus coordenadas. Mientras el campo diga exactamente
 *  ese texto, esas son las coordenadas que se guardan — sin volver a
 *  geocodificar y sin margen de error. */
type DireccionElegida = { texto: string; lat: number; lng: number };

/** Lo que hay que resolver antes de poder guardar con confianza: la dirección
 *  dio varias coincidencias, o solo la calle. */
type PorResolver = {
  candidatos: SugerenciaDireccion[];
  advertencia: string;
};

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
  const [porResolver, setPorResolver] = useState<PorResolver | null>(null);
  // Texto que el chofer dio por bueno a mano desde la lista de sugerencias,
  // sabiendo que no se pudo ubicar. Se guarda el TEXTO y no un booleano para que
  // seguir escribiendo invalide la decisión sola.
  const [aceptadaAMano, setAceptadaAMano] = useState<string | null>(null);

  function set(campo: keyof typeof VACIO, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setListo(false);
    // Cambiar cualquier campo invalida la duda anterior: si tocó la dirección
    // hay que volver a buscarla, y si tocó otra cosa la lista de candidatos ya
    // se mostró y no tiene por qué quedar colgada.
    setPorResolver(null);
  }

  const direccionEscrita = campos.direccion.trim();
  const direccionConfirmada = elegida != null && elegida.texto === direccionEscrita;

  // Se recalcula en cada tecla y no en el blur: el chofer ve el número tomando
  // forma mientras escribe, que es la señal de que no hace falta el "+569".
  const telefono = useMemo(() => normalizarTelefono(campos.telefono), [campos.telefono]);
  const telefonoEscrito = campos.telefono.trim().length > 0;

  // Editando y con un número distinto del guardado: hay una respuesta previa que
  // ya no corresponde a este destinatario. Se compara contra el NORMALIZADO para
  // que reescribir "912345678" como "+56 9 1234 5678" no cuente como cambio.
  const numeroCambiado =
    editando &&
    telefonoEscrito &&
    pedido.disponibilidad !== "pendiente_respuesta" &&
    pedido.telefono !== (telefono.ok ? telefono.telefono.e164 : campos.telefono.trim());

  /** El guardado en sí, con las coordenadas ya decididas. Está aparte porque hay
   *  tres caminos que llegan hasta acá: el normal, elegir un candidato de la
   *  lista de dudas, y "guardar sin ubicar". */
  async function guardar(coord: { lat: number | null; lng: number | null }, avisoFinal: string | null) {
    const nombre = campos.nombre.trim();
    const direccion = campos.direccion.trim();

    const telefonoAGuardar = telefono.ok ? telefono.telefono.e164 : campos.telefono.trim();

    // CAMBIÓ EL NÚMERO: lo que había contestado ese WhatsApp era de OTRA persona.
    //
    // Es el caso concreto para el que existe reiniciarDisponibilidad, y hay que
    // hacerlo antes de guardar. Si no, un pedido cerrado por un rechazo que en
    // realidad era de un desconocido quedaría cerrado para siempre, y el paquete
    // no se entregaría nunca sin que nadie sepa por qué.
    //
    // Solo cuando el número cambia de verdad: corregir la dirección o agregar una
    // nota no invalida nada de lo que el receptor contestó.
    const cambioElNumero = editando && pedido.telefono !== telefonoAGuardar;
    if (cambioElNumero) await reiniciarDisponibilidad(pedido.id);

    await guardarPedido(
      {
        nombre,
        // Se guarda normalizado cuando se pudo. Cuando no, se conserva LO QUE
        // ESCRIBIÓ: es lo único que le permite darse cuenta de en qué se
        // equivocó. Un campo en blanco no le dice nada.
        telefono: telefonoAGuardar,
        direccion,
        lat: coord.lat,
        lng: coord.lng,
        notas: campos.notas.trim() || null,
      },
      pedido?.id,
    );

    setPorResolver(null);

    // Al cargar pedidos siempre se hace en tanda: tras guardar uno nuevo el
    // formulario se limpia y sigue ahí, listo para el siguiente. Al editar, en
    // cambio, se cierra.
    if (editando) {
      onGuardado();
      return;
    }
    setCampos(VACIO);
    setElegida(null);
    setAceptadaAMano(null);
    setAviso(avisoFinal);
    setListo(true);
    onGuardado();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nombre = campos.nombre.trim();
    const direccion = campos.direccion.trim();
    if (!nombre) return setError("El nombre del destinatario es obligatorio.");
    if (!campos.telefono.trim()) return setError("El teléfono es obligatorio.");
    if (!direccion) return setError("La dirección es obligatoria.");

    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      // El aviso del teléfono viaja con el guardado: un fijo se guarda igual (se
      // puede llamar), pero el chofer tiene que saber que ese aviso no va a
      // llegar.
      const avisoTelefono = telefono.ok ? telefono.aviso : `Teléfono sin normalizar: ${telefono.motivo}`;

      // Tres caminos, de mejor a peor:
      //  1. La eligió de la lista → ya viene con las coordenadas exactas de esa
      //     puerta y no hace falta consultar nada.
      //  2. Está editando y no tocó la dirección → se conservan las que tenía
      //     (evita gastar una consulta al corregir solo el teléfono).
      //  3. La escribió a mano → se busca, y si hay dudas se pregunta.
      const deLaLista = elegida && elegida.texto === direccion ? elegida : null;
      if (deLaLista) {
        await guardar({ lat: deLaLista.lat, lng: deLaLista.lng }, avisoTelefono);
        return;
      }

      if (editando && pedido.direccion === direccion) {
        await guardar({ lat: pedido.lat, lng: pedido.lng }, avisoTelefono);
        return;
      }

      // El chofer ya dijo "va así" sobre esta dirección exacta. Volver a
      // preguntarle lo mismo sería no haberlo escuchado.
      if (aceptadaAMano === direccion) {
        await guardar(
          { lat: null, lng: null },
          "Guardado SIN ubicar, como pediste: no entra en la ruta hasta que marques el punto.",
        );
        return;
      }

      const ubicacion = await ubicarDireccion(direccion);

      if (ubicacion.elegida) {
        await guardar(
          { lat: ubicacion.elegida.lat, lng: ubicacion.elegida.lng },
          avisoTelefono,
        );
        return;
      }

      // Acá está la regla 2 de la cabecera: hay dudas, así que no se guarda
      // todavía. Si hay candidatos se muestran para elegir; si no hay ninguno,
      // se ofrece guardarlo sin ubicar y corregirlo después.
      setPorResolver({
        candidatos: ubicacion.candidatos,
        advertencia: ubicacion.advertencia ?? "No se pudo ubicar la dirección.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en el teléfono.");
    } finally {
      setGuardando(false);
    }
  }

  async function elegirCandidato(s: SugerenciaDireccion) {
    setGuardando(true);
    try {
      setCampos((c) => ({ ...c, direccion: s.direccion }));
      setElegida({ texto: s.direccion, lat: s.lat, lng: s.lng });
      await guardar(
        { lat: s.lat, lng: s.lng },
        telefono.ok ? telefono.aviso : `Teléfono sin normalizar: ${telefono.motivo}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en el teléfono.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarSinUbicar() {
    setGuardando(true);
    try {
      await guardar(
        { lat: null, lng: null },
        "Guardado SIN ubicar: no va a entrar en la ruta hasta que corrijas la dirección.",
      );
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
            // Los nombres van con mayúscula inicial y el teclado pasa al campo
            // siguiente en vez de intentar enviar el formulario a medio llenar.
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="next"
          />
        </Field>

        <Field
          label="Teléfono"
          htmlFor="pl_telefono"
          hint={
            telefonoEscrito
              ? undefined
              : "Escribe solo el número: el +569 se agrega solo."
          }
        >
          <Input
            id="pl_telefono"
            type="tel"
            // inputMode "tel" saca el teclado numérico con el + y los signos, que
            // es la diferencia entre teclear un número y pelear con un teclado
            // de letras treinta veces al día.
            inputMode="tel"
            placeholder="9 1234 5678"
            value={campos.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            autoComplete="off"
            enterKeyHint="next"
          />
          {/* El número normalizado, en vivo. Es la confirmación de que el aviso
              va a salir al destinatario correcto — y de que no hace falta
              escribir el prefijo. */}
          {telefonoEscrito && telefono.ok ? (
            <p
              className={
                telefono.aviso
                  ? "mt-1 flex items-start gap-1 text-xs text-warn"
                  : "mt-1 flex items-center gap-1 text-xs text-ok"
              }
            >
              {telefono.aviso ? (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <Check className="h-3 w-3 shrink-0" />
              )}
              <span>
                {telefono.telefono.legible}
                {telefono.aviso ? ` — ${telefono.aviso}` : null}
              </span>
            </p>
          ) : null}
          {telefonoEscrito && !telefono.ok ? (
            <p className="mt-1 flex items-start gap-1 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{telefono.motivo}</span>
            </p>
          ) : null}
          {/* Cambiar el número descarta lo que había contestado el anterior, y el
              chofer tiene que saberlo antes de guardar: si el pedido estaba
              cerrado por un rechazo, vuelve a la ruta. */}
          {numeroCambiado ? (
            <p className="mt-1 flex items-start gap-1 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Es otro número: se descarta lo que había contestado el anterior
                {pedido.estado === "rechazado" ? " y el pedido vuelve a la ruta" : ""}.
              </span>
            </p>
          ) : null}
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
            onSeleccionar={(s) => {
              setElegida({ texto: s.direccion, lat: s.lat, lng: s.lng });
              setAceptadaAMano(null);
            }}
            confirmada={direccionConfirmada}
            onConfirmarManual={(texto) => {
              setAceptadaAMano(texto);
              setElegida(null);
              setPorResolver(null);
            }}
          />
          {direccionConfirmada ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-ok">
              <MapPin className="h-3 w-3" />
              Ubicada en el mapa
            </p>
          ) : null}
          {!direccionConfirmada && aceptadaAMano === direccionEscrita && direccionEscrita ? (
            <p className="mt-1 flex items-start gap-1 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Sin ubicar en el mapa. No va a entrar en la ruta hasta que marques el punto.</span>
            </p>
          ) : null}
        </Field>

        <Field label="Notas" htmlFor="pl_notas">
          <Textarea
            id="pl_notas"
            placeholder="Opcional — depto, timbre, seña de la casa"
            value={campos.notas}
            onChange={(e) => set("notas", e.target.value)}
            enterKeyHint="done"
          />
        </Field>

        {/* La dirección quedó en duda: acá se resuelve, y no se guarda nada
            hasta que el chofer decida. */}
        {porResolver ? (
          <div className="rounded-xl border border-warn/30 bg-warn-bg p-3">
            <p className="flex items-start gap-1.5 text-sm font-medium text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{porResolver.advertencia}</span>
            </p>

            {porResolver.candidatos.length > 0 ? (
              <ul className="mt-2 grid gap-1.5">
                {porResolver.candidatos.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => void elegirCandidato(s)}
                      className="flex w-full items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-left transition-colors active:bg-background disabled:opacity-60"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-tight">
                          {s.direccion}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[s.detalle, s.fuente === "osm" ? "OSM" : "Mapbox"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {s.soloCalle ? (
                        <span className="mt-0.5 shrink-0 rounded-full bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                          sin número
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-warn">
                <SearchX className="h-3.5 w-3.5 shrink-0" />
                Ningún proveedor de mapas la reconoció.
              </p>
            )}

            <button
              type="button"
              disabled={guardando}
              onClick={() => void guardarSinUbicar()}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-warn underline decoration-warn/40 underline-offset-2 disabled:opacity-60"
            >
              Guardar sin ubicar y corregir después
            </button>
          </div>
        ) : null}

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
