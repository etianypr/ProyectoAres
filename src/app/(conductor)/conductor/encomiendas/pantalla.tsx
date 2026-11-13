"use client";

// Encomiendas del conductor — una sola pantalla: mapa a pantalla completa y, abajo,
// una hoja deslizable cuya cabecera ES el paso del día que toca con su botón
// (spec 027): cargar la guía, resolver los ⚠, armar la ruta, cargar el auto, la
// parada activa (lo único que se usa manejando) o cerrar el día. La carga de pedidos se abre DENTRO de la hoja
// (prop "vista"), debajo de la misma cabecera. Las piezas viven en _hooks/ y
// _componentes/ (spec 002, T035–T037); esta pantalla las une.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BottomSheet } from "./_componentes/hoja";
import { PilaNotificaciones } from "./_componentes/notificaciones";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { ResultadoVisita } from "@/lib/encomiendas/estados";
import { useDiaTrabajo } from "./_hooks/use-dia-trabajo";
import { useParadaEnCurso } from "./_hooks/use-parada-en-curso";
import { useAvisoApk, useResumenAyer } from "./_hooks/use-avisos-del-dia";
import { usePuntosMapa } from "./_hooks/use-puntos-mapa";
import { useVistaCercanas } from "./_hooks/use-vista-cercanas";
import { PantallaCargando, PantallaError } from "./_componentes/estado-pantalla";
import { useUbicacionActual } from "./_hooks/use-ubicacion-actual";
import { useEvento } from "./_hooks/use-evento";
import { armarNotificaciones } from "./_componentes/notificaciones-pantalla";
import { useHaciaParada } from "./_hooks/use-hacia-parada";
import { useBurbuja } from "./_hooks/use-burbuja";
import { useBrujula } from "./_hooks/use-brujula";
import { useCierreDia } from "./_hooks/use-cierre-dia";
import { useFechaDelDia } from "./_hooks/use-fecha-del-dia";
import { useVentanas, VentanasPantalla } from "./_componentes/ventanas-pantalla";
import { useBotonAtras } from "./_hooks/use-boton-atras";
import { cierreDelDia, cifrasPantalla } from "./_hooks/cifras-pantalla";
import { ContenidoHoja } from "./_componentes/contenido-hoja";
import { CarrilSuperior, ResumenDelDia } from "./_componentes/carril-superior";
import { usePropuesta } from "./_hooks/use-propuesta";
import { CabeceraHoja } from "./_componentes/cabecera-hoja";
import { pasoDelDia } from "./_hooks/paso-del-dia";
import { useResolverProblemas } from "./_hooks/use-resolver-problemas";
import { avisoAdelante, lineaAvisoAdelante } from "./_hooks/aviso-adelante";
import { useCargaAuto } from "./_hooks/use-carga-auto";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import { ControlesMapa } from "./_componentes/controles-mapa";
import { ParadasCercanas } from "./_componentes/paradas-cercanas";
import { VistaPedido } from "./_componentes/vista-pedido";
import { VistaPreviaRuta } from "./_componentes/vista-previa-ruta";
import { useModoPrueba } from "@/lib/encomiendas/local/modo-prueba";
import { CintaModoPrueba } from "./_componentes/cinta-modo-prueba";
import { fueraDeLaRuta } from "@/lib/encomiendas/local/sumar-a-ruta";

