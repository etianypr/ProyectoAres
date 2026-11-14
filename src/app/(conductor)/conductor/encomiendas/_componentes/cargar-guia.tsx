"use client";

// Cargar el día desde la guía de despacho (spec 005, US1): fotos de la guía →
// revisar las líneas → crear los pedidos → ubicar sus direcciones. Después sigue
// el flujo de siempre: armar la ruta y escanear cada etiqueta.
//
// Con una foto de la guía: en la APK el texto se lee en el teléfono (gratis) y,
// si no alcanza, con la IA (ver lectura-cliente). Sin foto, el texto se copia de
// la guía con Google Lens ("Copiar texto") y se pega acá.
//
// Spec 033: cerrar (✕ o atrás) con líneas leídas pregunta antes; el barrido se
// descarta con la ✕ y se suma con «Terminar»; quitar una línea se deshace; pegar
// otro texto suma líneas en vez de reemplazarlas; y la carga se puede cortar y
// deshacer (use-cargar-lineas.ts). Diseño de los tres pasos (dueño, 2026-11-13):
// pasos-guia.tsx, visor-guia.tsx (1), revision-guia.tsx (2) y fin-guia.tsx (3).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CircleHelp, X } from "lucide-react";
import { CampoArea } from "@/components/ui/campo";
import { leerGuia } from "@/lib/encomiendas/lectura/guia";
import { lineasParaCrear } from "@/lib/encomiendas/lectura/telefono-linea";
import { leerFotosGuia, type FuenteLectura } from "@/lib/encomiendas/local/lectura-cliente";
import { esApp } from "@/lib/nativo/entorno";
import { lineasDelBarrido } from "@/lib/encomiendas/lectura/barrido-nomina";
import { useFotosGuia } from "./fotos-guia";
import { PieFotos, VisorGuia } from "./visor-guia";
import { PasosGuia } from "./pasos-guia";
import { RevisionGuia } from "./revision-guia";
import { lineaMala } from "./lineas-guia";
import { VistaFinGuia } from "./fin-guia";
import { CamaraBarrido } from "./camara-barrido";
import { FranjaConfirmar } from "./franja-confirmar";
import { PieGuia, plural, type PasoGuia, type PreguntaGuia } from "./pie-guia";
import { useLineasGuia } from "../_hooks/use-lineas-guia";
import { resultadoDelBarrido, useBarridoDisponible, useBarridoNomina, type Barrido } from "../_hooks/use-barrido-nomina";
import { useCargarLineas } from "../_hooks/use-cargar-lineas";
import { useAtrasPropio } from "../_hooks/use-atras-propio";
import { useBorradorGuia } from "../_hooks/use-borrador-guia";

