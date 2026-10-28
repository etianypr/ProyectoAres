"use client";

// Encomiendas del conductor — una sola pantalla: mapa a pantalla completa y, abajo,
// una hoja deslizable cuya cabecera ES la parada activa con el botón de su paso
// (lo único que se usa manejando). La carga de pedidos se abre DENTRO de la hoja
// (prop "vista"), debajo de la misma cabecera. Las piezas viven en _hooks/ y
// _componentes/ (spec 002, T035–T037); esta pantalla las une.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BottomSheet } from "./_componentes/hoja";
import { PilaNotificaciones } from "./_componentes/notificaciones";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { logout } from "@/lib/auth/acciones";
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
import { useFechaDelDia } from "./_hooks/use-fecha-del-dia";
import { ParadaActiva } from "./_componentes/parada-activa";
import { faseDeParada, type Fase } from "./_hooks/fase-parada";
import { useVentanas, VentanasPantalla } from "./_componentes/ventanas-pantalla";
import { useBotonAtras } from "./_hooks/use-boton-atras";
import { cifrasPantalla } from "./_hooks/cifras-pantalla";
import { ContenidoHoja } from "./_componentes/contenido-hoja";
import { CarrilSuperior, ResumenDelDia } from "./_componentes/carril-superior";
import { usePropuesta } from "./_hooks/use-propuesta";
import { CabeceraSinParada } from "./_componentes/cabecera-sin-parada";
import { ControlesMapa } from "./_componentes/controles-mapa";
import { VistaPedido } from "./_componentes/vista-pedido";
import { GenerarRutaLocal } from "./_componentes/generar-ruta-local";
import { VistaPreviaRuta } from "./_componentes/vista-previa-ruta";
import { useModoPrueba } from "@/lib/encomiendas/local/modo-prueba";
import { CintaModoPrueba } from "./_componentes/cinta-modo-prueba";

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
  whatsapp: whatsappServidor,
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
  // En modo prueba no sale ningún WhatsApp (ver modo-prueba.ts).
  const modoPrueba = useModoPrueba();
  const whatsapp = whatsappServidor && !modoPrueba;
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
    avisar,
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
  const [alturaCerrada, setAlturaCerrada] = useState(140);
  // Las ventanas que se abren encima (ver _componentes/ventanas-pantalla.tsx).
  const ventanas = useVentanas();
  const { setCargandoGuia, setEscaneando, setPedirCarga } = ventanas;
  // La ruta propuesta a la vista, elegir otra alternativa y usarla.
  const { propuesta, setPropuesta, onElegirAlternativa, onUsarPropuesta, quitado, onQuitar, onDeshacerQuitar } = usePropuesta({
    dia,
    alArmar: setPedirCarga,
  });
  const [ofParaNuevo, setOfParaNuevo] = useState<string | undefined>(undefined);
  const nuevoPedido = (of?: string) => {
    setOfParaNuevo(of);
    setFormPedido("nuevo");
  };
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

  // Botón atrás de Android (ver _hooks/use-boton-atras.ts).
  useBotonAtras({
    cierreDia,
    ventanas,
    despues: [
      [formPedido != null, () => setFormPedido(null)],
      [propuesta != null, () => setPropuesta(null)],
      [dandoResultadoDe != null, () => setDandoResultadoDe(null)],
      [esperandoResultadoDe != null, () => setEsperandoResultadoDe(null)],
    ],
    sinParadas: paradas.length === 0,
  });

  const apkVieja = useApkVieja(apkMinima);

  const { puntos, previa } = usePuntosMapa(paradas, activa, propuesta);

  if (dia.cargando) return <PantallaCargando />;

  if (dia.error) return <PantallaError error={dia.error} logout={logout} />;

  const { sinRutear, sinUbicar, entregadas, noEntregadas, porcentaje } = cifrasPantalla(paradas, pedidos);

  // Cómo va el día, en el carril de arriba (ver ResumenDelDia).
  const resumenDelDia =
    hayRuta && !propuesta ? <ResumenDelDia entregadas={entregadas} total={paradas.length} noEntregadas={noEntregadas} /> : null;

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

  // La cabecera de la hoja, lo único visible manejando: el paso que toca AHORA.
  // Sin ruta (o cargando pedidos) es cargar o armar; con ruta, la parada activa.
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
          central={propuesta?.partida ?? dia.ruta?.partida ?? null}
          siguiendo={enNavegacion}
          onArrastre={() => {
            // Mover el mapa para mirar bien una ruta propuesta no es "quiero
            // mirar otra cosa mientras manejo".
            if (!propuesta) setSiguiendo(false);
          }}
        />
      </div>

      <PilaNotificaciones notificaciones={notificaciones} onAltura={setAltoNotificaciones} />

      <CintaModoPrueba visible={modoPrueba} />

      <VentanasPantalla
        ventanas={ventanas}
        fecha={fecha}
        lecturaIA={lecturaIA}
        nombreConductor={nombreConductor}
        dia={dia}
        cierreDia={cierreDia}
        onNuevoConOf={nuevoPedido}
      />

      <CarrilSuperior
        altoNotificaciones={altoNotificaciones}
        onAbrirMenu={ventanas.abrirMenu}
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
                // Corrigiendo uno, la vista se cierra sola; cargando nuevos se queda
                // (van en tanda). Una advertencia (dirección sin ubicar) queda
                // escrita en el formulario: no se tapa con una confirmación.
                if (!esNuevo) setFormPedido(null);
                if (esNuevo && aviso == null) avisar("Pedido agregado — listo para el siguiente");
              }}
            />
          ) : null
        }
      >
        <ContenidoHoja
          dia={dia}
          fecha={fecha}
          direccionEmpresa={direccionEmpresa}
          lecturaIA={lecturaIA}
          guardando={guardando}
          metaBono={metaBono}
          ayer={ayer}
          sinRutear={sinRutear}
          sinUbicar={sinUbicar}
          entregadas={entregadas}
          noEntregadas={noEntregadas}
          porcentaje={porcentaje}
          onEscanear={() => setEscaneando(true)}
          onEliminar={(id) => void onEliminarPedido(id)}
          onEditar={(p) => setFormPedido(p)}
          onSumar={async () => {
            const cuantos = await correr(() => dia.sumarALaRuta());
            if (cuantos) avisar(cuantos === 1 ? "1 pedido entró a la ruta" : `${cuantos} pedidos entraron a la ruta`);
          }}
          onCargarGuia={() => setCargandoGuia(true)}
          onAgregar={() => nuevoPedido()}
          onPropuesta={setPropuesta}
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
            quitado={quitado}
            onQuitar={onQuitar}
            onDeshacerQuitar={onDeshacerQuitar}
          />
        </div>
      ) : null}
    </div>
  );
}
