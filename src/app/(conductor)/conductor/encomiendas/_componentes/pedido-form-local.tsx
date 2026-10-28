"use client";

// Carga y edición de pedidos EN EL TELÉFONO: guarda en IndexedDB y solo toca la
// red para ubicar la dirección. Tres reglas:
//
// 1. Escribir menos: el teléfono se normaliza solo, cada campo trae su teclado y
//    guardar deja el formulario listo para el siguiente.
// 2. Nada dudoso entra en silencio: si la dirección aparece en dos lugares ("Los
//    Aromos 120" está en Arica y en Azapa, a 9 km) o solo se halló la calle, se
//    PREGUNTA (ver resolver-direccion.tsx); "Guardar sin ubicar" queda con aviso.
// 3. Cuando ningún mapa sabe, sabe el conductor: "Estoy en la puerta" siempre a la
//    vista y el campo acepta un Plus Code.
//
// Es la excepción de A7 que queda (spec 002, T041): sus estados están entrelazados
// y partir la lógica del formulario más usado en terreno no vale el riesgo ahora.

import { useMemo, useState } from "react";
import { ResolverDireccion, type PorResolver } from "./resolver-direccion";
import { AlertTriangle, Check, Save, StickyNote } from "lucide-react";
import { Campo, CampoArea, NotaCampo } from "@/components/ui/campo";
import { DireccionInput } from "@/components/direccion/direccion-input";

import { MarcarAqui } from "./marcar-aqui";
import { entraSolo, type Marca } from "@/lib/geo/marcar";
import { Button } from "@/components/ui/button";
import { ubicarDireccion, type SugerenciaDireccion } from "@/lib/geo/geocoding";
import { normalizarTelefono } from "@/lib/comun/telefono";
import { guardarPedido, ofRepetida, reiniciarDisponibilidad, type Pedido } from "@/lib/encomiendas/local/almacen";
import { ofDistinta, ofValida } from "@/lib/encomiendas/paquete";

const VACIO = { nombre: "", telefono: "", direccion: "", notas: "" };

/** Dirección que el conductor eligió de la lista de sugerencias: el texto tal cual
 *  lo devolvió el buscador y sus coordenadas. Mientras el campo diga exactamente
 *  ese texto, esas son las coordenadas que se guardan — sin volver a
 *  geocodificar y sin margen de error. */
type DireccionElegida = { texto: string; lat: number; lng: number };