// maplibre-gl toca `window` al importarse y Next.js renderiza una vez en el servidor.
const RutaMapa = dynamic(() => import("./_mapa/ruta-mapa").then((m) => m.RutaMapa), { ssr: false });

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
  // Llega tarde con la ruta completa (spec 033): el cierre no se abre solo.
  const fueraConPunto = dia.ruta ? fueraDeLaRuta(pedidos, dia.ruta.orden).length : 0;
  // Spec 007: con el día cerrado, lista de no entregados y borrado del teléfono.
  const cierreDia = useCierreDia({
    fecha,
    hoyCerrado: dia.ruta?.cierre != null && pedidos.length > 0,
    enEspera: fueraConPunto > 0,
    alBorrar: dia.recargar,
  });

  // El formulario abierto en la hoja: "nuevo", el pedido que se corrige, o null.
  const [formPedido, setFormPedido] = useState<"nuevo" | Pedido | null>(null);
  // Las ventanas que se abren encima (ver _componentes/ventanas-pantalla.tsx).
  const ventanas = useVentanas();
  const { setCargandoGuia, setEscaneando } = ventanas;
  // Llamar, las salidas, entregar, deshacer y cada botón de la parada, para la
  // tarjeta y la burbuja (ver _hooks/use-parada-en-curso.ts).
  const enCurso = useParadaEnCurso({ dia, fecha, onEditar: setFormPedido, onEscanear: ventanas.escanearParada });
  const { error, setError, guardando, dandoResultadoDe, setDandoResultadoDe, deshacer, eliminado, confirmacion, avisar, correr } = enCurso;
  const { onLlamar, onEliminarPedido, onDeshacerEliminado, onDeshacer, reordenar, fase, acciones } = enCurso;
  // «Resolver los ⚠» de a uno (spec 027).
  const resolver = useResolverProblemas(setFormPedido);
  // Al abrirse «Día terminado», el formulario abierto se cierra: quedaba detrás
  // (spec 033, visto en Chrome). Ajuste al dibujar, sin efecto.
  const cierreAbierto = cierreDia.pendiente != null;
  const [cierreVisto, setCierreVisto] = useState(cierreAbierto);
  if (cierreAbierto !== cierreVisto) {
    setCierreVisto(cierreAbierto);
    if (cierreAbierto && formPedido != null) resolver.cerrar();
  }
  // Estables entre dibujados: la lista no se redibuja con cada lectura del GPS.
  const eliminarDeLaLista = useEvento((id: string) => void onEliminarPedido(id));
  const editarDeLaLista = useEvento((p: Pedido) => setFormPedido(p));
  // Pasar una parada cerrada a otro estado (spec 033, G5).
  const cambiarDeLaLista = useEvento(async (id: string, nuevo: ResultadoVisita) => {
    const r = await correr(() => dia.cambiarResultado(id, nuevo));
    if (r === null) return setError("Esa parada ya no se puede cambiar.");
    avisar(nuevo === "pendiente" ? (r.parada ? `Pendiente · parada ${r.parada}` : "Pendiente") : nuevo === "entregado" ? "Pasó a entregado" : "Pasó a no entregado");
  });
  const [alturaCerrada, setAlturaCerrada] = useState(140);
  // La ruta propuesta a la vista, elegir otra alternativa y usarla.
  const { propuesta, setPropuesta, onElegirAlternativa, onUsarPropuesta, quitado, onQuitar, onDeshacerQuitar, onInvertir } =
    usePropuesta({ dia, fecha });
  const carga = useCargaAuto({ dia, fecha });
  const [ofParaNuevo, setOfParaNuevo] = useState<string | undefined>(undefined);
  const nuevoPedido = (of?: string) => {
    setOfParaNuevo(of);
    setFormPedido("nuevo");
  };
  // Cuánto ocupan los avisos de arriba. Lo informa la propia pila: cambia con
  // cuántos hay y con el largo del mensaje de un fallo.
  const [altoNotificaciones, setAltoNotificaciones] = useState(0);

  const { ubicacion: miUbicacion, error: errorUbicacion, pedirAhora: pedirUbicacion } = useUbicacionActual(true);

  // Modo navegación (seguir la ubicación). Soltado a mano se queda soltado: el
  // mapa espera donde el conductor lo dejó hasta que toque el botón de fijar.
  const [siguiendo, setSiguiendo] = useState(true);
  // Con una propuesta a la vista el mapa la muestra entera y no sigue a nadie.
  const enNavegacion = siguiendo && !propuesta;

  // La brújula solo con el mapa suelto: manejando no aporta y despierta al aparato.
  const rumboBrujula = useBrujula(!enNavegacion);

  const hayRuta = paradas.length > 0;

  // El camino a la parada activa (_hooks/use-hacia-parada.ts). ARES no guía (spec 020).
  const { destinoActivo, faltan, rumbo, ubicacionMostrada, trazadoPorDelante, señalDebil } =
    useHaciaParada({ activa, ruta: dia.ruta, miUbicacion, hayRuta });

  const enAres = ventanas.cargandoGuia;
  // Un pedido con ⚠ a una o dos paradas (spec 022): en la cabecera y en la burbuja.
  const adelante = avisoAdelante(paradas, activa?.pedido.id ?? null);
  const burbuja = useBurbuja({ fecha, activa, fase, whatsapp, deshacer, confirmacion, enAres, acciones, adelante: adelante && lineaAvisoAdelante(adelante),
    extra: enCurso.extra, onBoton: enCurso.onBoton });

  const ayer = useResumenAyer(fecha);

  // Botón atrás de Android (ver _hooks/use-boton-atras.ts).
  useBotonAtras({
    cierreDia,
    ventanas,
    despues: [
      [formPedido != null, resolver.cerrar],
      // Atrás no descarta la propuesta: rearmarla cuesta (spec 033); solo la ✕.
      [propuesta != null, () => {}],
      [fase !== "en_parada", acciones.volver],
      [dandoResultadoDe != null, () => setDandoResultadoDe(null)],
    ],
    sinParadas: paradas.length === 0,
  });

  const avisoApk = useAvisoApk(apkMinima);

  const cerca = useVistaCercanas({ paradas, activa, pedidos, soltarMapa: () => setSiguiendo(false) });
  const { puntos, previa } = usePuntosMapa(paradas, activa, propuesta, cerca.marcadas, pedidos);
  const sumarALaRuta = async () => {
    const cuantos = await correr(() => dia.sumarALaRuta());
    if (cuantos) avisar(cuantos === 1 ? "1 pedido entró a la ruta" : `${cuantos} pedidos entraron a la ruta`);
  };

  if (dia.cargando) return <PantallaCargando />;

  if (dia.error) return <PantallaError error={dia.error} />;

  const { sinRutear, sinUbicar, entregadas, noEntregadas, porcentaje } = cifrasPantalla(paradas, pedidos);
  // El paso del día decide la cabecera de la hoja y lo de adentro (spec 027).
  const conProblema = pedidos.filter((p) => p.resultado === "pendiente" && problemasDelPedido(p).length > 0);
  const paso = pasoDelDia({ hayRuta, hayActiva: activa != null, pendientesFuera: sinRutear.length, conProblema: conProblema.length, cargaTerminada: carga.terminada });

  // Cómo va el día, en el carril de arriba (ver ResumenDelDia). Cargando el auto
  // no: competía con el contador de escaneados.
  const resumenDelDia =
    (paso === "reparto" || paso === "cierre") && !propuesta ? <ResumenDelDia entregadas={entregadas} total={paradas.length} noEntregadas={noEntregadas} /> : null;

  // Los avisos de arriba (ver _componentes/notificaciones-pantalla.tsx).
  const notificaciones = armarNotificaciones({
    error,
    onCerrarError: () => setError(null),
    apkVieja: avisoApk.visible,
    onEsconderApk: avisoApk.esconder,
    apkUrl,
    errorWhatsapp: hayRuta ? dia.errorWhatsapp : null,
    cambiosRuta: dia.cambiosRuta,
    onVistoCambioRuta: dia.vistoCambioRuta,
    eliminado,
    onDeshacerEliminado: () => void onDeshacerEliminado(),
    deshacer,
    onDeshacer: () => void onDeshacer(),
    reordenado: reordenar.reordenado,
    onDeshacerReorden: () => void reordenar.deshacerReorden(),
    confirmacion,
  });

  // La cabecera de la hoja, lo único visible con la hoja cerrada: el paso que
  // toca AHORA (spec 027). Recorriendo, la parada activa (spec 020).
  const cabecera = (
    <CabeceraHoja
      paso={paso}
      parada={
        activa
          ? { activa, fase, whatsapp, guardando, faltan, onBoton: enCurso.onBoton, adelante, onLlamarA: onLlamar, onVer: setFormPedido,
              onNavegar: destinoActivo ? () => void burbuja.navegar() : undefined, juntas: enCurso.juntas, extra: enCurso.extra,
              moverActiva: reordenar.moverActiva ? { onMover: () => void reordenar.moverLaActiva(), onSeguir: reordenar.seguirConLaActiva } : null,
              onDarPermiso: burbuja.sinPermiso ? () => void burbuja.darPermiso() : undefined }
          : null
      }
      carga={carga}
      guardando={guardando}
      cargando={formPedido === "nuevo" && !hayRuta}
      cifras={{ pendientes: sinRutear.length, conProblema: conProblema.length, ...cierreDelDia(pedidos) }}
      diaCerrado={dia.ruta?.cierre != null}
      cierre={{ fuera: fueraConPunto, deshacerHasta: deshacer?.hasta ?? null, onSumar: sumarALaRuta }}
      nombreConductor={nombreConductor}
      fecha={fecha}
      direccionEmpresa={direccionEmpresa}
      onCargarGuia={() => setCargandoGuia(true)}
      onAgregar={() => nuevoPedido()}
      onResolver={() => resolver.empezar(conProblema)}
      onPropuesta={setPropuesta}
      onEscanear={() => setEscaneando(true)}
      onSalir={() => void correr(carga.salir)}
      onCerrarDia={cierreDia.reabrir}
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
          destino={destinoActivo}
          trazado={dia.ruta?.trazado ?? null}
          geometriaNavegacion={trazadoPorDelante}
          previa={previa}
          central={propuesta?.llegada ?? propuesta?.partida ?? dia.ruta?.partida ?? null}
          siguiendo={enNavegacion}
          // Mover el mapa para mirar una ruta propuesta no es "quiero mirar otra cosa".
          onArrastre={() => !propuesta && setSiguiendo(false)}
          enfoque={cerca.enfoque}
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
        direccionEmpresa={direccionEmpresa}
        onPropuesta={setPropuesta}
        onResolver={resolver.empezar}
        onSumar={sumarALaRuta}
        onEditar={editarDeLaLista}
      />

      <CarrilSuperior
        altoNotificaciones={altoNotificaciones}
        onAbrirMenu={ventanas.abrirMenu}
        // Solo con la ruta armada (carga, reparto y cierre: un paquete que llega
        // tarde): antes, la etiqueta no tiene parada que decir (spec 033, G5).
        onEscanear={hayRuta ? () => setEscaneando(true) : null}
        resumen={resumenDelDia}
        errorUbicacion={errorUbicacion}
        señalDebil={señalDebil}
      />

      {/* Controles del mapa, justo encima de la hoja cerrada (su alto cambia con el paso). */}
      {!propuesta ? (
        <ControlesMapa
          abajo={alturaCerrada + 12}
          siguiendo={enNavegacion && miUbicacion != null}
          onCentrar={() => { setSiguiendo(true); pedirUbicacion(); }}
          alLado={paso === "reparto" ? (
            <ParadasCercanas {...cerca} guardando={guardando} onLlamar={onLlamar} onHacerAhora={reordenar.ahora} />
          ) : null}
        />
      ) : null}

      <BottomSheet
        cabecera={cabecera}
        senalCerrar={propuesta ?? null}
        onAlturaCerrada={setAlturaCerrada}
        vista={
          formPedido ? (
            <VistaPedido
              // Resolviendo los ⚠ se pasa de uno a otro: el formulario empieza de cero.
              key={formPedido === "nuevo" ? "nuevo" : formPedido.id}
              pedido={formPedido === "nuevo" ? undefined : formPedido}
              ofInicial={formPedido === "nuevo" ? ofParaNuevo : undefined}
              fecha={fecha}
              titulo={formPedido === "nuevo" ? undefined : resolver.titulo}
              onCerrar={resolver.cerrar}
              onSiguiente={formPedido !== "nuevo" && resolver.hayMas ? () => resolver.despuesDeGuardar(pedidos) : undefined}
              onGuardado={(aviso) => {
                void dia.recargar();
                const esNuevo = formPedido === "nuevo";
                // Corrigiendo se cierra o, resolviendo los ⚠, abre el siguiente; cargando
                // nuevos se queda (van en tanda). Una advertencia queda escrita en el formulario.
                if (!esNuevo) resolver.despuesDeGuardar(pedidos);
                // Otro lugar (> 150 m): la parada se reubica (spec 033, cambio-dir-ruta).
                if (!esNuevo) void reordenar.direccionCambiada(formPedido);
                if (esNuevo && aviso == null) avisar("Pedido agregado — listo para el siguiente");
              }}
            />
          ) : null
        }
      >
        <ContenidoHoja
          paso={paso}
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
          faltan={carga.faltan}
          onEliminar={eliminarDeLaLista}
          onEditar={editarDeLaLista}
          onCambiar={cambiarDeLaLista}
          onSumar={sumarALaRuta}
          onCargarGuia={() => setCargandoGuia(true)}
          onAgregar={() => nuevoPedido()}
          onPropuesta={setPropuesta}
          onResolver={() => resolver.empezar(conProblema)}
        />
      </BottomSheet>

      {/* Por encima de la hoja: mientras haya una ruta propuesta, decidir si se
          usa es lo único que hay que hacer en esta pantalla. */}
      {propuesta ? (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <VistaPreviaRuta propuesta={propuesta} onUsar={onUsarPropuesta} onElegir={onElegirAlternativa} onDescartar={() => setPropuesta(null)}
            quitado={quitado} onQuitar={onQuitar} onDeshacerQuitar={onDeshacerQuitar} onInvertir={onInvertir} onVer={cerca.enfocarPunto} />
        </div>
      ) : null}
    </div>
  );
}
