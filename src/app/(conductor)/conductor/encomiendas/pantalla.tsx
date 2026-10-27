"use client";

// ----------------------------------------------------------------------------
// Encomiendas del conductor — una sola pantalla
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

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { BottomSheet } from "./_componentes/hoja";
import { PilaNotificaciones } from "./_componentes/notificaciones";
import { Seccion } from "./_componentes/seccion";
import {
  avanceCarga,
  sinEtiquetaEscaneada,
  leerDias,
  type ResumenDia,
  type Pedido,
} from "@/lib/encomiendas/local/almacen";
import { MenuLateral } from "./_componentes/menu-lateral";
import { logout } from "@/lib/auth/acciones";
import { alBotonAtras, minimizarApp } from "@/lib/nativo/entorno";
import {
  confirmarRutaLocal,
  elegirAlternativa,
  type EstrategiaRuta,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import { useDiaTrabajo } from "./_hooks/use-dia-trabajo";
import { useAccionesParada } from "./_hooks/use-acciones-parada";
import { useApkVieja, useResumenAyer } from "./_hooks/use-avisos-del-dia";
import { usePuntosMapa } from "./_hooks/use-puntos-mapa";
import { PantallaCargando, PantallaError } from "./_componentes/estado-pantalla";
import { useUbicacionActual } from "./_hooks/use-ubicacion-actual";
import { armarNotificaciones } from "./_componentes/notificaciones-pantalla";
import { useGuiaNavegacion } from "./_hooks/use-guia-navegacion";
import { useBrujula } from "./_hooks/use-brujula";
import { useCierreDia } from "./_hooks/use-cierre-dia";
import { BuscarOf } from "./_componentes/buscar-of";
import { CargarGuia } from "./_componentes/cargar-guia";
import { EscanearEtiqueta } from "./_componentes/escanear-etiqueta";
import { CierreDia } from "./_componentes/cierre-dia";
import { useFechaDelDia } from "./_hooks/use-fecha-del-dia";
import { ProgresoCarga } from "./_componentes/progreso-carga";
import { ParadaActiva } from "./_componentes/parada-activa";
import { faseDeParada, type Fase } from "./_hooks/fase-parada";
import { AvisoCargarAuto } from "./_componentes/aviso-cargar-auto";
import { RutaDelDia } from "./_componentes/ruta-del-dia";
import { CarrilSuperior } from "./_componentes/carril-superior";
import { CabeceraSinParada } from "./_componentes/cabecera-sin-parada";
import { ControlesMapa } from "./_componentes/controles-mapa";
import { PedidosFueraDeRuta } from "./_componentes/pedidos-fuera";
import { TuDia } from "./_componentes/tu-dia";
import { VistaPedido } from "./_componentes/vista-pedido";
import { GenerarRutaLocal } from "./_componentes/generar-ruta-local";
import { VistaPreviaRuta } from "./_componentes/vista-previa-ruta";

// mapbox-gl toca `window` apenas se importa — aunque este archivo ya es "use
// client", Next.js igual lo renderiza una vez en el servidor antes de hidratar,
// donde `window` no existe. ssr:false lo deja cargar solo en el navegador.
const RutaMapa = dynamic(() => import("./_mapa/ruta-mapa").then((m) => m.RutaMapa), {
  ssr: false,
});



export function PantallaEncomiendas({
  conductorId,
  nombreConductor,
  fecha: fechaDelServidor,
  direccionEmpresa,
  whatsapp,
  lecturaIA,
  apkMinima,
  apkUrl,
  metaBono,
}: {
  conductorId: string;
  nombreConductor: string;
  /** Siempre hoy: la app del conductor trabaja el día en curso. De los anteriores
   *  solo se muestra el resumen del último. */
  fecha: string;
  direccionEmpresa: string | null;
  /** false = el servidor no tiene las credenciales de Meta: no hay avisos y se
   *  llama a todos (spec 013). */
  whatsapp: boolean;
  /** Hay clave de Anthropic: la guía y la etiqueta se leen de una foto (spec 005). */
  lecturaIA: boolean;
  /** Versión mínima de la APK (`APK_VERSION_MINIMA`) y de dónde bajarla
   *  (`APK_URL`); null = sin exigencia (spec 015, US5). */
  apkMinima: string | null;
  apkUrl: string | null;
  /** Entregas del día que dan el bono; null = la regla no tiene bono (spec 006). */
  metaBono: number | null;
}) {
  // E1 (spec 017): la fecha la decide el teléfono, no el HTML (que puede ser
  // de ayer). No cambia en medio de una ruta empezada y abierta.
  const rutaEnCursoRef = useRef(false);
  const rutaEnCurso = useCallback(() => rutaEnCursoRef.current, []);
  const fecha = useFechaDelDia(fechaDelServidor, rutaEnCurso);
  const dia = useDiaTrabajo({ conductorId, fecha, whatsapp });
  useEffect(() => {
    rutaEnCursoRef.current = Boolean(dia.ruta?.inicio && !dia.ruta.cierre);
  }, [dia.ruta]);
  const { paradas, activa, pedidos } = dia;
  // Spec 007: con el día cerrado, lista de no entregados y borrado del teléfono.
  const cierreDia = useCierreDia({
    fecha,
    hoyCerrado: dia.ruta?.cierre != null && pedidos.length > 0,
    alBorrar: dia.recargar,
  });

  // Llamar, contestó o no, las salidas, entregar, y deshacer (ver
  // _hooks/use-acciones-parada.ts).
  const {
    error,
    setError,
    guardando,
    esperandoResultadoDe,
    setEsperandoResultadoDe,
    dandoResultadoDe,
    setDandoResultadoDe,
    deshacer,
    eliminado,
    confirmacion,
    setConfirmacion,
    correr,
    llamadaDetectada,
    onContesto,
    onNoContesto,
    onLlamar,
    onCorregirLlamada,
    onSalida,
    onPedidoFinalizado,
    onEliminarPedido,
    onDeshacerEliminado,
    onDeshacer,
  } = useAccionesParada({ dia, activa, paradas });

  // La vista de formulario abierta dentro de la hoja: "nuevo" o el pedido que se
  // está corrigiendo. null = cerrada.
  const [formPedido, setFormPedido] = useState<"nuevo" | Pedido | null>(null);
  /** La carga de la guía está ubicando direcciones: no se puede cerrar. */
  const [guiaOcupada, setGuiaOcupada] = useState(false);
  const [propuesta, setPropuesta] = useState<PropuestaRuta | null>(null);
  const [alturaCerrada, setAlturaCerrada] = useState(140);
  // El cajón de la izquierda y los días que muestra. Los días se leen al abrir,
  // no al montar (ver BotonMenu más abajo).
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [buscandoOf, setBuscandoOf] = useState(false);
  // Spec 005: cargar el día desde la guía y escanear cada etiqueta.
  const [cargandoGuia, setCargandoGuia] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  /** Recién armada la ruta: cuántos paquetes de la guía falta escanear (abre el aviso). */
  const [pedirCarga, setPedirCarga] = useState<number | null>(null);
  const [ofParaNuevo, setOfParaNuevo] = useState<string | undefined>(undefined);
  const [dias, setDias] = useState<ResumenDia[]>([]);
  // Cuánto ocupan los avisos de arriba. Lo informa la propia pila: cambia con
  // cuántos hay y con el largo del mensaje de un fallo.
  const [altoNotificaciones, setAltoNotificaciones] = useState(0);

  const {
    ubicacion: miUbicacion,
    error: errorUbicacion,
    pedirAhora: pedirUbicacion,
  } = useUbicacionActual(true);

  // Modo navegación (seguir la ubicación). Soltado a mano se queda soltado: el
  // mapa espera donde el conductor lo dejó hasta que toque el botón de fijar.
  const [siguiendo, setSiguiendo] = useState(true);
  // Con una propuesta a la vista el mapa la muestra entera y no sigue a nadie.
  const enNavegacion = siguiendo && !propuesta;

  // La brújula solo se enciende con el mapa suelto: el haz del punto muestra
  // hacia dónde apunta el teléfono. Manejando no aporta y el magnetómetro
  // despierta al aparato varias veces por segundo.
  const rumboBrujula = useBrujula(!enNavegacion);

  const hayRuta = paradas.length > 0;

  const fase: Fase = faseDeParada(activa, { dandoResultadoDe, esperandoResultadoDe });

  // Guiar hasta la parada activa: tramo, voz, punto pegado al camino, rumbo y
  // señal (ver _hooks/use-guia-navegacion.ts).
  const {
    destinoActivo,
    navegacion,
    voz,
    seAproximaSinContacto,
    rumbo,
    ubicacionMostrada,
    trazadoPorDelante,
    señalDebil,
  } = useGuiaNavegacion({ activa, miUbicacion, propuestaALaVista: propuesta != null, hayRuta });

  const ayer = useResumenAyer(fecha);

  // Botón atrás de Android (APK, spec 015): cierra lo que esté abierto, de lo más
  // reciente a lo más de fondo. Con una ruta en curso no saca de la app: un toque
  // de más con el teléfono en el soporte no puede dejar al conductor afuera.
  const alAtras = useRef<() => void>(() => {});
  useEffect(() => {
    alAtras.current = () => {
      // El cierre de un día anterior no se salta; el de hoy queda para después.
      if (cierreDia.pendiente) cierreDia.aplazar();
      else if (buscandoOf) setBuscandoOf(false);
      else if (escaneando) setEscaneando(false);
      else if (pedirCarga != null) setPedirCarga(null);
      // Mientras se ubican las direcciones la X está deshabilitada; el botón
      // atrás tampoco la cierra (spec 017, E12).
      else if (cargandoGuia) {
        if (!guiaOcupada) setCargandoGuia(false);
      }
      else if (menuAbierto) setMenuAbierto(false);
      else if (formPedido) setFormPedido(null);
      else if (propuesta) setPropuesta(null);
      else if (dandoResultadoDe) setDandoResultadoDe(null);
      else if (esperandoResultadoDe) setEsperandoResultadoDe(null);
      else if (paradas.length === 0) minimizarApp();
    };
  });
  useEffect(() => alBotonAtras(() => alAtras.current()), []);

  const apkVieja = useApkVieja(apkMinima);

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
    // Armada la ruta, lo que sigue es cargar el auto: se abre el aviso con el
    // botón para escanear los paquetes (terreno 2026-10-27).
    const faltan = sinEtiquetaEscaneada(propuesta.paradas).length;
    if (faltan > 0) setPedirCarga(faltan);
    // Acá se cumple FR-007: el aviso sale en cuanto el pedido queda ubicado
    // DENTRO de una ruta, no al cargarlo. Antes de eso no hay nada que
    // prometerle al receptor — todavía podía caerse por una dirección que no se
    // pudo ubicar.
    //
    // No se espera el resultado: son treinta consultas al servidor y el conductor no
    // tiene por qué mirar una pantalla trabada mientras salen. Lo que salió y lo
    // que falló queda en el estado de cada pedido (dia.whatsapp), con su
    // botón de reintentar al lado.
    void dia.avisarPedidos(enLaRuta);
  }, [propuesta, dia]);

  const { puntos, previa } = usePuntosMapa(paradas, activa, propuesta);

  if (dia.cargando) return <PantallaCargando />;

  if (dia.error) return <PantallaError error={dia.error} logout={logout} />;

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
  // Vive arriba y no en la hoja porque es el único dato que el conductor quiere de
  // reojo, manejando, sin abrir nada. Y se dibuja SIEMPRE que haya ruta, con
  // maniobra o sin ella: la versión anterior se escondía justo cuando había
  // navegación, o sea justo cuando el conductor no puede abrir la hoja para
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

  // Los avisos de arriba (ver _componentes/notificaciones-pantalla.tsx).
  const notificaciones = armarNotificaciones({
    error,
    onCerrarError: () => setError(null),
    apkVieja,
    apkUrl,
    llamadaDetectada,
    onCorregirLlamada: (llamada) => void onCorregirLlamada(llamada),
    errorWhatsapp: hayRuta ? dia.errorWhatsapp : null,
    cambiosRuta: dia.cambiosRuta,
    onVistoCambioRuta: dia.vistoCambioRuta,
    eliminado,
    onDeshacerEliminado: () => void onDeshacerEliminado(),
    deshacer,
    onDeshacer: () => void onDeshacer(),
    confirmacion,
  });

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
  const cabecera = !hayRuta || !activa ? (
    <CabeceraSinParada
      cargando={formPedido != null}
      hayRuta={hayRuta}
      sinRutear={sinRutear.length}
      nombreConductor={nombreConductor}
      entregadas={entregadas}
      noEntregadas={noEntregadas}
      onCargarGuia={() => setCargandoGuia(true)}
      armarRuta={
        <GenerarRutaLocal
          fecha={fecha}
          direccionEmpresa={direccionEmpresa}
          regenerar={false}
          onPropuesta={setPropuesta}
        />
      }
    />
  ) : (
    <ParadaActiva
      activa={activa}
      fase={fase}
      whatsapp={whatsapp}
      guardando={guardando}
      seAproximaSinContacto={seAproximaSinContacto}
      navegacion={navegacion}
      onLlamar={() => onLlamar(activa)}
      onEscanear={() => setEscaneando(true)}
      onEditar={() => setFormPedido(activa.pedido)}
      onPedidoFinalizado={() => void onPedidoFinalizado()}
      onNoSePudo={() => setDandoResultadoDe(activa.pedido.id)}
      onContesto={() => void onContesto()}
      onNoContesto={() => void onNoContesto()}
      onSalida={(salida) => void onSalida(salida)}
      onVolver={() => setDandoResultadoDe(null)}
    />
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
          nombreConductor={nombreConductor}
          dias={dias}
          fechaActiva={fecha}
          onCerrar={() => setMenuAbierto(false)}
          logout={logout}
          onBuscarOf={() => {
            setMenuAbierto(false);
            setBuscandoOf(true);
          }}
        />
      ) : null}

      {cargandoGuia ? (
        <CargarGuia
          fecha={fecha}
          lecturaIA={lecturaIA}
          hayRuta={dia.ruta != null}
          onOcupado={setGuiaOcupada}
          onEscanearPaquetes={() => {
            setCargandoGuia(false);
            setEscaneando(true);
          }}
          onCerrar={() => setCargandoGuia(false)}
          onCreados={() => void dia.recargar()}
        />
      ) : null}

      {pedirCarga != null && !escaneando ? (
        <AvisoCargarAuto
          faltan={pedirCarga}
          onEscanear={() => {
            setPedirCarga(null);
            setEscaneando(true);
          }}
          onDespues={() => setPedirCarga(null)}
        />
      ) : null}

      {escaneando ? (
        <EscanearEtiqueta
          fecha={fecha}
          lecturaIA={lecturaIA}
          avance={avanceCarga(pedidos)}
          onCerrar={() => setEscaneando(false)}
          onCambio={() => void dia.recargar()}
          onAgregarPedido={(of) => {
            setEscaneando(false);
            setOfParaNuevo(of);
            setFormPedido("nuevo");
          }}
        />
      ) : null}

      {buscandoOf ? (
        <BuscarOf
          pedidos={pedidos}
          secuenciaDe={new Map(paradas.map((p) => [p.pedido.id, p.secuencia] as const))}
          onCerrar={() => setBuscandoOf(false)}
        />
      ) : null}

      {cierreDia.pendiente ? (
        <CierreDia
          cierre={cierreDia.pendiente}
          borrando={cierreDia.borrando}
          error={cierreDia.error}
          onConfirmar={() => void cierreDia.confirmar()}
          onAplazar={cierreDia.aplazar}
        />
      ) : null}

      <CarrilSuperior
        altoNotificaciones={altoNotificaciones}
        onAbrirMenu={() => {
          setMenuAbierto(true);
          // Se leen al abrir y no al montar: es una consulta al teléfono que
          // no hace falta para repartir, y así la lista está fresca aunque
          // el día se haya cerrado con el menú ya usado antes.
          void leerDias().then(setDias);
        }}
        onEscanear={pedidos.length > 0 ? () => setEscaneando(true) : null}
        navegacion={propuesta ? null : navegacion}
        resumen={resumenDelDia}
        errorUbicacion={errorUbicacion}
        señalDebil={señalDebil}
      />

      {/* Controles del mapa, justo encima de la hoja cerrada. La altura la
          informa la propia hoja: cambia con el paso de la parada. */}
      {!propuesta ? (
        <ControlesMapa
          abajo={alturaCerrada + 12}
          voz={voz}
          siguiendo={enNavegacion && miUbicacion != null}
          onCentrar={() => {
            setSiguiendo(true);
            pedirUbicacion();
          }}
        />
      ) : null}

      <BottomSheet
        cabecera={cabecera}
        senalCerrar={propuesta ?? null}
        onAlturaCerrada={setAlturaCerrada}
        vista={
          formPedido ? (
            <VistaPedido
              pedido={formPedido === "nuevo" ? undefined : formPedido}
              ofInicial={formPedido === "nuevo" ? ofParaNuevo : undefined}
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

            <ProgresoCarga pedidos={pedidos} onEscanear={() => setEscaneando(true)} />
            <RutaDelDia
              paradas={paradas}
              activaId={activa?.pedido.id ?? null}
              entregadas={entregadas}
              porcentaje={porcentaje}
              metaBono={metaBono}
              entregadasDelDia={pedidos.filter((p) => p.resultado === "entregado").length}
              onEliminar={(id) => void onEliminarPedido(id)}
            />
          </>
        ) : null}

        {/* Lo que quedó dudoso al armar la ruta, guardado CON la ruta (ver
            Ruta.advertencias). Se muestra en terreno y no solo en la
            previsualización porque es tres horas después, mirando la lista, que
            el conductor se pregunta por qué falta un pedido. */}
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
        <PedidosFueraDeRuta
          fecha={fecha}
          sinRutear={sinRutear}
          sinUbicar={sinUbicar}
          hayRuta={hayRuta}
          lecturaIA={lecturaIA}
          guardando={guardando}
          onEditar={(p) => setFormPedido(p)}
          onEliminar={(id) => void onEliminarPedido(id)}
          onRecargar={() => void dia.recargar()}
          onSumar={async () => {
            const cuantos = await correr(() => dia.sumarALaRuta());
            if (cuantos) {
              setConfirmacion((c) => ({
                texto: cuantos === 1 ? "1 pedido entró a la ruta" : `${cuantos} pedidos entraron a la ruta`,
                n: (c?.n ?? 0) + 1,
              }));
            }
          }}
          onCargarGuia={() => setCargandoGuia(true)}
          onAgregar={() => {
            setOfParaNuevo(undefined);
            setFormPedido("nuevo");
          }}
        />

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
            del conductor —lo único que él hace con esa información es llamar, y eso
            ya se lo dice la propia parada con el icono del teléfono—, y el
            reintento ahora corre solo en el sondeo (ver sincronizarWhatsapp).
            De todo eso queda visible una sola cosa, y arriba con los demás
            avisos: que el canal está caído, porque mientras lo esté no van a
            llegar respuestas y esperarlas sí cambia lo que el conductor hace. */}

        <TuDia
          motivoNoCerrar={
            dia.motivoNoCerrar && paradas.length > 0 && noEntregadas + entregadas === paradas.length
              ? dia.motivoNoCerrar
              : null
          }
          ayer={ayer}
          sinEnviar={dia.sinEnviar}
          errorEnvio={dia.errorEnvio}
          enviando={dia.enviando}
          onReintentar={dia.intentar}
          rechazados={dia.rechazados}
        />
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
