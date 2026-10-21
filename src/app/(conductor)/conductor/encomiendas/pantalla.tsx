"use client";

// ----------------------------------------------------------------------------
// Encomiendas del chofer — una sola pantalla
// ----------------------------------------------------------------------------
// Mapa a pantalla completa y, abajo, una hoja deslizable de dos posiciones.
//
// Lo que cambió respecto de la versión anterior no es dónde está cada cosa sino
// QUÉ se puede hacer sin abrir la hoja. Antes, cerrada, mostraba el nombre del
// destinatario y nada más: para llamar o marcar una entrega —lo único que se
// hace manejando— había que arrastrarla hacia arriba y buscar el botón entre el
// formulario de carga y el generador de ruta. Ahora la cabecera de la hoja ES
// la parada activa con el botón de su paso, siempre a la vista, y adentro queda
// lo que se mira parado.
//
// La carga de pedidos pasa DENTRO de la hoja, como una vista que se abre sobre
// su contenido y debajo de la misma cabecera (ver BottomSheet, prop "vista").
// Estuvo un tiempo como pantalla aparte encima de todo, por miedo a que los
// campos peleasen con el gesto de arrastre; el miedo era infundado —la hoja se
// arrastra solo desde el tirador— y el precio era alto: agregar un pedido te
// sacaba del mapa, y volver era empezar de nuevo. Ahora la hoja sube un poco más
// (92% en vez de 78%), el formulario entra ahí, y el botón de la parada activa
// sigue a la vista mientras cargás.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  CloudOff,
  LocateFixed,
  LogOut,
  MapPin,
  MapPinOff,
  MessageCircleOff,
  PackageCheck,
  Route,
  Phone,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistancia } from "@/lib/format";