export function CargarGuia({
  fecha,
  lecturaIA,
  hayRuta,
  fueraDeRuta,
  onOcupado,
  onSumar,
  onEscanearPaquetes,
  onCerrar,
  onCreados,
  onAyuda,
  onCorregir,
  armar,
}: {
  fecha: string;
  /** La IA está encendida: lee la foto si el teléfono no pudo. */
  lecturaIA: boolean;
  /** Ya hay ruta armada: al terminar se sigue directo a escanear los paquetes. */
  hayRuta: boolean;
  /** Con ruta: los pedidos con punto que no están en ella (spec 033, otra-guia-ruta). */
  fueraDeRuta: number;
  /** Avisa mientras se ubican las direcciones (no se puede cerrar). */
  onOcupado?: (ocupado: boolean) => void;
  /** «Sumar N a la ruta» (sumar-a-ruta.ts, sin señal ni cupo). */
  onSumar: () => Promise<void>;
  onEscanearPaquetes: () => void;
  onCerrar: () => void;
  /** Se crearon pedidos: la pantalla los vuelve a leer. */
  onCreados: () => void;
  /** Abre la ayuda (cómo sacar las fotos, Google Lens). */
  onAyuda: () => void;
  /** «Corregir» un pedido no ubicado del resumen: abre su formulario. */
  onCorregir: (pedidoId: string) => void;
  /** Armar la ruta de una (GenerarRutaLocal): con ⚠ sin resolver, pregunta antes. */
  armar: () => React.ReactNode;
}) {
  // Foto: en la APK siempre (lee el teléfono); en el navegador, solo con IA.
  const conFoto = lecturaIA || esApp();
  const [paso, setPaso] = useState<PasoGuia>(conFoto ? "fotos" : "pegar");
  const [texto, setTexto] = useState("");
  const guia = useLineasGuia();
  const { lineas, avisos, folio } = guia;
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  /** Quién leyó las fotos de esta carga (null = texto pegado). */
  const [fuente, setFuente] = useState<FuenteLectura | null>(null);
  const [pregunta, setPregunta] = useState<PreguntaGuia | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const entradaFotos = useRef<HTMLInputElement>(null);
  /** Fotos juntadas y todavía sin leer (ver fotos-guia.tsx). */
  const bandeja = useFotosGuia();
  const { fotos } = bandeja;
  const barrer = useBarridoNomina(agregarBarrido, { conAtras: false });
  const onBarrer = useBarridoDisponible() ? () => void barrer.iniciar() : undefined;
  const carga = useCargarLineas({ fecha, lecturaIA, onCreados });
  const { fin } = carga;

  const borrador = useBorradorGuia({
    fecha,
    estado: { paso, lineas, avisos, folio, total: guia.total, texto, fuente },
    creando: fin != null,
    onRecuperado: (b) => (guia.restaurar(b), setTexto(b.texto), setFuente(b.fuente), setPaso(b.paso === "fotos" && !conFoto ? "pegar" : b.paso)),
  });
  const malas = useMemo(() => lineas.filter(lineaMala).length, [lineas]);
  const porConfirmar = useMemo(() => lineas.filter((l) => l.porConfirmar).length, [lineas]);
  const ocupado = fin?.tipo === "ubicando" || fin?.tipo === "corrigiendo";
  useEffect(() => {
    onOcupado?.(ocupado);
    return () => onOcupado?.(false);
  }, [ocupado, onOcupado]);

  /** Lo leído que se perdería al cerrar: líneas sin crear, fotos sin leer o texto pegado. */
  const sinGuardar = fin ? 0 : lineas.length;
  const hayAlgo = sinGuardar > 0 || fotos.length > 0 || (paso === "pegar" && texto.trim() !== "" && !fin);
  const leidoEnBarrido = (barrer.vista?.firmes ?? 0) + (barrer.vista?.porConfirmar ?? 0);

  function pedirCerrar() {
    if (ocupado) return;
    if (hayAlgo) setPregunta("cerrar");
    else onCerrar();
  }
  function cerrarBarrido() {
    if (leidoEnBarrido > 0) setPregunta("barrido");
    else void barrer.descartar();
  }
  // Atrás de Android: el barrido, la pregunta a la vista o cerrar (spec 033).
  useAtrasPropio(true, () => {
    if (barrer.activo) return pregunta === "barrido" ? setPregunta(null) : cerrarBarrido();
    if (pregunta) return setPregunta(null);
    pedirCerrar();
  });

  /** Suma lo leído y pasa a revisar las líneas. */
  function sumar(...args: Parameters<typeof guia.sumar>) {
    guia.sumar(...args);
    setError(null); // un «Sin señal» de antes no sigue a la vista en la revisión
    setPaso("revisar");
  }

  /** El texto pegado se suma a lo leído antes (fotos o barrido), como una foto más. */
  function leer() {
    const leida = leerGuia(texto);
    setTexto(""); // ya leído: «Pegar texto» vuelve vacío para pegar la otra parte
    sumar(leida.lineas, leida.folio, leida.totalDeclarado);
  }

  /** Suma fotos a las juntadas, sin leerlas: se leen juntas con «Leer direcciones». */
  function agregarFotos(archivos: File[]) {
    if (entradaFoto.current) entradaFoto.current.value = "";
    if (entradaFotos.current) entradaFotos.current.value = "";
    if (archivos.length > 0) setError(bandeja.agregar(archivos));
  }

  /** Las fotos juntadas de la guía (la del día suele ser de 3), TODAS en una
   *  sola consulta a la IA (terreno 2026-10-27). Al final se compara con el MONTO
   *  NETO, que se conserva aunque esté en una foto anterior (spec 017, E11). */
  async function leerFotos() {
    const archivos = fotos.map((f) => f.archivo);
    if (archivos.length === 0) return;
    setLeyendo(true);
    setError(null);
    try {
      const r = await leerFotosGuia(archivos, { ia: lecturaIA });
      sumar(r.guia.lineas, r.guia.folio, r.guia.totalDeclarado);
      setFuente((antes) => (antes === "ia" || r.fuente === "ia" ? "ia" : r.fuente));
      bandeja.vaciar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto.");
    } finally {
      setLeyendo(false);
    }
  }

  /** Lo barrido de la nómina se suma a lo que ya hay, como una foto más; lo que no
   *  quedó firme llega por confirmar. Lo leyó el teléfono: origen `guia_foto`. */
  function agregarBarrido(b: Barrido) {
    const leido = lineasDelBarrido(resultadoDelBarrido(b));
    if (leido.lineas.length === 0) {
      setError("No se leyó ninguna OF de la nómina.");
      return;
    }
    sumar(leido.lineas, null, leido.total, leido.porConfirmar);
    setFuente((antes) => (antes === "ia" ? "ia" : "texto"));
    setError(null);
  }

  async function crear() {
    setError(null);
    guia.olvidarQuitada();
    // El teléfono anotado pasa al pedido (+569); a los buscadores y a la IA va
    // solo la dirección (dueño, 2026-11-13).
    const falla = await carga.crear(lineasParaCrear(lineas), {
      folio,
      origen: fuente === "ia" ? "guia_ia" : fuente === "texto" ? "guia_foto" : "guia_pegada",
    });
    if (falla) setError(falla);
  }

  async function deshacerCarga() {
    setPregunta(null);
    try {
      setError(await carga.deshacer());
    } catch {
      setError("No se pudo deshacer la carga. Intenta de nuevo.");
    }
    setPaso("revisar");
  }

  if (typeof document === "undefined") return null;

  const errorVisible = error ?? barrer.error;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Cargar la guía"
    >
      <div className="flex items-center gap-2 px-4 pb-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Cargar la guía</h2>
        <button
          type="button"
          onClick={onAyuda}
          aria-label="Ayuda"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card"
        >
          <CircleHelp className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={pedirCerrar}
          disabled={ocupado}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* Tocar el paso vuelve a él: a sumar fotos o texto, o a revisar lo leído. */}
      <PasosGuia
        actual={fin ? 3 : paso === "revisar" ? 2 : 1}
        puede={{ 1: !fin && !leyendo, 2: !fin && !leyendo && lineas.length > 0 }}
        onIr={(n) => setPaso(n === 2 ? "revisar" : conFoto ? "fotos" : "pegar")}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1">
        <input
          ref={entradaFoto}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => agregarFotos([...(e.target.files ?? [])])}
        />
        {/* Las fotos ya sacadas, de la galería: se eligen las 3 de una vez. */}
        <input
          ref={entradaFotos}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => agregarFotos([...(e.target.files ?? [])])}
        />
        {errorVisible && !fin ? <p className="text-sm text-danger">{errorVisible}</p> : null}

        {!fin && paso === "fotos" ? (
          <VisorGuia
            fotos={fotos}
            leyendo={leyendo}
            lleno={bandeja.lleno}
            onCamara={() => entradaFoto.current?.click()}
            onQuitar={bandeja.quitar}
          />
        ) : null}

        {!fin && paso === "pegar" ? (
          <>
            {lineas.length > 0 || conFoto ? (
              <button
                type="button"
                onClick={() => setPaso(lineas.length > 0 ? "revisar" : "fotos")}
                className="flex items-center gap-1.5 self-start text-sm font-medium text-brand"
              >
                <ArrowLeft className="h-4 w-4" />
                {lineas.length > 0 ? plural(lineas.length, "línea", "líneas") : "Fotos"}
              </button>
            ) : null}
            <CampoArea
              etiqueta="Texto de la guía"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              className="font-mono text-xs font-normal leading-5"
            />
          </>
        ) : null}

        {!fin && paso === "revisar" ? (
          <RevisionGuia
            lineas={lineas}
            avisos={avisos}
            onCambiar={guia.cambiar}
            onQuitar={guia.quitar}
            onAgregar={guia.agregar}
            arriba={
              guia.hayQuitada ? (
                <p className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-soft">
                  <span className="min-w-0 truncate text-muted">Línea quitada</span>
                  <button type="button" onClick={guia.deshacerQuitar} className="shrink-0 font-semibold text-brand">
                    Deshacer
                  </button>
                </p>
              ) : null
            }
          />
        ) : null}

        {fin ? (
          <>
            <VistaFinGuia
              paso={fin}
              fecha={fecha}
              lecturaIA={lecturaIA}
              onAplicada={onCreados}
              onDejar={carga.dejar}
              onDeshacer={() => setPregunta("deshacer")}
              onCorregir={onCorregir}
            />
            {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
          </>
        ) : null}
      </div>

      <div className="border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <PieGuia
          fin={fin}
          paso={paso}
          pregunta={pregunta}
          hayRuta={hayRuta}
          fueraDeRuta={fueraDeRuta}
          leyendo={leyendo}
          hayTexto={texto.trim() !== ""}
          lineas={lineas.length}
          malas={malas}
          porConfirmar={porConfirmar}
          fotos={fotos.length}
          pieFotos={
            <PieFotos
              fotos={fotos.length}
              leyendo={leyendo}
              lleno={bandeja.lleno}
              onCamara={() => entradaFoto.current?.click()}
              onGaleria={() => entradaFotos.current?.click()}
              onLeer={() => void leerFotos()}
              onBarrer={onBarrer}
              onPegar={() => setPaso("pegar")}
            />
          }
          onLeer={leer}
          onLeerFotos={() => void leerFotos()}
          onCrear={() => void crear()}
          onSumar={onSumar}
          onEscanear={onEscanearPaquetes}
          armar={armar}
          onDescartar={() => void borrador.descartar().then(onCerrar)}
          onDeshacer={() => void deshacerCarga()}
          onSeguir={() => setPregunta(null)}
        />
      </div>
      {barrer.activo ? (
        <CamaraBarrido
          vista={barrer.vista}
          conLinterna={barrer.conLinterna}
          onDetener={() => {
            setPregunta(null);
            void barrer.terminar();
          }}
          onCerrar={cerrarBarrido}
          pregunta={
            pregunta === "barrido" ? (
              <FranjaConfirmar
                texto="¿Descartar lo barrido?"
                si="Descartar"
                onSi={() => {
                  setPregunta(null);
                  void barrer.descartar();
                }}
                onNo={() => setPregunta(null)}
              />
            ) : undefined
          }
        />
      ) : null}
    </div>,
    document.body,
  );
}
