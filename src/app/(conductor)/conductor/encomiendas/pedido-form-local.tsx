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
//
// 3. CUANDO NINGÚN MAPA SABE, SABE EL CHOFER. En Arica las casas no tienen
//    numeración y está medido: de 23 direcciones reales, Mapbox tiene la puerta
//    exacta en 2 (npm run sondear). Por eso "Estoy en la puerta" está siempre a
//    la vista, no escondido detrás de un error — el momento en que se usa es
//    justamente cuando no hay ningún error en pantalla. Y por eso el campo de
//    dirección acepta un Plus Code: dictado por teléfono ubica mejor que
//    cualquier texto, y sin consultar la red.

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Save, SearchX, StickyNote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DireccionInput } from "@/components/ui/direccion-input";
import { MapaPunto } from "@/components/ui/mapa-punto";
import { MarcarAqui } from "./marcar-aqui";
import { entraSolo, type Marca } from "@/lib/geo/marcar";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ubicarDireccion, NOMBRE_FUENTE, type SugerenciaDireccion } from "@/lib/geocoding";
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
}: {
  /** Pedido a editar. Sin esto es uno nuevo. */
  pedido?: PedidoLocal;
  /** Guardado. Recibe la advertencia que quedó del guardado, o null si no hubo
   *  ninguna: es lo que le permite a quien contiene el formulario confirmar el
   *  "agregado" sin taparle al chofer un aviso que sí tiene que leer.
   *
   *  No hay onCancelar: para salir está la flecha de la vista que lo contiene
   *  (ver VistaPedido en pantalla.tsx). Un botón "Cancelar" al lado del de
   *  guardar era un segundo camino para lo mismo, ocupando la mitad del ancho
   *  que le hacía falta al único botón que importa. */
  onGuardado: (aviso?: string | null) => void;
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
  const [porResolver, setPorResolver] = useState<PorResolver | null>(null);
  // Texto que el chofer dio por bueno a mano desde la lista de sugerencias,
  // sabiendo que no se pudo ubicar. Se guarda el TEXTO y no un booleano para que
  // seguir escribiendo invalide la decisión sola.
  const [aceptadaAMano, setAceptadaAMano] = useState<string | null>(null);
  // La nota, plegada mientras no haya una. Ver dónde se dibuja: es lo que hace
  // que el botón de guardar entre en la pantalla sin deslizar.
  const [notasAbiertas, setNotasAbiertas] = useState(Boolean(pedido?.notas));

  function set(campo: keyof typeof VACIO, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    // Cambiar cualquier campo invalida la duda anterior: si tocó la dirección
    // hay que volver a buscarla, y si tocó otra cosa la lista de candidatos ya
    // se mostró y no tiene por qué quedar colgada.
    setPorResolver(null);
  }

  const direccionEscrita = campos.direccion.trim();
  const direccionConfirmada = elegida != null && elegida.texto === direccionEscrita;

  // El punto que se le muestra al chofer debajo del campo (ver mapa-punto.tsx).
  // Mismo orden que al guardar: primero lo que eligió de la lista, y si no tocó
  // la dirección de un pedido guardado, lo que ese pedido ya tenía.
  //
  // Solo cuando el texto CORRESPONDE a esas coordenadas: en cuanto empieza a
  // escribir otra dirección, el mapa de la anterior desaparece. Dejarlo puesto
  // sería mostrarle la esquina equivocada justo cuando la está corrigiendo.
  const puntoPreview =
    direccionConfirmada && elegida
      ? { lat: elegida.lat, lng: elegida.lng }
      : editando &&
          pedido.direccion === direccionEscrita &&
          pedido.lat != null &&
          pedido.lng != null
        ? { lat: pedido.lat, lng: pedido.lng }
        : null;

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
   *  CUATRO caminos que llegan hasta acá: el normal, elegir un candidato de la
   *  lista de dudas, "guardar sin ubicar", y el chofer marcando la puerta con el
   *  GPS estando parado en ella (ver usarMarca y marcar-aqui.tsx). */
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
    // El siguiente de la tanda arranca plegado otra vez: la nota del anterior
    // no dice nada sobre si este va a llevar una.
    setNotasAbiertas(false);
    setAviso(avisoFinal);
    // La advertencia va con el aviso de guardado: quien contiene el formulario
    // solo confirma "agregado" cuando NO hay nada que leer. Un cartel verde que
    // se va solo, tapando un "se guardó sin ubicar", sería peor que no decir
    // nada.
    onGuardado(avisoFinal);
  }

  /** Lo que falta para poder guardar, o null si está todo.
   *
   *  Vive aparte porque hay DOS caminos que escriben un pedido: el botón de
   *  guardar y "Estoy en la puerta", que está siempre a la vista y por lo tanto
   *  se puede tocar con el formulario a medio llenar. Escrito dos veces, uno de
   *  los dos se iba a quedar atrás. */
  function loQueFalta(): string | null {
    if (!campos.nombre.trim()) return "El nombre del destinatario es obligatorio.";
    if (!campos.telefono.trim()) return "El teléfono es obligatorio.";
    if (!campos.direccion.trim()) return "La dirección es obligatoria.";
    return null;
  }

  /** El chofer confirmó el punto que le dio el GPS estando en la puerta.
   *
   *  Se guarda derecho, sin consultar a ningún proveedor: no hay nada que
   *  buscar, ya está ubicado. El aviso lleva el Plus Code porque es lo que hace
   *  que esta casa no se tenga que volver a buscar nunca. */
  async function usarMarca(marca: Marca) {
    const falta = loQueFalta();
    if (falta) return setError(falta);

    setError(null);
    setGuardando(true);
    try {
      const avisoTelefono = telefono.ok ? telefono.aviso : `Teléfono sin normalizar: ${telefono.motivo}`;
      await guardar(
        { lat: marca.lat, lng: marca.lng },
        [
          entraSolo(marca)
            ? `Ubicación marcada con el GPS (±${marca.precisionM} m).`
            : `Ubicación marcada con el GPS. ${marca.texto}`,
          marca.codigo ? `Plus Code: ${marca.codigo}` : null,
          avisoTelefono,
        ]
          .filter(Boolean)
          .join(" ") || null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en el teléfono.");
    } finally {
      setGuardando(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const falta = loQueFalta();
    if (falta) return setError(falta);
    const direccion = campos.direccion.trim();

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
        // La advertencia viaja CON el guardado y va primero. Una ubicación
        // aproximada (la puerta interpolada) se guarda igual, pero callarlo
        // sería guardar una coordenada que nadie sabe que es aproximada.
        await guardar(
          { lat: ubicacion.elegida.lat, lng: ubicacion.elegida.lng },
          [ubicacion.advertencia, avisoTelefono].filter(Boolean).join(" ") || null,
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
    // Columna de alto completo: los campos arriba y el botón de guardar clavado
    // abajo. El scroll —si hace falta— es del bloque de campos, NO del
    // formulario entero, que es lo que hacía que "Guardar pedido" quedara
    // debajo del borde y hubiera que deslizar para llegar a él con el pedido ya
    // escrito. Un formulario que se llena treinta veces al día no puede pedir
    // un gesto extra para cerrarse.
    <form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col">
      {/* gap-3 y no gap-4: veinte píxeles repartidos en cinco huecos son la
          diferencia entre que los campos entren de una o no.
          content-start porque una rejilla que scrollea estira sus filas para
          llenar el hueco cuando sobra alto, y los campos se irían separando
          solos en un teléfono grande. */}
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pt-3">
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

        {/* Sin descripción debajo y sin el "ubicada en el mapa" de antes: los dos
            decían en palabras lo que el mapa de abajo ya muestra. Lo que falta o
            lo que está mal lo dice ese mismo espacio —que ahora está reservado
            desde el principio—, del tamaño que se merece. */}
        <Field label="Dirección" htmlFor="pl_direccion">
          <DireccionInput
            id="pl_direccion"
            value={campos.direccion}
            onChange={(texto) => set("direccion", texto)}
            onSeleccionar={(s) => {
              setElegida({ texto: s.direccion, lat: s.lat, lng: s.lng });
              setAceptadaAMano(null);
            }}
            confirmada={direccionConfirmada}
            punto={puntoPreview}
            reservarMapa
            onConfirmarManual={(texto) => {
              setAceptadaAMano(texto);
              setElegida(null);
              setPorResolver(null);
            }}
          />
        </Field>

        {/* El último recurso, y en Arica el más confiable: el chofer parado en
            la puerta. Va acá, pegado a la dirección y NO escondido detrás de un
            error, porque el momento en que se usa es justamente cuando no hay
            ningún error en pantalla — llegó, la dirección lo dejó a media
            cuadra, y entró desde "Sin ubicar — toca para corregir". */}
        <MarcarAqui onUsar={(m) => void usarMarca(m)} deshabilitado={guardando} />

        {/* La nota es opcional y la mayoría de los pedidos no lleva ninguna,
            pero el recuadro ocupaba lo mismo estuviera vacío o no: cien píxeles
            que empujaban el botón de guardar fuera de la pantalla en todos los
            pedidos, para servir a unos pocos.
            Plegada es un renglón. Se abre tocándola —y con el cursor ya
            adentro, porque quien la toca es porque va a escribir— y se queda
            abierta sola cuando el pedido que se está corrigiendo ya tenía una:
            ahí esconderla sería esconder un dato escrito. */}
        {notasAbiertas ? (
          <Field label="Notas" htmlFor="pl_notas">
            <Textarea
              id="pl_notas"
              placeholder="Depto, timbre, seña de la casa"
              value={campos.notas}
              onChange={(e) => set("notas", e.target.value)}
              enterKeyHint="done"
              // Solo cuando la abrió el chofer. Editando un pedido que ya traía
              // nota, robarle el foco al primer campo sería empezar por el final.
              autoFocus={!pedido?.notas}
              rows={2}
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setNotasAbiertas(true)}
            className="flex items-center gap-2 rounded-xl border border-dashed border-separator px-3 py-2.5 text-sm font-medium text-muted active:bg-background"
          >
            <StickyNote className="h-4 w-4 shrink-0 text-brand" />
            Agregar una nota
          </button>
        )}

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
                      className="flex w-full items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 text-left transition-colors active:bg-background disabled:opacity-60"
                    >
                      {/* La estampilla de cada opción. Es lo que hace elegible
                          una lista donde dos renglones dicen exactamente lo
                          mismo: "Los Aromos 120" de la ciudad y el del valle de
                          Azapa se leen igual y están a nueve kilómetros.

                          Cuesta una petición a Mapbox por opción, y solo cuando
                          la dirección salió dudosa. Al lado de salir con el
                          paquete hacia el valle equivocado, no es nada. */}
                      <MapaPunto
                        lat={s.lat}
                        lng={s.lng}
                        etiqueta={s.direccion}
                        // 96 px y no menos: por debajo de eso la atribución de
                        // Mapbox —que viene dibujada en la imagen y no se
                        // puede sacar— se come un tercio de la estampilla y no
                        // queda mapa que mirar.
                        alto={96}
                        ancho={96}
                        // Más lejos que la tira de abajo del campo: acá no hay
                        // que ver la esquina sino EN QUÉ PARTE DE LA CIUDAD cae
                        // cada opción, que es lo que las distingue.
                        zoom={13}
                        className="w-24 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-tight">
                          {s.direccion}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[s.detalle, NOMBRE_FUENTE[s.fuente]].filter(Boolean).join(" · ")}
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

      {/* Un solo botón y a todo el ancho. Es el único que importa en esta
          pantalla, y de ancho completo se aprieta con el pulgar sin mirar y sin
          apuntar —que es como se cargan treinta pedidos parado al lado de la
          camioneta—. Para salir sin guardar está la flecha de arriba: un
          "Cancelar" al lado era un segundo camino para lo mismo, comiéndose
          medio ancho.
          Clavado abajo y fuera del scroll: antes vivía al final de los campos y
          había que deslizar para alcanzarlo, con el pedido ya escrito. Es el
          gesto que sobra treinta veces al día.
          La confirmación de guardado ya no va acá sino asomando desde abajo (ver
          VistaPedido en pantalla.tsx): en el borde de la pantalla no empuja el
          formulario que el chofer ya está volviendo a llenar. */}
      <div className="shrink-0 border-t border-divider px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <Button type="submit" size="lg" disabled={guardando} className="w-full">
          <Save className="h-4 w-4" />
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar pedido"}
        </Button>
      </div>
    </form>
  );
}
