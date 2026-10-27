"use client";

// Cargar el día desde la guía de despacho (spec 005, US1): texto de la guía →
// revisar las líneas → crear los pedidos → ubicar sus direcciones. Después sigue
// el flujo de siempre: armar la ruta y escanear cada etiqueta.
//
// Con una foto de la guía: en la APK el texto se lee en el teléfono (gratis) y,
// si no alcanza, con la IA (ver lectura-cliente). Sin foto, el texto se copia de
// la guía con Google Lens ("Copiar texto") y se pega acá.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ClipboardPaste, Loader2, X } from "lucide-react";
import { armarGuia, leerGuia, limpiarDestino, type LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { ofValida } from "@/lib/encomiendas/paquete";
import { crearDesdeGuia, fijarCoordenadas } from "@/lib/encomiendas/local/almacen";
import { ubicarDireccion } from "@/lib/geo/geocoding";
import { leerFotosGuia, type FuenteLectura } from "@/lib/encomiendas/local/lectura-cliente";
import { esApp } from "@/lib/nativo/entorno";
import { BandejaFotos, BotonesFoto, BotonesGrandes, useFotosGuia } from "./fotos-guia";
import { LineasGuia } from "./lineas-guia";
import { VistaFinGuia, type FinGuia } from "./fin-guia";
import { corregirSinUbicar } from "@/lib/encomiendas/local/corregir-direcciones";

type Paso =
  /** Sacar o elegir las fotos de la guía (lo primero que se ve). */
  | { tipo: "fotos" }
  /** Pegar el texto copiado con Google Lens (botón aparte). */
  | { tipo: "pegar" }
  | { tipo: "revisar" }
  | FinGuia;

const BOTON =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export function CargarGuia({
  fecha,
  lecturaIA,
  hayRuta,
  onOcupado,
  onEscanearPaquetes,
  onCerrar,
  onCreados,
}: {
  fecha: string;
  /** La IA está encendida: lee la foto si el teléfono no pudo. */
  lecturaIA: boolean;
  /** Ya hay ruta armada: al terminar se sigue directo a escanear los paquetes. */
  hayRuta: boolean;
  /** Avisa mientras se ubican las direcciones (no se puede cerrar). */
  onOcupado?: (ocupado: boolean) => void;
  onEscanearPaquetes: () => void;
  onCerrar: () => void;
  /** Se crearon pedidos: la pantalla los vuelve a leer. */
  onCreados: () => void;
}) {
  // Foto: en la APK siempre (lee el teléfono); en el navegador, solo con IA.
  const conFoto = lecturaIA || esApp();
  const [paso, setPaso] = useState<Paso>(() => ({ tipo: conFoto ? "fotos" : "pegar" }));
  const [texto, setTexto] = useState("");
  const [lineas, setLineas] = useState<LineaGuia[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [folio, setFolio] = useState<string | null>(null);
  /** MONTO NETO de la guía (= cantidad de paquetes), de la foto que lo traiga. */
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  /** Quién leyó las fotos de esta carga (null = texto pegado). */
  const [fuente, setFuente] = useState<FuenteLectura | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const entradaFotos = useRef<HTMLInputElement>(null);
  /** Fotos juntadas y todavía sin leer (ver fotos-guia.tsx). */
  const bandeja = useFotosGuia();
  const { fotos } = bandeja;

  const malas = useMemo(() => lineas.filter((l) => !ofValida(l.of) || !l.destino.trim()).length, [lineas]);
  const ocupado = paso.tipo === "ubicando" || paso.tipo === "corrigiendo";
  useEffect(() => {
    onOcupado?.(ocupado);
    return () => onOcupado?.(false);
  }, [ocupado, onOcupado]);

  function leer() {
    const guia = leerGuia(texto);
    setLineas(guia.lineas);
    setAvisos(guia.avisos);
    setFolio(guia.folio);
    setTotal(guia.totalDeclarado);
    setPaso({ tipo: "revisar" });
  }

  /** Suma fotos a las juntadas, sin leerlas: se sacan de a una (o se eligen de
   *  la galería) y se leen todas juntas con "Leer las N fotos juntas". */
  function agregarFotos(archivos: File[]) {
    if (entradaFoto.current) entradaFoto.current.value = "";
    if (entradaFotos.current) entradaFotos.current.value = "";
    if (archivos.length > 0) setError(bandeja.agregar(archivos));
  }

  /** Las fotos juntadas de la guía (la del día suele ser de 3), TODAS en una
   *  sola consulta a la IA (terreno 2026-10-27). Sus líneas se suman a las que
   *  ya hay y las repetidas se juntan por OF. Al final se compara con el MONTO
   *  NETO, que se conserva aunque esté en una foto anterior (spec 017, E11). */
  async function leerFotos(archivos: File[]) {
    if (archivos.length === 0) return;
    setLeyendo(true);
    setError(null);
    try {
      const r = await leerFotosGuia(archivos, { ia: lecturaIA });
      if (r.tipo !== "guia") throw new Error("Respuesta inesperada.");
      const totalGuia = r.guia.totalDeclarado ?? total;
      const unida = armarGuia([...lineas, ...r.guia.lineas], folio ?? r.guia.folio, totalGuia);
      setLineas(unida.lineas);
      setAvisos(unida.avisos);
      setFolio(unida.folio);
      setTotal(totalGuia);
      setFuente((antes) => (antes === "ia" || r.fuente === "ia" ? "ia" : r.fuente));
      bandeja.vaciar();
      setPaso({ tipo: "revisar" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto.");
    } finally {
      setLeyendo(false);
    }
  }

  function cambiar(i: number, cambio: Partial<LineaGuia>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  async function crear() {
    setError(null);
    const validas = lineas.map((l) => ({ of: ofValida(l.of)!, destino: limpiarDestino(l.destino) }));
    try {
      const { creados, yaEstaban } = await crearDesdeGuia(validas, fecha, {
        folio,
        origen: fuente === "ia" ? "guia_ia" : fuente === "texto" ? "guia_foto" : "guia_pegada",
      });
      onCreados();
      // Una por una, como al cargar a mano: el geocodificador respeta el límite
      // de consultas de OpenStreetMap. Lo que no se ubique queda "Sin ubicar" en
      // la lista, para corregirlo como siempre.
      let ubicados = 0;
      for (const [i, p] of creados.entries()) {
        setPaso({ tipo: "ubicando", hechos: i, total: creados.length });
        try {
          const r = await ubicarDireccion(p.direccion);
          if (r.elegida) {
            await fijarCoordenadas([{ id: p.id, lat: r.elegida.lat, lng: r.elegida.lng }]);
            ubicados++;
          }
        } catch {
          // Sin señal o proveedor caído: queda sin ubicar.
        }
      }
      onCreados();
      // Las que no se ubicaron, con IA (spec 018): solo se aplica sola la
      // corrección segura; las dudosas quedan como sugerencia.
      let corregidas = 0;
      let sugerencias: string[] = [];
      if (lecturaIA && ubicados < creados.length) {
        const r = await corregirSinUbicar(fecha, {
          alAvanzar: (hechos, total) => setPaso({ tipo: "corrigiendo", hechos, total }),
        });
        corregidas = r.corregidas;
        sugerencias = r.sugerencias;
        onCreados();
      }
      setPaso({
        tipo: "listo",
        creados: creados.length,
        ubicados: ubicados + corregidas,
        yaEstaban,
        corregidas,
        sugerencias,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron crear los pedidos.");
      setPaso({ tipo: "revisar" });
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Cargar la guía"
    >
      <div className="flex items-center gap-2 px-4 pb-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Cargar la guía</h2>
        <button
          type="button"
          onClick={onCerrar}
          disabled={ocupado}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
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
        {leyendo ? (
          <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand">
            <Loader2 className="h-4 w-4 animate-spin" />
            Leyendo la guía…
          </p>
        ) : null}
        {error && (paso.tipo === "fotos" || paso.tipo === "pegar") ? (
          <p className="text-sm text-danger">{error}</p>
        ) : null}

        {conFoto ? (
          <BandejaFotos
            fotos={fotos}
            leyendo={leyendo}
            onQuitar={bandeja.quitar}
            onLeer={() => void leerFotos(fotos.map((f) => f.archivo))}
            clase={BOTON}
          />
        ) : null}

        {/* Lo primero: sacar foto o elegir de la galería, grandes y al centro.
            Con fotos ya juntadas, la bandeja arriba y los botones más chicos. */}
        {paso.tipo === "fotos" ? (
          fotos.length === 0 ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4">
              <BotonesGrandes
                deshabilitado={leyendo}
                onCamara={() => entradaFoto.current?.click()}
                onGaleria={() => entradaFotos.current?.click()}
              />
              <p className="max-w-xs text-center text-xs text-muted">
                Una foto por cada parte de la guía, derechas y que se superpongan un poco. Se juntan y se
                leen todas en una sola consulta.
              </p>
            </div>
          ) : (
            <BotonesFoto
              camara="Sacar otra foto"
              deshabilitado={leyendo || bandeja.lleno}
              onCamara={() => entradaFoto.current?.click()}
              onGaleria={() => entradaFotos.current?.click()}
            />
          )
        ) : null}

        {paso.tipo === "pegar" ? (
          <>
            {conFoto ? (
              <button
                type="button"
                onClick={() => setPaso({ tipo: "fotos" })}
                className="flex items-center gap-1.5 text-sm font-medium text-brand"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a las fotos
              </button>
            ) : null}
            <p className="text-sm text-muted">
              En el teléfono de la guía, abre <b>Google Lens</b> sobre la guía, toca <b>Texto</b> →{" "}
              <b>Copiar todo</b>, y pégalo acá. Si la guía no entra en una foto, pega las dos, una
              detrás de la otra.
            </p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              placeholder={"OF:275388184 DESTINO:SAN MARCOS 1030\nOF:…"}
              className="w-full rounded-2xl border border-separator bg-card p-3 font-mono text-xs outline-none focus:border-brand"
            />
          </>
        ) : null}

        {paso.tipo === "revisar" ? (
          <>
            <LineasGuia
              lineas={lineas}
              avisos={avisos}
              folio={folio}
              onCambiar={cambiar}
              onQuitar={(i) => setLineas((ls) => ls.filter((_, j) => j !== i))}
              onAgregar={() => setLineas((ls) => [...ls, { of: "", destino: "", dudosa: true }])}
            >
              {conFoto ? (
                <BotonesFoto
                  camara="Sacar otra foto"
                  deshabilitado={leyendo || bandeja.lleno}
                  onCamara={() => entradaFoto.current?.click()}
                  onGaleria={() => entradaFotos.current?.click()}
                />
              ) : null}
            </LineasGuia>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </>
        ) : null}

        {paso.tipo === "ubicando" || paso.tipo === "corrigiendo" || paso.tipo === "listo" ? (
          <VistaFinGuia paso={paso} hayRuta={hayRuta} />
        ) : null}
      </div>

      <div className="border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {paso.tipo === "fotos" ? (
          // Google Lens, aparte: abre su propia pantalla con las instrucciones.
          <button
            type="button"
            disabled={leyendo}
            onClick={() => setPaso({ tipo: "pegar" })}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
          >
            <ClipboardPaste className="h-4 w-4" />
            Pegar el texto de Google Lens
          </button>
        ) : paso.tipo === "pegar" ? (
          <button type="button" disabled={!texto.trim() || leyendo} onClick={leer} className={BOTON}>
            <ClipboardPaste className="h-4 w-4" />
            Leer la guía
          </button>
        ) : paso.tipo === "revisar" ? (
          <button
            type="button"
            disabled={lineas.length === 0 || malas > 0 || fotos.length > 0 || leyendo}
            onClick={() => void crear()}
            className={BOTON}
          >
            {fotos.length > 0
              ? "Primero lee las fotos de arriba"
              : malas > 0
              ? `Corrige ${malas} ${malas === 1 ? "línea" : "líneas"}`
              : `Crear ${lineas.length} ${lineas.length === 1 ? "pedido" : "pedidos"}`}
          </button>
        ) : paso.tipo === "listo" ? (
          hayRuta ? (
            <button type="button" onClick={onEscanearPaquetes} className={BOTON}>
              Escanear los paquetes
            </button>
          ) : (
            <button type="button" onClick={onCerrar} className={BOTON}>
              Armar la ruta
            </button>
          )
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