import { metrosRestantes, recortarTrazado, rumboDelCamino } from "@/lib/rutas";
import { BottomSheet } from "@/components/encomiendas/bottom-sheet";
import { PilaNotificaciones, type Notificacion } from "@/components/encomiendas/notificaciones";
import { FilaDeslizable } from "@/components/encomiendas/fila-deslizable";
import { Seccion } from "@/components/encomiendas/seccion";
import {
  leerDias,
  leerPedidos,
  leerRuta,
  resumirDia,
  type ResumenDia,
  type PedidoEliminado,
  type Pedido,
} from "@/lib/encomiendas/local/almacen";
import { BotonMenu, MenuLateral } from "@/components/encomiendas/menu-lateral";
import { logout } from "@/app/login/actions";
import { bloquePorId } from "@/lib/encomiendas/config";
import {
  confirmarRutaLocal,
  elegirAlternativa,
  type EstrategiaRuta,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import type { PreviaRuta, PuntoMapa, Ubicacion } from "./ruta-mapa";
import { MS_DESHACER, useDiaTrabajo, type Parada } from "./use-dia-trabajo";
import { useUbicacionActual } from "./use-ubicacion-actual";
import { useNavegacion } from "./use-navegacion";
import { usePantallaEncendida } from "./use-pantalla-encendida";
import { usePuntoEnRuta } from "./use-punto-en-ruta";
import { useVozNavegacion } from "./use-voz";
import { useBrujula } from "./use-brujula";
import { CAJA_CARRIL, InstruccionNavegacion } from "./instruccion-navegacion";
import { PedidoFormLocal } from "./pedido-form-local";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { VistaPreviaRuta } from "./vista-previa-ruta";

// mapbox-gl toca `window` apenas se importa — aunque este archivo ya es "use
// client", Next.js igual lo renderiza una vez en el servidor antes de hidratar,
// donde `window` no existe. ssr:false lo deja cargar solo en el navegador.
const RutaMapa = dynamic(() => import("./ruta-mapa").then((m) => m.RutaMapa), {
  ssr: false,
});

// Paso del flujo de la parada activa:
//   antes_llamar         → "Llamar"
//   esperando_resultado  → "Contestó" / "No contestó"
//   eligiendo            → no contestó: "Dejar para el final" / "Omitir por hoy"
//   confirmado           → contestó: "Pedido finalizado"
// En qué paso del trato con ESTA parada está el chofer.
//
//   antes_llamar         hay que contactarlo: no contestó el WhatsApp.
//   esperando_resultado  se lo llamó y hay que decir qué pasó con la llamada:
//                        contestó, volver a llamar, o no contestó. Es la ÚNICA
//                        pregunta de esta etapa, y se sigue en ella mientras la
//                        llamada no haya sido contestada.
//   confirmado           contestó la llamada y espera el paquete.
//   esperando_entrega    ya había confirmado por WhatsApp, así que no hace falta
//                        llamarlo: se va derecho a entregar. Es lo que hace que
//                        avisarle por WhatsApp AHORRE trabajo en terreno y no
//                        solo agregue información. Solo para ese caso.
//   salidas              no se pudo entregar: qué se hace con esta parada.
//
// Acá había una fase más, "eligiendo": no contestó la llamada y se preguntaba
// "¿dejar al final o cerrar la parada?" ANTES de preguntar por qué. Eran dos
// pantallas para una sola decisión —qué hago con esta puerta— y obligaban a
// elegir una categoría antes de poder elegir la respuesta. Ahora las tres
// salidas están juntas en "salidas".
type Fase =
  | "antes_llamar"
  | "esperando_resultado"
  | "confirmado"
  | "esperando_entrega"
  | "salidas";

function telHref(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, "")}`;
}

/** El día anterior a una fecha "YYYY-MM-DD", sin pasar por la zona horaria del
 *  teléfono: con new Date("2026-08-09") y luego getDate() el resultado cambia
 *  según dónde esté parado el aparato. */
function ayerDe(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

// Botones de la hoja: a ancho completo y de 48 px. Es lo que el chofer aprieta
// manejando, con el pulgar y sin mirar mucho.
const BOTON_PRINCIPAL =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_var(--brand-shadow)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
// Los que van de a dos en una grilla. `min-w-0` no es decorativo: un elemento de
// grilla tiene `min-width: auto`, así que el botón de texto más largo se
// ensanchaba por encima de su columna y quedaba visiblemente más grande que el
// de al lado, pisando el hueco. Con el mínimo en cero los dos miden exactamente
// lo mismo, y sin `whitespace-nowrap` una etiqueta larga parte en dos renglones
// en vez de desbordar la píldora.
const BOTON_RESULTADO =
  "flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-center text-sm font-semibold leading-tight transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

/** Con la última lectura más vieja que esto, el punto que se ve ya no es dónde
 *  está el chofer. */
const MS_UBICACION_VIEJA = 12_000;

/** A qué distancia de la parada se avisa que hay que contactar al receptor
 *  (FR-017).
 *
 *  Trescientos metros es más o menos una cuadra y media de Arica: lo suficiente
 *  para que el chofer alcance a llamar y a escuchar la respuesta antes de tener
 *  que estacionar, y no tanto como para que el aviso aparezca cuando todavía
 *  faltan cinco paradas. */
const METROS_AVISO_CONTACTO = 300;

/** Precisión por encima de la cual el punto ya no ubica ni la manzana. */
const PRECISION_DUDOSA_M = 40;

/** Fila de un pedido que todavía no entró en la ruta. Tocarla abre la edición:
 *  es la única forma de arreglar una dirección que no se pudo ubicar.
 *
 *  El estado de ubicación se dice DOS veces a propósito —con el icono tachado y
 *  con la palabra "Corregir"—. Un pedido sin ubicar no entra en ninguna ruta, así
 *  que si el chofer no se entera, ese paquete no sale de la camioneta; y una
 *  marca que solo se distingue por el color no la ve nadie de reojo, a pleno sol,
 *  con el teléfono en una mano (la constitución lo pide explícitamente: los
 *  estados no pueden depender solo del color). */
function FilaPedido({
  pedido,
  primera,
  onEditar,
  onEliminar,
}: {
  pedido: Pedido;
  primera: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const sinUbicar = pedido.lat == null || pedido.lng == null;
  return (
    <FilaDeslizable
      separador={!primera}
      etiqueta={pedido.nombre}
      onEliminar={onEliminar}
      className="bg-card"
    >
      <button
        type="button"
        onClick={onEditar}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm transition-colors active:bg-background"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{pedido.nombre}</p>
          <p className="truncate text-xs text-muted">{pedido.direccion}</p>
          {sinUbicar ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-warn">
              <MapPinOff className="h-3 w-3 shrink-0" />
              Sin ubicar — toca para corregir la dirección
            </p>
          ) : null}
        </div>
        {sinUbicar ? (
          <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
            Corregir
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted">
            <MapPin className="h-3 w-3 shrink-0 text-ok" />
            Ubicado
          </span>
        )}
      </button>
    </FilaDeslizable>
  );
}

/** El renglón de estado del receptor, debajo de la dirección. */
const LINEA_ESTADO = "mt-0.5 flex items-center gap-1 text-xs font-medium";

/** Cuánto se queda a la vista la confirmación de "pedido agregado". Suficiente
 *  para leerla de reojo mientras ya se está escribiendo el siguiente nombre, y
 *  poco como para no quedar tapando el botón de guardar. */
const MS_CONFIRMACION = 3_000;

/** El formulario de un pedido, DENTRO de la hoja deslizable (ver BottomSheet,
 *  prop "vista"): sobre el contenido y debajo de la misma cabecera.
 *
 *  Antes esto se abría como una pantalla aparte encima de todo. Se movió acá
 *  porque abrir otra pantalla para cargar un pedido rompía lo único que la app
 *  del chofer sostiene: que todo pase en el mismo lugar, sobre el mapa. La razón
 *  por la que en su momento salió de la hoja —"el formulario pelea con el gesto
 *  de arrastre"— ya no existe: la hoja se arrastra SOLO desde el tirador, así que
 *  ningún campo le roba el gesto a nada.
 *
 *  Lo que se gana además de la continuidad: la cabecera sigue siendo la parada
 *  activa con su botón, así que se puede cargar un pedido y contestar la parada
 *  que toca sin cerrar nada; y la hoja se puede bajar con el formulario a medio
 *  llenar para mirar el mapa, y volver a subirla tal como estaba.
 *
 *  Cargando uno nuevo se queda abierto después de guardar —los pedidos se cargan
 *  en tanda, uno atrás del otro— y editando se cierra, que es lo que uno espera
 *  al terminar de corregir algo.
 *
 *  Y como el formulario se queda ahí vacío, el "pedido agregado" lo dice esta
 *  vista y no el formulario: asomando desde el borde de abajo, encima de todo y
 *  sin empujar nada. Cargando en tanda, el campo del nombre no se mueve de lugar
 *  entre un pedido y el siguiente. */
function VistaPedido({
  pedido,
  fecha,
  onCerrar,
  onGuardado,
}: {
  /** Sin esto, es uno nuevo. */
  pedido?: Pedido;
  /** Día de trabajo de un pedido nuevo. */
  fecha: string;
  onCerrar: () => void;
  /** El aviso que devuelve el formulario: null si todo salió limpio, o el texto
   *  de una advertencia que hay que dejar escrita (una dirección que no se pudo
   *  ubicar). Qué se hace con eso lo decide la pantalla, que es la que dibuja
   *  TODOS los avisos en un solo lugar (ver PilaNotificaciones). */
  onGuardado: (aviso?: string | null) => void;
}) {
  return (
    <>
      {/* Dos controles que hacen lo mismo, a propósito: la flecha de la
          izquierda es "volver a la lista" y la cruz de la derecha es "cerrar
          esto". El chofer va a buscar una o la otra según de dónde venga, y
          ninguna de las dos está donde el pulgar tape la primera línea del
          formulario. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-divider px-2 py-2">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate font-semibold">
          {pedido ? "Editar pedido" : "Nuevo pedido"}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Sin scroll ni padding propios: los pone el formulario, que necesita
          repartirlos él para dejar el botón de guardar clavado abajo y que solo
          scrollee la parte de los campos. */}
      <div className="min-h-0 flex-1">
        <PedidoFormLocal pedido={pedido} fecha={fecha} onGuardado={onGuardado} />
      </div>
    </>
  );
}

export function PantallaEncomiendas({
  choferId,
  nombreChofer,
  fecha,
  direccionEmpresa,
}: {
  choferId: string;
  nombreChofer: string;
  /** Siempre hoy: la app del chofer trabaja el día en curso. De los anteriores
   *  solo se muestra el resumen del último. */
  fecha: string;
  direccionEmpresa: string | null;
}) {
  const dia = useDiaTrabajo({ choferId, fecha });
  const { paradas, activa, pedidos } = dia;

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La vista de formulario abierta dentro de la hoja: "nuevo" o el pedido que se
  // está corrigiendo. null = cerrada.
  const [formPedido, setFormPedido] = useState<"nuevo" | Pedido | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaRuta | null>(null);
  const [alturaCerrada, setAlturaCerrada] = useState(140);
  // El cajón de la izquierda y los días que muestra. Los días se leen al abrir,
  // no al montar (ver BotonMenu más abajo).
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dias, setDias] = useState<ResumenDia[]>([]);
  // Cuánto ocupan los avisos de arriba. Lo informa la propia pila: cambia con
  // cuántos hay y con el largo del mensaje de un fallo.
  const [altoNotificaciones, setAltoNotificaciones] = useState(0);
  // Ya se marcó el número y falta que el chofer diga si contestó. Es el único
  // estado de flujo que no se puede deducir de los datos.
  const [esperandoResultadoDe, setEsperandoResultadoDe] = useState<string | null>(null);
  // Pedido para el que se está eligiendo QUÉ HACER con la parada que no se pudo
  // entregar: dejarla para el final o tacharla por hoy.
  const [dandoResultadoDe, setDandoResultadoDe] = useState<string | null>(null);
  // Lo último que se cerró, mientras se pueda deshacer.
  const [deshacer, setDeshacer] = useState<{
    pedidoId: string;
    eventoId: string;
    texto: string;
  } | null>(null);
  // Lo último que se eliminó deslizándolo, mientras se pueda volver a poner. A
  // diferencia de `deshacer`, acá la escritura YA ocurrió: esto es el recibo
  // para revertirla, no un evento retenido.
  const [eliminado, setEliminado] = useState<PedidoEliminado | null>(null);
  // La confirmación de que un pedido se guardó. El contador es lo que hace que
  // la segunda seguida se vuelva a animar: cambia la clave del cartel, así que
  // React lo monta de nuevo en vez de dejar el de la primera quieto ahí.
  //
  // Vive acá y no en el formulario que lo produce porque todos los avisos de esta
  // pantalla salen del mismo lugar (ver PilaNotificaciones).
  const [confirmacion, setConfirmacion] = useState<{ texto: string; n: number } | null>(null);
  const [ayer, setAyer] = useState<{ entregadas: number; noEntregadas: number } | null>(null);

  const {
    ubicacion: miUbicacion,
    error: errorUbicacion,
    pedirAhora: pedirUbicacion,
  } = useUbicacionActual(true);

  // Modo navegación (seguir la ubicación). Soltado a mano se queda soltado: el
  // mapa espera donde el chofer lo dejó hasta que toque el botón de fijar.
  const [siguiendo, setSiguiendo] = useState(true);
  // Con una propuesta a la vista el mapa la muestra entera y no sigue a nadie.
  const enNavegacion = siguiendo && !propuesta;

  // La brújula solo se enciende con el mapa suelto: el haz del punto muestra
  // hacia dónde apunta el teléfono. Manejando no aporta y el magnetómetro
  // despierta al aparato varias veces por segundo.
  const rumboBrujula = useBrujula(!enNavegacion);

  const hayRuta = paradas.length > 0;

  const fase: Fase =
    activa == null
      ? "antes_llamar"
      : dandoResultadoDe === activa.pedido.id
        ? "salidas"
        : esperandoResultadoDe === activa.pedido.id
          ? "esperando_resultado"
          : activa.pedido.llamada === "contesto"
            ? "confirmado"
            : // Se lo llamó y no contestó: se queda en la misma pregunta —qué pasó
              // con la llamada— y no pasa a la de entregar.
              //
              // Esta rama es la que faltaba, y su ausencia era un agujero, no una
              // decisión. "esperando_entrega" existe para UN caso: el receptor
              // confirmó por WhatsApp que va a estar, así que no hay nada que
              // preguntarle por teléfono. Pero se caía en ella también por
              // descarte, porque hayQueContactar significa "falta llamarlo" y deja
              // de ser cierto en cuanto se lo llamó — conteste o no conteste. Así,
              // volver atrás de las salidas aterrizaba en una tercera pantalla que
              // nadie diseñó: el renglón decía "No contestó la llamada" y abajo
              // ofrecía "Pedido finalizado" como acción principal, más un segundo
              // "Llamar" y un "No se pudo" que son el mismo triple otra vez.
              //
              // Se decide por el DATO guardado y no por el estado de pantalla:
              // cerrar la app y volver a abrirla con la parada así vuelve al mismo
              // lugar, en vez de aparecer en la pantalla de entregar.
              activa.pedido.llamada === "no_contesto"
              ? "esperando_resultado"
              : !activa.hayQueContactar
                ? "esperando_entrega"
                : "antes_llamar";

  // Instrucción paso a paso hacia la parada activa.
  const destinoActivo = useMemo(() => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return null;
    return { lat: activa.pedido.lat, lng: activa.pedido.lng };
  }, [activa]);

  // Recibe la posición CRUDA, no la pegada al camino: es la que decide si el
  // chofer se salió de la ruta, y un punto pegado está sobre la ruta por
  // definición — alimentarlo con eso haría que un desvío no se detecte nunca.
  const navegacion = useNavegacion(!!destinoActivo, miUbicacion, destinoActivo);

  // Con una propuesta a la vista la voz se calla: el chofer está parado
  // decidiendo si la usa, y lo que sonaría son indicaciones de la ruta anterior.
  const voz = useVozNavegacion(!propuesta, navegacion.paso, navegacion.metrosAManiobra);

  // La pantalla apagada suspende el GPS: sin esto el punto se congela a los
  // treinta segundos de no tocar nada, que es lo que pasa manejando.
  usePantallaEncendida(hayRuta);

  // La lectura cruda del GPS cae adentro de las manzanas. Mientras haya trazado
  // que seguir, el punto se dibuja SOBRE él.
  const pegado = usePuntoEnRuta(miUbicacion, navegacion.trazado);

  // FR-017: si hay que avisarle que llame. Está llegando a una parada cuyo
  // receptor no contestó el WhatsApp y a la que todavía no llamó.
  //
  // Se mide sobre el TRAZADO y no en línea recta: lo que importa es cuánto le
  // falta manejar, y en Arica una parada a doscientos metros en línea recta puede
  // estar a ochocientos por calle si en el medio hay una quebrada. En línea recta
  // el aviso saltaría demasiado pronto y dejaría de significar algo.
  //
  // Sin trazado (sin señal) no se avisa por distancia: no hay con qué medir, y
  // adivinarlo con la línea recta sería justo el error de arriba. El estado del
  // receptor igual se ve en la tarjeta.
  const seAproximaSinContacto = useMemo(() => {
    if (!activa?.hayQueContactar) return false;
    const desde = pegado ?? miUbicacion;
    if (!desde || !navegacion.trazado) return false;
    return metrosRestantes(desde, navegacion.trazado) <= METROS_AVISO_CONTACTO;
  }, [activa, pegado, miUbicacion, navegacion.trazado]);

  // Hacia dónde orientar la vista: el camino que viene por delante en la propia
  // ruta, medido desde el punto ya pegado. Se prefiere eso al rumbo del GPS —que
  // en iPhone llega null casi siempre— y sobre todo a la brújula, que apunta
  // hacia donde quedó apoyado el teléfono y no hacia donde va el camino.
  const rumbo = useMemo(() => {
    const desde = pegado ?? miUbicacion;
    if (desde && navegacion.trazado) {
      const delCamino = rumboDelCamino(desde, navegacion.trazado, 45, pegado?.indice);
      if (delCamino != null) return delCamino;
    }
    return miUbicacion?.heading ?? null;
  }, [pegado, miUbicacion, navegacion.trazado]);

  const ubicacionMostrada: Ubicacion | null = useMemo(
    () =>
      pegado && miUbicacion ? { ...miUbicacion, lat: pegado.lat, lng: pegado.lng } : miUbicacion,
    [pegado, miUbicacion],
  );

  // La línea azul arranca en el punto y no media cuadra más atrás: con el mapa
  // girado, la cola del tramo ya recorrido apunta hacia atrás y se lee como un
  // camino a tomar.
  const trazadoPorDelante = useMemo(
    () =>
      pegado && navegacion.trazado
        ? recortarTrazado(navegacion.trazado, pegado)
        : navegacion.trazado,
    [pegado, navegacion.trazado],
  );

  // Que la última lectura haya quedado vieja se mira con un reloj propio:
  // mientras el GPS avisa cada lectura provoca un dibujado, pero cuando DEJA de
  // avisar —que es el caso a denunciar— no hay nada que lo dispare.
  const ubicacionRef = useRef(miUbicacion);
  useEffect(() => {
    ubicacionRef.current = miUbicacion;
  }, [miUbicacion]);

  const [ubicacionVieja, setUbicacionVieja] = useState(false);
  useEffect(() => {
    if (!hayRuta) return;
    const t = setInterval(() => {
      const tomadaEn = ubicacionRef.current?.tomadaEn;
      setUbicacionVieja(tomadaEn != null && Date.now() - tomadaEn > MS_UBICACION_VIEJA);
    }, 2_000);
    return () => clearInterval(t);
  }, [hayRuta]);

  const señalDebil =
    miUbicacion != null &&
    (ubicacionVieja ||
      (miUbicacion.precisionM != null && miUbicacion.precisionM > PRECISION_DUDOSA_M));

  // Resumen del día anterior: cuántas cerró y cuántas quedaron. No hay navegador
  // de fechas — el chofer no vuelve a trabajar un día pasado, solo quiere saber
  // cómo terminó el último.
  useEffect(() => {
    void (async () => {
      try {
        const diaAnterior = ayerDe(fecha);
        const [ruta, pedidosAyer] = await Promise.all([
          leerRuta(diaAnterior),
          leerPedidos(diaAnterior),
        ]);
        const resumen = ruta ? resumirDia(ruta, pedidosAyer) : null;
        setAyer(
          resumen && resumen.paradas > 0
            ? { entregadas: resumen.entregadas, noEntregadas: resumen.noEntregadas }
            : null,
        );
      } catch {
        // El resumen de ayer es un extra: si el teléfono no lo puede leer, la
        // pantalla de hoy no tiene por qué enterarse.
      }
    })();
  }, [fecha]);

  // ------------------------------------------------------------------------
  // La ventana para deshacer
  // ------------------------------------------------------------------------
  // Se cuenta con reloj propio y se PAUSA con la app en segundo plano: al
  // finalizar un pedido se marca solo el teléfono del siguiente, así que el
  // chofer se va a la app de llamadas y volvería con la ventana vencida sin
  // haber tenido oportunidad de ver el aviso.
  //
  // `confirmar` se lee de un ref: la función cambia de identidad en cada
  // dibujado, y como dependencia reiniciaría la cuenta una y otra vez —el aviso
  // no se iría nunca y la entrega no saldría del teléfono.
  const confirmarRef = useRef(dia.confirmar);
  useEffect(() => {
    confirmarRef.current = dia.confirmar;
  });

  useEffect(() => {
    if (!deshacer) return;

    let restante = MS_DESHACER;
    let desde = Date.now();
    let temporizador = 0;

    const vencer = () => {
      setDeshacer(null);
      void confirmarRef.current();
    };
    const arrancar = () => {
      desde = Date.now();
      temporizador = window.setTimeout(vencer, restante);
    };
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        clearTimeout(temporizador);
        restante = Math.max(0, restante - (Date.now() - desde));
      } else {
        arrancar();
      }
    };

    arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [deshacer]);

  // La ventana para volver a poner un pedido eliminado. Es un temporizador
  // simple, sin la pausa en segundo plano que necesita el de arriba: acá no hay
  // nada retenido esperando salir —el pedido ya se borró— así que vencer solo
  // quiere decir que la oferta de restaurarlo se retira. El recibo se pierde con
  // la app cerrada y eso es correcto: un pedido que reapareciera solo sería peor
  // que uno que se fue.
  useEffect(() => {
    if (!eliminado) return;
    const temporizador = window.setTimeout(() => setEliminado(null), MS_DESHACER);
    return () => clearTimeout(temporizador);
  }, [eliminado]);

  useEffect(() => {
    if (!confirmacion) return;
    const temporizador = window.setTimeout(() => setConfirmacion(null), MS_CONFIRMACION);
    return () => clearTimeout(temporizador);
  }, [confirmacion]);

  // Envuelve una escritura del chofer: apaga los botones mientras corre y deja
  // el mensaje a la vista si falla.
  const correr = useCallback(async <T,>(accion: () => Promise<T>): Promise<T | null> => {
    setError(null);
    setGuardando(true);
    try {
      return await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  }, []);

  async function onContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    await correr(() => dia.marcarLlamada(id, "contesto"));
    setEsperandoResultadoDe(null);
  }

  async function onNoContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    // La llamada se registra igual: es un hecho, y de eso depende el fijo
    // diario. Lo que falta decidir es qué se hace con la parada.
    //
    // Salvo que ya estuviera marcada. Ahora se vuelve a esta pregunta cada vez
    // que el chofer sale de las salidas, y volver a escribirla pisaría la hora
    // real de la llamada con la de ahora.
    if (activa.pedido.llamada !== "no_contesto") {
      await correr(() => dia.marcarLlamada(id, "no_contesto"));
    }
    setEsperandoResultadoDe(null);
    // Derecho a las salidas, sin una pregunta intermedia.
    setDandoResultadoDe(id);
  }

  function onLlamar(parada: Parada) {
    window.location.href = telHref(parada.pedido.telefono);
    setEsperandoResultadoDe(parada.pedido.id);
  }

  /** Las dos salidas de una parada que no se pudo cerrar entregando.
   *
   *  "Dejar como pendiente" NO cierra la parada: la manda al final de la ruta
   *  para reintentarla al terminar el resto. No genera ningún evento, así que
   *  tampoco hay nada que deshacer.
   *
   *  "No entregado" la tacha por hoy, sin motivo (spec 012): no se decide si es
   *  temporal o para siempre. Si el paquete vuelve a salir otro día, se escanea
   *  de nuevo. Es lo mismo que deja el receptor que pide "Mañana". */
  const SALIDAS = [
    {
      clave: "pendiente",
      etiqueta: "Dejar como pendiente",
      aviso: "Queda para el final de la ruta",
      detalle: "Se reintenta al final",
    },
    {
      clave: "no_entregado",
      etiqueta: "No entregado",
      aviso: "Marcado: no entregado",
      detalle: "Se tacha por hoy",
    },
  ] as const;

  async function onSalida(salida: (typeof SALIDAS)[number]) {
    if (!activa) return;
    const id = activa.pedido.id;

    if (salida.clave === "pendiente") {
      await correr(() => dia.dejarParaElFinal(id));
      setDandoResultadoDe(null);
      setEsperandoResultadoDe(null);
      // Sin evento no hay deshacer, pero la parada desaparece de arriba de la
      // lista: sin un aviso, parece que se perdió.
      setConfirmacion((c) => ({ texto: salida.aviso, n: (c?.n ?? 0) + 1 }));
      return;
    }

    const eventoId = await correr(() => dia.marcarResultado(id, salida.clave));
    setDandoResultadoDe(null);
    setEsperandoResultadoDe(null);
    if (eventoId) setDeshacer({ pedidoId: id, eventoId, texto: salida.aviso });
  }

  async function onPedidoFinalizado() {
    if (!activa) return;
    const id = activa.pedido.id;
    // Antes de escribir (lo que recalcula "activa") ubicamos a quién sigue, para
    // poder marcar su número de una vez.
    const siguiente = paradas.find(
      (p) => p.secuencia > activa.secuencia && p.pedido.resultado === "pendiente",
    );

    const eventoId = await correr(() => dia.marcarResultado(id, "entregado"));
    if (eventoId) setDeshacer({ pedidoId: id, eventoId, texto: "Entrega registrada" });

    if (siguiente) {
      window.location.href = telHref(siguiente.pedido.telefono);
      setEsperandoResultadoDe(siguiente.pedido.id);
    } else {
      setEsperandoResultadoDe(null);
    }
  }

  /** Un pedido que el chofer deslizó hacia la izquierda y eliminó.
   *
   *  Sirve tanto para los que están fuera de la ruta como para las paradas de la
   *  ruta del día: el almacén saca las dos cosas en una transacción y devuelve el
   *  recibo con el lugar que ocupaba, así que deshacer la deja donde estaba y no
   *  al final. */
  async function onEliminarPedido(pedidoId: string) {
    const recibo = await correr(() => dia.eliminarPedido(pedidoId));
    // null = ya no estaba (dos gestos sobre la misma fila). Sin recibo no hay
    // nada que ofrecer deshacer.
    if (recibo) setEliminado(recibo);
  }

  async function onDeshacerEliminado() {
    if (!eliminado) return;
    const recibo = eliminado;
    setEliminado(null);
    await correr(() => dia.restaurar(recibo));
  }

  async function onDeshacer() {
    if (!deshacer) return;
    const { pedidoId, eventoId } = deshacer;
    setDeshacer(null);
    await correr(() => dia.deshacer(pedidoId, eventoId));
    // Volver a la parada reabierta como si no hubiera pasado nada: si venía de
    // "contestó", el paso que corresponde es finalizar; si no, llamar.
    setEsperandoResultadoDe(null);
  }

  // Cambiar de alternativa pide el trazado de la nueva (una consulta), así que
  // la propuesta se reemplaza recién cuando llega. Si la consulta falla, la
  // pantalla se queda con la que estaba: mejor eso que un mapa en blanco.
  const onElegirAlternativa = useCallback(
    async (estrategia: EstrategiaRuta) => {
      if (!propuesta) return;
      setPropuesta(await elegirAlternativa(propuesta, estrategia));
    },
    [propuesta],
  );

  const onUsarPropuesta = useCallback(async () => {
    if (!propuesta) return;
    const enLaRuta = propuesta.paradas.map((p) => p.id);
    await confirmarRutaLocal(propuesta);
    await dia.recargar();
    setPropuesta(null);
    // Acá se cumple FR-007: el aviso sale en cuanto el pedido queda ubicado
    // DENTRO de una ruta, no al cargarlo. Antes de eso no hay nada que
    // prometerle al receptor — todavía podía caerse por una dirección que no se
    // pudo ubicar.
    //
    // No se espera el resultado: son treinta consultas al servidor y el chofer no
    // tiene por qué mirar una pantalla trabada mientras salen. Lo que salió y lo
    // que falló queda en el estado de cada pedido (dia.whatsapp), con su
    // botón de reintentar al lado.
    void dia.avisarPedidos(enLaRuta);
  }, [propuesta, dia]);

  // Memorizado a propósito: el mapa usa esta lista como dependencia de sus
  // efectos, y si se recreara en cada dibujado (la ubicación GPS re-dibuja
  // seguido) volvería a re-encuadrar el mapa una y otra vez.
  const puntos: PuntoMapa[] = useMemo(
    () =>
      paradas
        .filter((p) => p.pedido.lat != null && p.pedido.lng != null)
        .map((p) => ({
          id: p.pedido.id,
          lat: p.pedido.lat!,
          lng: p.pedido.lng!,
          label: String(p.secuencia),
          activa: p.pedido.id === activa?.pedido.id,
          completada: p.pedido.resultado === "entregado",
        })),
    [paradas, activa],
  );

  const previa = useMemo<PreviaRuta | null>(
    () =>
      propuesta
        ? {
            puntos: propuesta.paradas.map((p, i) => ({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              label: String(propuesta.cerradas + i + 1),
              activa: false,
              completada: false,
            })),
            trazado: propuesta.trazado,
          }
        : null,
    [propuesta],
  );

  if (dia.cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">
        Cargando tu ruta…
      </div>
    );
  }

  if (dia.error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold">No se pudo abrir tu ruta</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{dia.error}</p>
        {/* Acá había un "Volver al inicio" al hub. Ahora el hub reenvía a esta
            misma pantalla, así que ese link era un rebote infinito justo para
            el chofer que ya no puede trabajar. Las dos salidas reales son
            volver a intentar —el fallo suele ser el almacén del teléfono, que
            a veces anda al recargar— y salir de la sesión. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-white"
        >
          <RotateCw className="h-4 w-4" />
          Reintentar
        </button>
        <form action={logout} className="mt-6">
          <button type="submit" className="flex items-center gap-2 text-sm text-muted">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    );
  }

  const enRuta = new Set(paradas.map((p) => p.pedido.id));
  const pendientesSueltos = pedidos.filter((p) => p.resultado === "pendiente");
  const sinRutear = pendientesSueltos.filter((p) => !enRuta.has(p.id));
  const sinUbicar = sinRutear.filter((p) => p.lat == null || p.lng == null).length;
  const entregadas = paradas.filter((p) => p.pedido.resultado === "entregado").length;
  const noEntregadas = paradas.filter((p) => p.pedido.resultado === "no_entregado").length;
  const porcentaje = paradas.length > 0 ? Math.round((entregadas / paradas.length) * 100) : 0;

  // Cómo va el día, para el carril de arriba del mapa: entregadas sobre el
  // total, y las que no se pudieron entregar solo si hay alguna. Lo que falta no
  // se escribe — es la resta, y una cifra más es una cifra que hay que descartar
  // antes de leer la que importa.
  //
  // Vive arriba y no en la hoja porque es el único dato que el chofer quiere de
  // reojo, manejando, sin abrir nada. Y se dibuja SIEMPRE que haya ruta, con
  // maniobra o sin ella: la versión anterior se escondía justo cuando había
  // navegación, o sea justo cuando el chofer no puede abrir la hoja para
  // buscarlo.
  //
  // En columna y no en fila: así ocupa el alto que el cartel ya tiene y no le
  // roba ancho al nombre de la calle, que es lo único que se lee de un vistazo.
  const resumenDelDia =
    hayRuta && !propuesta ? (
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold leading-tight">
        <span className="flex items-center gap-1 tabular-nums text-ok">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {entregadas}/{paradas.length}
        </span>
        {noEntregadas > 0 ? (
          <span className="flex items-center gap-1 tabular-nums text-danger">
            <X className="h-3.5 w-3.5 shrink-0" />
            {noEntregadas}
          </span>
        ) : null}
      </div>
    ) : null;

  // Todo lo que la pantalla le tiene que decir al chofer, en una sola lista y en
  // un solo lugar: cae desde el borde de arriba (ver PilaNotificaciones). Se
  // llaman notificaciones y no avisos: el aviso es el WhatsApp al receptor.
  //
  // El orden es fijo y va de lo más reversible a lo menos: primero lo que ofrece
  // deshacer algo —y tiene un plazo corriendo— y al final la confirmación, que no
  // ofrece nada. Con dos a la vista, el botón de deshacer queda siempre en el
  // mismo renglón y no baila según cuál llegó antes.
  const notificaciones: Notificacion[] = [];
  // El fallo de una escritura va primero y no se va solo: se cierra a mano, o lo
  // limpia la próxima acción que salga bien (ver correr).
  //
  // Antes esto se dibujaba adentro de los controles de la parada activa, así que
  // sin ruta armada no se dibujaba en ningún lado: un pedido que no se pudo
  // guardar ni eliminar —el teléfono sin espacio, el navegador en modo privado—
  // fallaba en silencio y el chofer volvía a intentarlo sin saber por qué.
  if (error) {
    notificaciones.push({
      id: `error:${error}`,
      icono: <AlertTriangle className="h-4 w-4" />,
      texto: error,
      tono: "error",
      accion: { etiqueta: "Cerrar", onClick: () => setError(null) },
    });
  }
  // Que WhatsApp esté caído no es una alarma —el sondeo reintenta solo— pero
  // mientras lo esté no van a llegar respuestas, y el chofer tiene que saber que
  // esperarlas no sirve: lo que corresponde es llamar. Es lo único que quedó
  // visible del canal.
  if (hayRuta && dia.errorWhatsapp) {
    notificaciones.push({
      id: "whatsapp",
      icono: <MessageCircleOff className="h-4 w-4 text-white/70" />,
      texto: "WhatsApp no está disponible: llama a los clientes que no respondieron.",
      tono: "error",
    });
  }
  // Lo que las respuestas le cambiaron a la ruta en curso (spec 010): uno a la
  // vez, del más viejo al más nuevo, hasta que el conductor lo da por leído.
  if (dia.cambiosRuta.length > 0) {
    notificaciones.push({
      id: `ruta:${dia.cambiosRuta[0]}`,
      icono: <Route className="h-4 w-4 text-white/70" />,
      texto: dia.cambiosRuta[0],
      accion: { etiqueta: "Entendido", onClick: dia.vistoCambioRuta },
    });
  }
  if (eliminado) {
    notificaciones.push({
      id: `eliminado:${eliminado.pedido.id}`,
      icono: <Trash2 className="h-4 w-4 text-white/70" />,
      texto: `Eliminado: ${eliminado.pedido.nombre}`,
      accion: {
        etiqueta: "Deshacer",
        icono: <Undo2 className="h-4 w-4" />,
        onClick: () => void onDeshacerEliminado(),
      },
    });
  }
  if (deshacer) {
    // Mientras este aviso está a la vista, lo que se marcó no salió del teléfono
    // ni cerró el día (ver use-dia-trabajo).
    notificaciones.push({
      id: `deshacer:${deshacer.eventoId}`,
      icono: <Check className="h-4 w-4 text-ok" />,
      texto: deshacer.texto,
      accion: {
        etiqueta: "Deshacer",
        icono: <Undo2 className="h-4 w-4" />,
        onClick: () => void onDeshacer(),
      },
    });
  }
  if (confirmacion) {
    notificaciones.push({
      id: `guardado:${confirmacion.n}`,
      icono: <Check className="h-4 w-4 text-ok" />,
      texto: confirmacion.texto,
    });
  }

  // ------------------------------------------------------------------------
  // La cabecera de la hoja: lo único visible manejando
  // ------------------------------------------------------------------------
  // Muestra siempre el paso que toca AHORA, y solo ese. Sin ruta armada el paso
  // no es una parada: es cargar los pedidos o armar la ruta.
  //
  // Y mientras se carga o se corrige un pedido, el paso que toca es ESE: la
  // cabecera se calla y queda un contador de pendientes. Dos razones, y la
  // segunda es la que importa:
  //
  //  - Los pedidos se cargan en tanda, uno atrás del otro, y el contador subiendo
  //    es la única señal de cuántos van sin cerrar el formulario para contarlos.
  //  - Armar la ruta no es lo que se está haciendo. El botón quedaba justo arriba
  //    del campo del nombre, y armarla a mitad de una tanda deja afuera los
  //    pedidos que faltaban cargar.
  const cabecera = formPedido && !hayRuta ? (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold tabular-nums text-brand">
        {sinRutear.length}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          {sinRutear.length === 1
            ? "1 pedido pendiente"
            : `${sinRutear.length} pedidos pendientes`}
        </p>
        <p className="text-xs text-muted">Sin ruta armada.</p>
      </div>
    </div>
  ) : !hayRuta ? (
    <div className="space-y-2.5">
      <div>
        <p className="text-sm font-semibold">Hola, {nombreChofer.split(" ")[0]}</p>
        <p className="text-xs text-muted">
          {sinRutear.length === 0
            ? "No hay pedidos cargados ni ruta generada."
            : sinRutear.length === 1
              ? "1 pedido pendiente, sin ruta armada."
              : `${sinRutear.length} pedidos pendientes, sin ruta armada.`}
        </p>
      </div>
      {/* Sin nada cargado la cabecera NO lleva botón: "Agregar pedido" ya está
          adentro de la hoja, al pie de la lista de pedidos, y tenerlo en los dos
          lugares hacía dudar de si eran lo mismo. Queda el de abajo, que está
          donde se ven los pedidos, y acá solo se dice qué falta y cómo llegar. */}
      {sinRutear.length === 0 ? (
        <p className="rounded-2xl bg-background px-3.5 py-3 text-xs text-muted">
          Desliza esta hoja hacia arriba para cargar los pedidos del día.
        </p>
      ) : (
        <GenerarRutaLocal
          fecha={fecha}
          direccionEmpresa={direccionEmpresa}
          regenerar={false}
          onPropuesta={setPropuesta}
        />
      )}
    </div>
  ) : !activa ? (
    <div className="flex items-center gap-3">
      <PackageCheck className="h-7 w-7 shrink-0 text-ok" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">¡Ruta completa!</p>
        <p className="text-xs text-muted">
          {entregadas} {entregadas === 1 ? "entrega" : "entregas"}
          {noEntregadas > 0 ? ` · ${noEntregadas} sin entregar` : ""}
        </p>
      </div>
    </div>
  ) : (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold tabular-nums text-brand-foreground">
          {activa.secuencia}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">{activa.pedido.nombre}</p>
          <p className="truncate text-sm text-muted">{activa.pedido.direccion}</p>
          {/* Qué contestó ESTE RECEPTOR. Es lo primero que el chofer necesita al
              llegar: saber si lo están esperando cambia lo que hace en la puerta.
              Cada estado lleva icono Y texto — a pleno sol, con el teléfono en
              una mano, el color solo no se distingue.
              Lo que NO va acá es lo que el chofer acabó de tocar. Había un "No
              contestó la llamada" y era ruido en el único renglón que se lee
              manejando: lo dijo él hace dos segundos, y los botones de abajo ya
              están preguntando justamente por eso. */}
          {activa.pedido.bloqueHorarioId ? (
            <p className={cn(LINEA_ESTADO, "text-brand")}>
              <Clock className="h-3 w-3 shrink-0" />
              Pidió {bloquePorId(activa.pedido.bloqueHorarioId)?.etiqueta ?? "un horario"}
            </p>
          ) : activa.pedido.disponibilidad === "confirmado" ? (
            <p className={cn(LINEA_ESTADO, "text-ok")}>
              <Check className="h-3 w-3 shrink-0" />
              Estará en su domicilio
            </p>
          ) : activa.pedido.llamada === "no_contesto" ? null : (
            <p className={cn(LINEA_ESTADO, "text-muted")}>
              <Phone className="h-3 w-3 shrink-0" />
              Sin respuesta todavía
            </p>
          )}
        </div>
        {navegacion.metrosAManiobra != null && navegacion.metrosAManiobra > 0 ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">
            {formatDistancia(navegacion.metrosAManiobra)}
          </span>
        ) : null}
      </div>

      {/* FR-017: al aproximarse a un pedido pendiente de respuesta, avisar que
          hay que contactarlo. Se muestra ACÁ y no como notificación porque el
          chofer está manejando y esta tarjeta es lo único que mira. */}
      {seAproximaSinContacto ? (
        <p className="flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2 text-sm font-medium text-warn">
          <Phone className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Estás llegando y este cliente no contestó. Conviene llamarlo antes de bajar.
          </span>
        </p>
      ) : null}

      {fase === "antes_llamar" ? (
        <button onClick={() => onLlamar(activa)} className={BOTON_PRINCIPAL}>
          <Phone className="h-4 w-4" />
          Llamar
        </button>
      ) : null}

      {fase === "esperando_resultado" ? (
        // El botón de llamar queda en el medio para poder reintentar sin tener
        // que decidir todavía si contestó o no (suena ocupado, se cortó).
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            disabled={guardando}
            onClick={onContesto}
            className={cn(BOTON_RESULTADO, "bg-ok text-white")}
          >
            <Check className="h-4 w-4 shrink-0" />
            Contestó
          </button>
          <button
            onClick={() => onLlamar(activa)}
            aria-label="Volver a llamar"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-separator bg-card text-muted transition-transform active:scale-[0.97]"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            disabled={guardando}
            onClick={onNoContesto}
            className={cn(BOTON_RESULTADO, "bg-danger text-white")}
          >
            <X className="h-4 w-4 shrink-0" />
            No contestó
          </button>
        </div>
      ) : null}

      {/* Ya confirmó por WhatsApp: no hay nada que preguntarle por teléfono. Es
          el caso que hace que avisarle AHORRE trabajo y no solo agregue datos. */}
      {fase === "esperando_entrega" || fase === "confirmado" ? (
        <div className="space-y-2">
          <button disabled={guardando} onClick={onPedidoFinalizado} className={BOTON_PRINCIPAL}>
            <PackageCheck className="h-4 w-4" />
            Pedido finalizado
          </button>
          <div className="grid grid-cols-2 gap-2">
            {/* Llamar sigue disponible aunque haya confirmado: puede no abrir. */}
            <button
              onClick={() => onLlamar(activa)}
              className={cn(BOTON_RESULTADO, "border border-separator bg-card text-brand")}
            >
              <Phone className="h-4 w-4 shrink-0" />
              Llamar
            </button>
            <button
              disabled={guardando}
              onClick={() => setDandoResultadoDe(activa.pedido.id)}
              className={cn(BOTON_RESULTADO, "border border-separator bg-card text-danger")}
            >
              No se pudo
            </button>
          </div>
        </div>
      ) : null}

      {/* Las salidas de la parada, en una sola pantalla. */}
      {fase === "salidas" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">¿Qué hacemos con esta parada?</p>
          <div className="grid gap-2">
            {SALIDAS.map((salida) => (
              <button
                key={salida.clave}
                disabled={guardando}
                onClick={() => void onSalida(salida)}
                className="flex h-12 items-center gap-2 rounded-full border border-separator bg-card px-4 text-left text-sm font-semibold text-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
              >
                {salida.clave === "pendiente" ? (
                  <RotateCw className="h-4 w-4 shrink-0 text-brand" />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-danger" />
                )}
                <span className="min-w-0 flex-1">{salida.etiqueta}</span>
                {/* La consecuencia, escrita: el conductor la tiene que ver
                    ANTES de tocar. */}
                <span className="shrink-0 text-[11px] font-medium text-muted">
                  {salida.detalle}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDandoResultadoDe(null)}
            className="w-full rounded-full py-2 text-sm text-muted active:bg-background"
          >
            Volver
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="fixed inset-0">
      {/* z-0 encierra los z-index internos del mapa en su propio contexto de
          apilamiento: si no, se escapan por encima de la hoja. */}
      <div className="absolute inset-0 z-0">
        <RutaMapa
          puntos={puntos}
          miUbicacion={ubicacionMostrada}
          rumbo={rumbo}
          rumboBrujula={rumboBrujula}
          claveDestino={destinoActivo ? `${destinoActivo.lat},${destinoActivo.lng}` : null}
          trazado={dia.ruta?.trazado ?? null}
          geometriaNavegacion={trazadoPorDelante}
          previa={previa}
          siguiendo={enNavegacion}
          onArrastre={() => {
            // Mover el mapa para mirar bien una ruta propuesta no es "quiero
            // mirar otra cosa mientras manejo".
            if (!propuesta) setSiguiendo(false);
          }}
        />
      </div>

      <PilaNotificaciones notificaciones={notificaciones} onAltura={setAltoNotificaciones} />

      {menuAbierto ? (
        <MenuLateral
          nombreChofer={nombreChofer}
          dias={dias}
          fechaActiva={fecha}
          onCerrar={() => setMenuAbierto(false)}
          logout={logout}
        />
      ) : null}

      {/* La flecha de volver, el cartel de navegación con el resumen adentro, y
          los avisos del GPS. Se corren para abajo lo que ocupen los avisos, en
          vez de quedar tapados por ellos: el cartel de navegación es lo que el
          chofer está leyendo para saber dónde doblar. */}
      <div
        className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex flex-col gap-2 transition-[margin-top] duration-200"
        style={{ marginTop: altoNotificaciones }}
      >
        <div className="flex items-center gap-2">
          {/* Donde estaba la flecha de volver. Se fue con el hub: entrar ya no
              pasa por un menú, así que no hay nada atrás. Lo que el hub sí
              guardaba —quién está y cómo cerrar sesión— vive ahora acá adentro,
              junto con los días. */}
          <BotonMenu
            onAbrir={() => {
              setMenuAbierto(true);
              // Se leen al abrir y no al montar: es una consulta al teléfono que
              // no hace falta para repartir, y así la lista está fresca aunque
              // el día se haya cerrado con el menú ya usado antes.
              void leerDias().then(setDias);
            }}
          />
          {navegacion.paso && !propuesta ? (
            <InstruccionNavegacion
              paso={navegacion.paso}
              siguiente={navegacion.siguiente}
              metros={navegacion.metrosAManiobra}
              resumen={resumenDelDia}
            />
          ) : resumenDelDia ? (
            // Sin maniobra queda el mismo cartel, en el mismo lugar, con el
            // resumen solo. Pegado a la derecha (ml-auto) para que no se mueva
            // de costado cuando la navegación aparece o se corta: el número
            // termina siempre en el mismo borde.
            <div className={cn(CAJA_CARRIL, "ml-auto")}>{resumenDelDia}</div>
          ) : null}
        </div>

        {errorUbicacion ? (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn shadow-md">
            {errorUbicacion}
          </p>
        ) : señalDebil ? (
          <p className="self-start rounded-full bg-warn-bg px-3 py-1.5 text-xs text-warn shadow-md">
            Señal de GPS débil: la ubicación puede estar desactualizada.
          </p>
        ) : null}
      </div>

      {/* Controles del mapa, justo encima de la hoja cerrada. La altura la
          informa la propia hoja: cambia con el paso de la parada. */}
      {!propuesta ? (
        <div
          className="absolute right-3 z-10 flex flex-col gap-2"
          style={{ bottom: alturaCerrada + 12 }}
        >
          {voz.disponible ? (
            <button
              onClick={voz.alternar}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
              aria-label={voz.activa ? "Silenciar indicaciones" : "Activar indicaciones por voz"}
            >
              {voz.activa ? (
                <Volume2 className="h-5 w-5 text-brand" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted" />
              )}
            </button>
          ) : null}
          <button
            onClick={() => {
              setSiguiendo(true);
              pedirUbicacion();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
            aria-label="Centrar y seguir mi ubicación"
          >
            <LocateFixed
              className={`h-5 w-5 ${enNavegacion && miUbicacion ? "text-brand" : "text-muted"}`}
            />
          </button>
        </div>
      ) : null}

      <BottomSheet
        cabecera={cabecera}
        senalCerrar={propuesta ?? null}
        onAlturaCerrada={setAlturaCerrada}
        vista={
          formPedido ? (
            <VistaPedido
              pedido={formPedido === "nuevo" ? undefined : formPedido}
              fecha={fecha}
              onCerrar={() => setFormPedido(null)}
              onGuardado={(aviso) => {
                void dia.recargar();
                const esNuevo = formPedido === "nuevo";
                // Corrigiendo uno, el trabajo terminó y la vista se cierra sola.
                // Cargando nuevos, el formulario se queda: se cargan en tanda.
                if (!esNuevo) setFormPedido(null);
                // Editando no hay nada que confirmar: la vista se cierra sola y
                // eso ya se ve. Y con una advertencia tampoco —una dirección que
                // no se pudo ubicar—: esa se queda escrita en el formulario, y
                // taparla con un cartel que se va solo sería justo lo contrario
                // de lo que hay que hacer con ella.
                if (esNuevo && aviso == null) {
                  setConfirmacion((c) => ({
                    texto: "Pedido agregado — listo para el siguiente",
                    n: (c?.n ?? 0) + 1,
                  }));
                }
              }}
            />
          ) : null
        }
      >
        {hayRuta ? (
          <>
            {activa?.pedido.notas ? (
              <div className="mb-4 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                {activa.pedido.notas}
              </div>
            ) : null}

            <Seccion titulo="Ruta del día">
              <div className="mb-2.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ececef]">
                  <div
                    className="h-full rounded-full bg-ok transition-[width] duration-500"
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                  {entregadas} de {paradas.length}
                </span>
              </div>

              <ol className="overflow-hidden rounded-2xl bg-card shadow-soft">
                {paradas.map((p, i) => {
                  const esActiva = p.pedido.id === activa?.pedido.id;
                  return (
                    <FilaDeslizable
                      key={p.pedido.id}
                      separador={i > 0}
                      etiqueta={p.pedido.nombre}
                      onEliminar={() => void onEliminarPedido(p.pedido.id)}
                      // Una parada ya cerrada no se desliza. Lo que se ve ahí es
                      // el registro de lo que pasó en el día —cuántas se
                      // entregaron, cuántas no y por qué—, y es lo que el jefe
                      // va a mirar después: sacarlo de la lista con un gesto lo
                      // haría desaparecer de la vista del chofer sin que nada
                      // más cambie. Para eliminar hay que dejarla pendiente.
                      habilitado={p.pedido.resultado === "pendiente"}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-2.5 text-sm",
                        esActiva ? "bg-brand-soft" : "bg-card",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-center text-xs font-semibold tabular-nums",
                          esActiva ? "text-brand" : "text-muted",
                        )}
                      >
                        {p.secuencia}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate font-medium leading-tight",
                            p.pedido.resultado === "entregado" && "text-muted",
                          )}
                        >
                          {p.pedido.nombre}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {p.pedido.direccion}
                        </span>
                      </span>
                      {/* Lo que contestó el receptor, en la propia lista: es
                          lo que el chofer mira para decidir el orden real y a
                          quién llamar. Cada estado con icono, no solo color. */}
                      {p.pedido.resultado === "pendiente" ? (
                        p.pedido.bloqueHorarioId ? (
                          <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums text-brand">
                            <Clock className="h-3 w-3" />
                            {bloquePorId(p.pedido.bloqueHorarioId)?.desde ?? ""}
                          </span>
                        ) : p.pedido.disponibilidad === "confirmado" ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-label="Confirmó" />
                        ) : p.hayQueContactar ? (
                          <Phone
                            className="h-3.5 w-3.5 shrink-0 text-muted"
                            aria-label="Hay que llamarlo"
                          />
                        ) : null
                      ) : null}

                      {p.pedido.resultado === "entregado" ? (
                        <Check className="h-4 w-4 shrink-0 text-ok" />
                      ) : p.pedido.resultado === "no_entregado" ? (
                        <X className="h-4 w-4 shrink-0 text-danger" aria-label="No entregado" />
                      ) : null}
                    </FilaDeslizable>
                  );
                })}
              </ol>
              {/* El gesto no se ve. Una línea alcanza: quien lo prueba una vez no
                  lo vuelve a olvidar, y quien no, sigue teniendo el botón de
                  rehacer la ruta más abajo. */}
              <p className="mb-2 mt-1.5 px-1 text-xs text-muted">
                Desliza una parada hacia la izquierda para eliminar el pedido.
              </p>
            </Seccion>
          </>
        ) : null}

        {/* Lo que quedó dudoso al armar la ruta, guardado CON la ruta (ver
            Ruta.advertencias). Se muestra en terreno y no solo en la
            previsualización porque es tres horas después, mirando la lista, que
            el chofer se pregunta por qué falta un pedido. */}
        {dia.ruta?.advertencias?.length ? (
          <Seccion titulo="Revisar antes de seguir">
            <ul className="mb-2 grid gap-1.5">
              {dia.ruta.advertencias.map((texto: string) => (
                <li
                  key={texto}
                  className="flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2.5 text-xs text-warn"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">{texto}</span>
                </li>
              ))}
            </ul>
          </Seccion>
        ) : null}

        {/* Los pedidos que no entraron en la ruta se muestran acá mismo, no
            detrás de un botón: verlos ES la explicación de qué hay que hacer con
            ellos —tocarlos para arreglar la dirección, o rehacer la ruta para
            que entren—. Antes había un botón que decía "cargar o corregir
            pedidos" y no se entendía qué abría. */}
        <Seccion titulo="Pedidos fuera de la ruta">
          {sinRutear.length > 0 ? (
            <>
              <ul className="overflow-hidden rounded-2xl bg-card shadow-soft">
                {sinRutear.map((p, i) => (
                  <FilaPedido
                    key={p.id}
                    pedido={p}
                    primera={i === 0}
                    onEditar={() => setFormPedido(p)}
                    onEliminar={() => void onEliminarPedido(p.id)}
                  />
                ))}
              </ul>
              <p className="mb-2 mt-1.5 px-1 text-xs text-muted">
                {sinUbicar > 0
                  ? `${sinUbicar === 1 ? "Una dirección no se pudo ubicar" : `${sinUbicar} direcciones no se pudieron ubicar`} en el mapa: toca el pedido para corregirla.`
                  : hayRuta
                    ? "Rehaz la ruta para que entren."
                    : "Arma la ruta para que entren."}{" "}
                Desliza uno hacia la izquierda para eliminarlo.
              </p>
            </>
          ) : (
            <p className="mb-2 px-1 text-xs text-muted">
              {hayRuta
                ? "Todos los pedidos cargados están en la ruta."
                : "No hay pedidos cargados para hoy."}
            </p>
          )}

          <button
            type="button"
            onClick={() => setFormPedido("nuevo")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-separator bg-card py-3.5 text-sm font-semibold text-brand transition-colors active:bg-brand-soft"
          >
            <Plus className="h-4 w-4" />
            Agregar pedido
          </button>
        </Seccion>

        {/* Con la ruta ya armada, rehacerla vive acá abajo y no en la cabecera:
            arriba manda la parada que toca. Sin ruta, el botón está en la
            cabecera y no se repite acá. */}
        {hayRuta ? (
          <Seccion titulo="Rehacer la ruta">
            <GenerarRutaLocal
              fecha={fecha}
              direccionEmpresa={direccionEmpresa}
              regenerar
              onPropuesta={setPropuesta}
            />
          </Seccion>
        ) : null}

        {/* Acá había una sección "Avisos por WhatsApp": tres contadores, la lista
            de los que no salieron y un botón de reintentar por pedido.
            Se fue completa. El estado de un mensaje saliente no es una decisión
            del chofer —lo único que él hace con esa información es llamar, y eso
            ya se lo dice la propia parada con el icono del teléfono—, y el
            reintento ahora corre solo en el sondeo (ver sincronizarWhatsapp).
            De todo eso queda visible una sola cosa, y arriba con los demás
            avisos: que el canal está caído, porque mientras lo esté no van a
            llegar respuestas y esperarlas sí cambia lo que el chofer hace. */}

        <Seccion titulo="Tu día">
          <div className="space-y-2">
            {/* Los tres contadores grandes (entregadas / sin entregar /
                pendientes) se fueron: eso mismo está arriba en el carril, dentro
                del cartel de navegación, y es lo que se mira de reojo manejando.
                Acá abajo queda solo lo que hay que leer parado: por qué el día
                no se cerró y qué falta enviar. */}

            {/* FR-020: por qué el día no se puede cerrar todavía. Se muestra
                solo cuando ya no quedan paradas por marcar, que es cuando el
                chofer espera que el día se cierre solo y no entiende por qué no
                lo hace. */}
            {dia.motivoNoCerrar && paradas.length > 0 && noEntregadas + entregadas === paradas.length ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">El día no se cerró todavía</p>
                  <p className="mt-0.5 text-xs">{dia.motivoNoCerrar}</p>
                </div>
              </div>
            ) : null}

            {ayer ? (
              <p className="px-1 text-xs text-muted">
                Ayer: {ayer.entregadas} {ayer.entregadas === 1 ? "entrega" : "entregas"}
                {ayer.noEntregadas > 0 ? ` y ${ayer.noEntregadas} sin entregar` : ""}.
              </p>
            ) : null}

            {dia.sinEnviar > 0 ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {dia.sinEnviar === 1
                      ? "1 registro sin enviar"
                      : `${dia.sinEnviar} registros sin enviar`}
                  </p>
                  <p className="text-xs opacity-90">
                    Está guardado en tu teléfono. Se envía solo en cuanto haya señal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dia.intentar}
                  disabled={dia.enviando}
                  className="shrink-0 text-xs font-semibold underline disabled:opacity-50"
                >
                  {dia.enviando ? "Enviando…" : "Reintentar"}
                </button>
              </div>
            ) : null}
          </div>
        </Seccion>
      </BottomSheet>

      {/* Por encima de la hoja: mientras haya una ruta propuesta, decidir si se
          usa es lo único que hay que hacer en esta pantalla. */}
      {propuesta ? (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <VistaPreviaRuta
            propuesta={propuesta}
            onUsar={onUsarPropuesta}
            onElegir={onElegirAlternativa}
            onDescartar={() => setPropuesta(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