export function PedidoFormLocal({
  pedido,
  fecha,
  ofInicial,
  onGuardado,
}: {
  /** Pedido a editar. Sin esto es uno nuevo. */
  pedido?: Pedido;
  /** OF de una etiqueta escaneada que no estaba en la guía (spec 005). */
  ofInicial?: string;
  /** Día de trabajo al que pertenece un pedido nuevo. */
  fecha: string;
  /** Guardado. Recibe la advertencia que quedó del guardado, o null si no hubo
   *  ninguna: es lo que le permite a quien contiene el formulario confirmar el
   *  "agregado" sin taparle al conductor un aviso que sí tiene que leer.
   *
   *  No hay onCancelar: para salir está la flecha de la vista que lo contiene
   *  (ver vista-pedido.tsx). Un botón "Cancelar" al lado del de
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
  // Texto que el conductor dio por bueno a mano desde la lista de sugerencias,
  // sabiendo que no se pudo ubicar. Se guarda el TEXTO y no un booleano para que
  // seguir escribiendo invalide la decisión sola.
  const [aceptadaAMano, setAceptadaAMano] = useState<string | null>(null);
  // La nota, plegada mientras no haya una. Ver dónde se dibuja: es lo que hace
  // que el botón de guardar entre en la pantalla sin deslizar.
  const [notasAbiertas, setNotasAbiertas] = useState(Boolean(pedido?.notas));
  // La OF (spec 003), opcional a mano: es la llave que une este pedido con su
  // etiqueta al escanearla (spec 005). La descripción y la foto del paquete NO se
  // cargan acá: salen del escaneo de la etiqueta.
  const [ofTexto, setOfTexto] = useState(pedido?.of ?? ofInicial ?? "");
  const ofEscrita = ofTexto.trim();
  const of = ofValida(ofEscrita);

  function set(campo: keyof typeof VACIO, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    // Cambiar cualquier campo invalida la duda anterior: si tocó la dirección
    // hay que volver a buscarla, y si tocó otra cosa la lista de candidatos ya
    // se mostró y no tiene por qué quedar colgada.
    setPorResolver(null);
  }

  const direccionEscrita = campos.direccion.trim();
  const direccionConfirmada = elegida != null && elegida.texto === direccionEscrita;

  // El punto que se le muestra al conductor debajo del campo (ver mapa-punto.tsx).
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

  // Se recalcula en cada tecla y no en el blur: el conductor ve el número tomando
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
   *  lista de dudas, "guardar sin ubicar", y el conductor marcando la puerta con el
   *  GPS estando parado en ella (ver usarMarca y marcar-aqui.tsx). */
  async function guardar(coord: { lat: number | null; lng: number | null }, avisoFinal: string | null) {
    const nombre = campos.nombre.trim();
    const direccion = campos.direccion.trim();

    const telefonoAGuardar = telefono.ok ? telefono.telefono.e164 : campos.telefono.trim();

    // CAMBIÓ EL NÚMERO: lo que había contestado ese WhatsApp era de OTRA persona.
    //
    // Es el caso concreto para el que existe reiniciarDisponibilidad, y hay que
    // hacerlo antes de guardar: esa respuesta no puede quedar pegada al pedido, y
    // el aviso tiene que poder salir de nuevo al número correcto.
    //
    // Solo cuando el número cambia de verdad: corregir la dirección o agregar una
    // nota no invalida nada de lo que el receptor contestó.
    const cambioElNumero = editando && pedido.telefono !== telefonoAGuardar;
    if (cambioElNumero) await reiniciarDisponibilidad(pedido.id);

    const guardado = await guardarPedido(
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
        of,
      },
      fecha,
      pedido?.id,
    );
    // Una OF repetida en el día es casi siempre el mismo paquete cargado dos
    // veces: se avisa, pero se guarda (puede ser un error de la etiqueta).
    if (await ofRepetida(guardado.fecha, guardado.of, guardado.id)) {
      avisoFinal = [avisoFinal, "Otro pedido de hoy tiene la misma OF: revisa que no esté cargado dos veces."]
        .filter(Boolean)
        .join(" ");
    }

    setPorResolver(null);

    // Al cargar pedidos siempre se hace en tanda: tras guardar uno nuevo el
    // formulario se limpia y sigue ahí, listo para el siguiente. Al editar, en
    // cambio, se cierra.
    if (editando) {
      onGuardado();
      return;
    }
    setCampos(VACIO);
    setOfTexto("");
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
    // Con OF (pedido de la guía), el nombre y el teléfono llegan al escanear la
    // etiqueta: no se piden para corregir la dirección (terreno 2026-10-27).
    // Sin OF son lo único que identifica al pedido.
    const conOf = Boolean(of ?? pedido?.of);
    if (!conOf && !campos.nombre.trim()) return "El nombre del destinatario es obligatorio.";
    if (!conOf && !campos.telefono.trim()) return "El teléfono es obligatorio.";
    if (!campos.direccion.trim()) return "La dirección es obligatoria.";
    if (ofEscrita && !of) return "La OF lleva solo números. Revísala o déjala vacía.";
    return null;
  }

  /** El conductor confirmó el punto que le dio el GPS estando en la puerta.
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
      // puede llamar), pero el conductor tiene que saber que ese aviso no va a
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

      // El conductor ya dijo "va así" sobre esta dirección exacta. Volver a
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
      {/* La etiqueta va dentro de cada caja (ui/campo.tsx): sin el renglón de
          encima, los campos entran de una sin deslizar.
          content-start porque una rejilla que scrollea estira sus filas para
          llenar el hueco cuando sobra alto, y los campos se irían separando
          solos en un teléfono grande. */}
      <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 pt-3">
        {/* OF y teléfono, cortos y de números, comparten renglón. La OF es
            opcional: normalmente llega sola desde la guía o el código de barras
            (spec 005). */}
        <div className="grid grid-cols-2 gap-2.5">
          <Campo
            id="pl_of"
            etiqueta="OF"
            extra="opcional"
            inputMode="numeric"
            placeholder="123 456 789"
            value={ofTexto}
            onChange={(e) => setOfTexto(e.target.value)}
            autoComplete="off"
            enterKeyHint="next"
            className="font-mono tabular-nums"
            tono={ofEscrita && !of ? "aviso" : "normal"}
            fin={
              of && ofDistinta(of) ? (
                <AlertTriangle aria-label="OF distinta" className="h-4 w-4 text-warn" />
              ) : of ? (
                <Check aria-hidden className="h-4 w-4 text-ok" />
              ) : null
            }
          />
          <Campo
            id="pl_telefono"
            etiqueta="Teléfono"
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
            className="tabular-nums"
            tono={telefonoEscrito && (!telefono.ok || telefono.aviso) ? "aviso" : "normal"}
            fin={telefonoEscrito && telefono.ok && !telefono.aviso ? <Check aria-hidden className="h-4 w-4 text-ok" /> : null}
          />
        </div>

        {/* Lo que dicen los dos campos de arriba, debajo del renglón y a todo el
            ancho: en media caja un aviso se partía en cuatro líneas. El número
            normalizado confirma que el +569 se agregó solo y que la llamada va
            al destinatario correcto; cambiarlo descarta lo que había contestado
            el anterior, y el conductor tiene que saberlo antes de guardar. */}
        {(ofEscrita && !of) || telefonoEscrito || numeroCambiado ? (
          <div className="-mt-1 space-y-0.5">
            {ofEscrita && !of ? <NotaCampo tono="aviso">La OF lleva solo números.</NotaCampo> : null}
            {telefonoEscrito && telefono.ok ? (
              <NotaCampo tono={telefono.aviso ? "aviso" : "ok"}>
                {telefono.telefono.legible}
                {telefono.aviso ? ` — ${telefono.aviso}` : null}
              </NotaCampo>
            ) : null}
            {telefonoEscrito && !telefono.ok ? <NotaCampo tono="aviso">{telefono.motivo}</NotaCampo> : null}
            {numeroCambiado ? (
              <NotaCampo tono="aviso">Es otro número: se descarta lo que había contestado el anterior.</NotaCampo>
            ) : null}
          </div>
        ) : null}

        <Campo
          id="pl_nombre"
          etiqueta="Destinatario"
          placeholder="Nombre y apellido"
          value={campos.nombre}
          onChange={(e) => set("nombre", e.target.value)}
          // Los nombres van con mayúscula inicial y el teclado pasa al campo
          // siguiente en vez de intentar enviar el formulario a medio llenar.
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="next"
        />

        {/* Sin descripción debajo: lo que falta o lo que está mal lo dice el mapa
            de abajo, en un espacio reservado desde el principio. */}
        <DireccionInput
          id="pl_direccion"
          etiqueta="Dirección"
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

        {/* El último recurso, y en Arica el más confiable: el conductor parado en
            la puerta. Va acá, pegado a la dirección y NO escondido detrás de un
            error, porque el momento en que se usa es justamente cuando no hay
            ningún error en pantalla — llegó, la dirección lo dejó a media
            cuadra, y entró desde "Sin ubicar — toca para corregir". */}
        <MarcarAqui onUsar={(m) => void usarMarca(m)} deshabilitado={guardando} />

        {/* La nota es opcional y la mayoría de los pedidos no lleva ninguna:
            plegada es un renglón. Se abre tocándola —con el cursor ya adentro,
            porque quien la toca es porque va a escribir— y se queda abierta sola
            cuando el pedido que se está corrigiendo ya tenía una: ahí esconderla
            sería esconder un dato escrito. */}
        {notasAbiertas ? (
          <CampoArea
            id="pl_notas"
            etiqueta="Notas"
            placeholder="Depto, timbre, seña de la casa"
            value={campos.notas}
            onChange={(e) => set("notas", e.target.value)}
            enterKeyHint="done"
            // Solo cuando la abrió el conductor. Editando un pedido que ya traía
            // nota, robarle el foco al primer campo sería empezar por el final.
            autoFocus={!pedido?.notas}
            rows={2}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNotasAbiertas(true)}
            className="flex min-h-11 items-center gap-2 rounded-[14px] border border-dashed border-separator px-3.5 text-sm font-medium text-muted active:bg-background"
          >
            <StickyNote className="h-4 w-4 shrink-0 text-brand" />
            Agregar una nota
          </button>
        )}

        {porResolver ? (
          <ResolverDireccion
            porResolver={porResolver}
            guardando={guardando}
            onElegir={(c) => void elegirCandidato(c)}
            onGuardarSinUbicar={() => void guardarSinUbicar()}
          />
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
          vista-pedido.tsx): en el borde de la pantalla no empuja el
          formulario que el conductor ya está volviendo a llenar. */}
      <div className="shrink-0 border-t border-divider px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <Button type="submit" size="lg" disabled={guardando} className="w-full">
          <Save className="h-4 w-4" />
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar pedido"}
        </Button>
      </div>
    </form>
  );
}
