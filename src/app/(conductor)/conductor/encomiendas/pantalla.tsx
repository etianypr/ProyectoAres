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
// La carga de pedidos se fue a una pantalla completa que se abre desde la hoja:
// un formulario con teclado y autocompletado adentro de algo que se arrastra
// era pelearse con el gesto en cada campo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CloudOff,
  LocateFixed,
  MapPinOff,
  PackageCheck,
  Phone,
  Plus,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistancia } from "@/lib/format";
import { recortarTrazado, rumboDelCamino } from "@/lib/rutas";
import { BottomSheet } from "@/components/encomiendas/bottom-sheet";
import { Seccion } from "@/components/encomiendas/seccion";
import { leerRuta, type PedidoLocal } from "@/lib/encomiendas/local/almacen";
import {
  confirmarRutaLocal,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import type { PreviaRuta, PuntoMapa, Ubicacion } from "./ruta-mapa";
import { MS_DESHACER, useJornada, type ParadaVista } from "./use-jornada";
import { useUbicacionActual } from "./use-ubicacion-actual";
import { useNavegacion } from "./use-navegacion";
import { usePantallaEncendida } from "./use-pantalla-encendida";
import { usePuntoEnRuta } from "./use-punto-en-ruta";
import { useVozNavegacion } from "./use-voz";
import { useBrujula } from "./use-brujula";
import { InstruccionNavegacion } from "./instruccion-navegacion";
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
type Fase = "antes_llamar" | "esperando_resultado" | "eligiendo" | "confirmado";

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
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_rgba(11,93,86,0.3)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
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

/** Precisión por encima de la cual el punto ya no ubica ni la manzana. */
const PRECISION_DUDOSA_M = 40;

/** Fila de un pedido que todavía no entró en la ruta. Tocarla abre la edición:
 *  es la única forma de arreglar una dirección que no se pudo ubicar. */
function FilaPedido({
  pedido,
  primera,
  onEditar,
}: {
  pedido: PedidoLocal;
  primera: boolean;
  onEditar: () => void;
}) {
  const sinUbicar = pedido.lat == null || pedido.lng == null;
  return (
    <li className={primera ? "" : "border-t border-divider"}>
      <button
        type="button"
        onClick={onEditar}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm transition-colors active:bg-background"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{pedido.nombre}</p>
          <p className="truncate text-xs text-muted">{pedido.direccion}</p>
        </div>
        {sinUbicar ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
            <MapPinOff className="h-3 w-3" />
            Sin ubicar
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** El formulario de un pedido, a pantalla completa sobre el mapa. Acá el chofer
 *  está parado, con el teclado abierto y las dos manos: un formulario con
 *  autocompletado de direcciones adentro de una hoja que se arrastra es pelearse
 *  con el gesto en cada campo.
 *
 *  Cargando uno nuevo se queda abierto después de guardar —los pedidos se cargan
 *  en tanda, uno atrás del otro— y editando se cierra, que es lo que uno espera
 *  al terminar de corregir algo. */
function PanelPedido({
  pedido,
  onCerrar,
  onGuardado,
}: {
  /** Sin esto, es uno nuevo. */
  pedido?: PedidoLocal;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-divider bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="font-semibold">{pedido ? "Editar pedido" : "Nuevo pedido"}</p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-background"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          <PedidoFormLocal pedido={pedido} onGuardado={onGuardado} onCancelar={onCerrar} />
        </div>
      </div>
    </div>
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
  const jornada = useJornada({ choferId, fecha });
  const { paradas, activa, pedidos } = jornada;

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El formulario a pantalla completa: "nuevo" o el pedido que se está
  // corrigiendo. null = cerrado.
  const [formPedido, setFormPedido] = useState<"nuevo" | PedidoLocal | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaRuta | null>(null);
  const [alturaCerrada, setAlturaCerrada] = useState(140);
  // Ya se marcó el número y falta que el chofer diga si contestó. Es el único
  // estado de flujo que no se puede deducir de los datos.
  const [esperandoResultadoDe, setEsperandoResultadoDe] = useState<string | null>(null);
  // No contestó y todavía no dijo qué hacer con la parada.
  const [decidiendoDe, setDecidiendoDe] = useState<string | null>(null);
  // Lo último que se cerró, mientras se pueda deshacer.
  const [deshacer, setDeshacer] = useState<{
    pedidoId: string;
    eventoId: string;
    texto: string;
  } | null>(null);
  const [ayer, setAyer] = useState<{ entregadas: number; omitidas: number } | null>(null);

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
      : decidiendoDe === activa.pedido.id
        ? "eligiendo"
        : esperandoResultadoDe === activa.pedido.id
          ? "esperando_resultado"
          : activa.llamada === "contesto"
            ? "confirmado"
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
  const pegado = usePuntoEnRuta(miUbicacion, navegacion.geometria);

  // Hacia dónde orientar la vista: el camino que viene por delante en la propia
  // ruta, medido desde el punto ya pegado. Se prefiere eso al rumbo del GPS —que
  // en iPhone llega null casi siempre— y sobre todo a la brújula, que apunta
  // hacia donde quedó apoyado el teléfono y no hacia donde va el camino.
  const rumbo = useMemo(() => {
    const desde = pegado ?? miUbicacion;
    if (desde && navegacion.geometria) {
      const delCamino = rumboDelCamino(desde, navegacion.geometria, 45, pegado?.indice);
      if (delCamino != null) return delCamino;
    }
    return miUbicacion?.heading ?? null;
  }, [pegado, miUbicacion, navegacion.geometria]);

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
      pegado && navegacion.geometria
        ? recortarTrazado(navegacion.geometria, pegado)
        : navegacion.geometria,
    [pegado, navegacion.geometria],
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
        const ruta = await leerRuta(ayerDe(fecha));
        setAyer(
          ruta && ruta.paradas.length > 0
            ? {
                entregadas: ruta.paradas.filter((p) => p.entrega === "entregado").length,
                omitidas: ruta.paradas.filter((p) => p.entrega === "omitido").length,
              }
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
  const confirmarRef = useRef(jornada.confirmar);
  useEffect(() => {
    confirmarRef.current = jornada.confirmar;
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

  function onLlamar(parada: ParadaVista) {
    window.location.href = telHref(parada.pedido.telefono);
    setEsperandoResultadoDe(parada.pedido.id);
  }

  async function onContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    await correr(() => jornada.marcarLlamada(id, "contesto"));
    setEsperandoResultadoDe(null);
  }

  async function onNoContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    // La llamada se registra igual: es un hecho, y de eso depende el fijo
    // diario. Lo que falta decidir es qué se hace con la parada.
    await correr(() => jornada.marcarLlamada(id, "no_contesto"));
    setEsperandoResultadoDe(null);
    setDecidiendoDe(id);
  }

  async function onDejarParaElFinal() {
    if (!activa) return;
    await correr(() => jornada.dejarParaElFinal(activa.pedido.id));
    setDecidiendoDe(null);
  }

  async function onOmitir() {
    if (!activa) return;
    const id = activa.pedido.id;
    const eventoId = await correr(() => jornada.marcarEntrega(id, "omitido"));
    setDecidiendoDe(null);
    if (eventoId) setDeshacer({ pedidoId: id, eventoId, texto: "Parada omitida" });
  }

  async function onPedidoFinalizado() {
    if (!activa) return;
    const id = activa.pedido.id;
    // Antes de escribir (lo que recalcula "activa") ubicamos a quién sigue, para
    // poder marcar su número de una vez.
    const siguiente = paradas.find(
      (p) => p.secuencia > activa.secuencia && p.entrega === "pendiente",
    );

    const eventoId = await correr(() => jornada.marcarEntrega(id, "entregado"));
    if (eventoId) setDeshacer({ pedidoId: id, eventoId, texto: "Entrega registrada" });

    if (siguiente) {
      window.location.href = telHref(siguiente.pedido.telefono);
      setEsperandoResultadoDe(siguiente.pedido.id);
    } else {
      setEsperandoResultadoDe(null);
    }
  }

  async function onDeshacer() {
    if (!deshacer) return;
    const { pedidoId, eventoId } = deshacer;
    setDeshacer(null);
    await correr(() => jornada.deshacer(pedidoId, eventoId));
    // Volver a la parada reabierta como si no hubiera pasado nada: si venía de
    // "contestó", el paso que corresponde es finalizar; si no, llamar.
    setEsperandoResultadoDe(null);
    setDecidiendoDe(null);
  }

  const onUsarPropuesta = useCallback(async () => {
    if (!propuesta) return;
    await confirmarRutaLocal(propuesta);
    await jornada.recargar();
    setPropuesta(null);
  }, [propuesta, jornada]);

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
          completada: p.entrega === "entregado",
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
            geometria: propuesta.geometria,
          }
        : null,
    [propuesta],
  );

  if (jornada.cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">
        Cargando tu ruta…
      </div>
    );
  }

  if (jornada.error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold">No se pudo abrir tu ruta</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{jornada.error}</p>
        <Link href="/conductor" className="mt-4 text-sm text-brand hover:underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const enRuta = new Set(paradas.map((p) => p.pedido.id));
  const pendientesSueltos = pedidos.filter((p) => p.estado === "pendiente");
  const sinRutear = pendientesSueltos.filter((p) => !enRuta.has(p.id));
  const sinUbicar = sinRutear.filter((p) => p.lat == null || p.lng == null).length;
  const entregadas = paradas.filter((p) => p.entrega === "entregado").length;
  const omitidas = paradas.filter((p) => p.entrega === "omitido").length;
  const porcentaje = paradas.length > 0 ? Math.round((entregadas / paradas.length) * 100) : 0;

  // ------------------------------------------------------------------------
  // La cabecera de la hoja: lo único visible manejando
  // ------------------------------------------------------------------------
  // Muestra siempre el paso que toca AHORA, y solo ese. Sin ruta armada el paso
  // no es una parada: es cargar los pedidos o armar la ruta.
  const cabecera = !hayRuta ? (
    <div className="space-y-2.5">
      <div>
        <p className="text-sm font-semibold">Hola, {nombreChofer.split(" ")[0]}</p>
        <p className="text-xs text-muted">
          {sinRutear.length === 0
            ? "No hay pedidos cargados ni ruta generada."
            : sinRutear.length === 1
              ? "1 pedido cargado, sin ruta armada."
              : `${sinRutear.length} pedidos cargados, sin ruta armada.`}
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
          {omitidas > 0 ? ` · ${omitidas} sin entregar` : ""}
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
        </div>
        {navegacion.metrosAManiobra != null && navegacion.metrosAManiobra > 0 ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">
            {formatDistancia(navegacion.metrosAManiobra)}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
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
            className="flex h-12 w-12 items-center justify-center rounded-full border border-separator bg-card text-brand transition-transform active:scale-[0.97]"
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

      {fase === "eligiendo" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">No contestó. ¿Qué hacemos con esta parada?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={guardando}
              onClick={onDejarParaElFinal}
              className={cn(BOTON_RESULTADO, "border border-separator bg-card text-foreground")}
            >
              Dejar al final
            </button>
            <button
              disabled={guardando}
              onClick={onOmitir}
              className={cn(BOTON_RESULTADO, "bg-danger text-white")}
            >
              Omitir por hoy
            </button>
          </div>
        </div>
      ) : null}

      {fase === "confirmado" ? (
        <button disabled={guardando} onClick={onPedidoFinalizado} className={BOTON_PRINCIPAL}>
          <PackageCheck className="h-4 w-4" />
          Pedido finalizado
        </button>
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
          geometria={jornada.ruta?.geometria ?? null}
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

      <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/conductor"
            aria-label="Volver al inicio"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {navegacion.paso && !propuesta ? (
            <InstruccionNavegacion
              paso={navegacion.paso}
              siguiente={navegacion.siguiente}
              metros={navegacion.metrosAManiobra}
            />
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
          style={{ bottom: alturaCerrada + (deshacer ? 68 : 12) }}
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

      {/* El aviso de deshacer. Mientras está a la vista, lo que se marcó no
          salió del teléfono ni cerró la jornada (ver use-jornada). */}
      {deshacer ? (
        <div
          className="absolute inset-x-3 z-30 flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-white shadow-lg"
          style={{ bottom: alturaCerrada + 12 }}
        >
          <Check className="h-4 w-4 shrink-0 text-ok" />
          <p className="min-w-0 flex-1 text-sm">{deshacer.texto}</p>
          <button
            type="button"
            onClick={() => void onDeshacer()}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold active:bg-white/25"
          >
            <Undo2 className="h-4 w-4" />
            Deshacer
          </button>
        </div>
      ) : null}

      <BottomSheet
        cabecera={cabecera}
        senalCerrar={propuesta ?? null}
        onAlturaCerrada={setAlturaCerrada}
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
                    <li
                      key={p.pedido.id}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-2.5 text-sm",
                        i > 0 && "border-t border-divider",
                        esActiva && "bg-brand-soft",
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
                            p.entrega === "entregado" && "text-muted",
                          )}
                        >
                          {p.pedido.nombre}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {p.pedido.direccion}
                        </span>
                      </span>
                      {p.entrega === "entregado" ? (
                        <Check className="h-4 w-4 shrink-0 text-ok" />
                      ) : p.entrega === "omitido" ? (
                        <X className="h-4 w-4 shrink-0 text-danger" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </Seccion>
          </>
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
                  />
                ))}
              </ul>
              <p className="mb-2 mt-1.5 px-1 text-xs text-muted">
                {sinUbicar > 0
                  ? `${sinUbicar === 1 ? "Una dirección no se pudo ubicar" : `${sinUbicar} direcciones no se pudieron ubicar`} en el mapa: toca el pedido para corregirla.`
                  : hayRuta
                    ? "Rehaz la ruta para que entren."
                    : "Arma la ruta para que entren."}
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

        <Seccion titulo="Tu jornada">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: entregadas, t: "Entregadas", c: "text-ok" },
                { n: omitidas, t: "Sin entregar", c: "text-danger" },
                { n: paradas.length - entregadas - omitidas, t: "Pendientes", c: "text-foreground" },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl bg-card px-3 py-2.5 text-center shadow-soft">
                  <p className={cn("text-xl font-semibold tabular-nums", x.c)}>{x.n}</p>
                  <p className="text-[11px] text-muted">{x.t}</p>
                </div>
              ))}
            </div>

            {ayer ? (
              <p className="px-1 text-xs text-muted">
                Ayer: {ayer.entregadas} {ayer.entregadas === 1 ? "entrega" : "entregas"}
                {ayer.omitidas > 0 ? ` y ${ayer.omitidas} sin entregar` : ""}.
              </p>
            ) : null}

            {jornada.sinEnviar > 0 ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {jornada.sinEnviar === 1
                      ? "1 registro sin enviar"
                      : `${jornada.sinEnviar} registros sin enviar`}
                  </p>
                  <p className="text-xs opacity-90">
                    Está guardado en tu teléfono. Se envía solo en cuanto haya señal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={jornada.intentar}
                  disabled={jornada.enviando}
                  className="shrink-0 text-xs font-semibold underline disabled:opacity-50"
                >
                  {jornada.enviando ? "Enviando…" : "Reintentar"}
                </button>
              </div>
            ) : null}
          </div>
        </Seccion>
      </BottomSheet>

      {formPedido ? (
        <PanelPedido
          pedido={formPedido === "nuevo" ? undefined : formPedido}
          onCerrar={() => setFormPedido(null)}
          onGuardado={() => {
            void jornada.recargar();
            // Corrigiendo uno, el trabajo terminó y la pantalla se cierra sola.
            // Cargando nuevos, el formulario se queda: se cargan en tanda.
            if (formPedido !== "nuevo") setFormPedido(null);
          }}
        />
      ) : null}

      {/* Por encima de la hoja: mientras haya una ruta propuesta, decidir si se
          usa es lo único que hay que hacer en esta pantalla. */}
      {propuesta ? (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <VistaPreviaRuta
            propuesta={propuesta}
            onUsar={onUsarPropuesta}
            onDescartar={() => setPropuesta(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
