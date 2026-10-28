"use client";

// El resultado de escanear una etiqueta (spec 005): "PARADA n de N" y la
// descripción en lo más grande, y lo que falta completar del pedido —con la foto
// de la etiqueta (leída en el teléfono y, si no alcanza, con IA), pegando su
// texto o con tres toques—.

import { useRef, useState } from "react";
import { AlertTriangle, Camera, ClipboardPaste, Loader2 } from "lucide-react";
import { CampoArea } from "@/components/ui/campo";
import { formatCLP } from "@/lib/comun/format";
import type { CodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { leerEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { formatoOf, notaPaquete, referenciaOVacia, textoReferencia } from "@/lib/encomiendas/paquete";
import {
  aplicarLecturaEtiqueta,
  cambiarDireccion,
  guardarFoto,
  guardarPaquete,
  type ResultadoEscaneo,
} from "@/lib/encomiendas/local/almacen";
import { leerImagen } from "@/lib/encomiendas/local/lectura-cliente";
import { ubicarDireccion } from "@/lib/geo/geocoding";
import { esApp } from "@/lib/nativo/entorno";
import { comprimirFoto } from "@/lib/encomiendas/local/foto";
import { CamposPaquete, paqueteDe, type EstadoPaquete } from "./campos-paquete";

/** Lo que se leyó y lo que falta completar del pedido escaneado. */
export function Resultado({
  fecha,
  lecturaIA,
  inicial: r,
  codigo,
  onCambio,
}: {
  fecha: string;
  lecturaIA: boolean;
  inicial: ResultadoEscaneo;
  codigo: CodigoEtiqueta;
  onCambio: (r: ResultadoEscaneo) => void;
}) {
  const p = r.pedido;
  const [pegando, setPegando] = useState(false);
  const [textoEtiqueta, setTextoEtiqueta] = useState("");
  const [describiendo, setDescribiendo] = useState(false);
  const [paquete, setPaquete] = useState<EstadoPaquete>(() => paqueteDe(p));
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [ofDistinta, setOfDistinta] = useState<string | null>(null);
  const [cambiandoDireccion, setCambiandoDireccion] = useState(false);
  const [avisoDireccion, setAvisoDireccion] = useState<string | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const referencia = textoReferencia(p.referencia);
  const faltanDatos = !p.nombre || !p.telefono || p.porPagar === null;
  const faltanBultos = p.bultos != null ? p.bultos - p.bultosEscaneados.length : 0;

  /** La foto de la etiqueta → destinatario, teléfono, pago (y, si la leyó la IA,
   *  la descripción). La foto queda como foto del paquete, solo en el teléfono. */
  async function completarConFoto(archivo: File | undefined) {
    if (!archivo) return;
    setLeyendo(true);
    setErrorIA(null);
    try {
      const respuesta = await leerImagen("etiqueta", archivo, { ia: lecturaIA });
      if (respuesta.tipo !== "etiqueta") throw new Error("Respuesta inesperada.");
      const { etiqueta } = respuesta;
      // La OF manda la del código. Si la foto dice otra, es la etiqueta de otro
      // paquete: no se aplica (si no, este se llevaba el nombre y el teléfono de
      // otra persona; spec 017, E4).
      if (etiqueta.ofImpresa && etiqueta.ofImpresa !== codigo.of) {
        setOfDistinta(etiqueta.ofImpresa);
        return;
      }
      setOfDistinta(null);
      const nuevo = await aplicarLecturaEtiqueta(fecha, {
        ...etiqueta,
        of: codigo.of,
        ofConfirmada: etiqueta.ofImpresa === codigo.of,
        bulto: codigo.bulto ?? etiqueta.bulto,
      });
      if (nuevo) {
        if (!nuevo.pedido.fotoId) await guardarFoto(nuevo.pedido.id, await comprimirFoto(archivo));
        const refrescado = await aplicarLecturaEtiqueta(fecha, { of: codigo.of, bulto: null });
        // El refresco no trae la dirección de la etiqueta: el aviso se conserva (E5).
        onCambio(refrescado ? { ...refrescado, direccionDistinta: nuevo.direccionDistinta } : nuevo);
      }
    } catch (e) {
      setErrorIA(e instanceof Error ? e.message : "No se pudo leer la foto.");
    } finally {
      setLeyendo(false);
      if (entradaFoto.current) entradaFoto.current.value = "";
    }
  }

  /** La etiqueta dice otra dirección que la guía y el conductor eligió la de la
   *  etiqueta: se guarda y se ubica de nuevo (T022). */
  async function usarDireccionEtiqueta(direccion: string) {
    setCambiandoDireccion(true);
    try {
      const ubicacion = await ubicarDireccion(direccion);
      await cambiarDireccion(p.id, direccion, ubicacion.elegida);
      const nuevo = await aplicarLecturaEtiqueta(fecha, { of: codigo.of, bulto: null });
      if (nuevo) onCambio(nuevo);
      setAvisoDireccion(
        ubicacion.elegida
          ? "Dirección cambiada. Rehaz la ruta para que la parada quede en su orden."
          : "Dirección cambiada, pero no se pudo ubicar: corrígela en el pedido.",
      );
    } finally {
      setCambiandoDireccion(false);
    }
  }

  async function completarConTexto() {
    const leido = leerEtiqueta(textoEtiqueta);
    // Lo más peligroso de copiar y pegar: que quede pegada la etiqueta anterior y
    // este paquete se lleve el nombre y el teléfono de otra persona. Si el texto
    // trae otra OF, no se aplica.
    if (leido.ofImpresa && leido.ofImpresa !== codigo.of) {
      setErrorIA(
        `El texto pegado es de la OF ${formatoOf(leido.ofImpresa)}, no de este paquete (OF ${formatoOf(codigo.of)}). Copia el de esta etiqueta.`,
      );
      return;
    }
    setErrorIA(null);
    // El bulto del código manda; escrita a mano la OF, vale el de la etiqueta.
    const nuevo = await aplicarLecturaEtiqueta(fecha, {
      ...leido,
      of: codigo.of,
      ofConfirmada: leido.ofImpresa === codigo.of,
      bulto: codigo.bulto ?? leido.bulto,
    });
    if (nuevo) onCambio(nuevo);
    setPegando(false);
    setTextoEtiqueta("");
  }

  async function guardarDescripcion() {
    setGuardando(true);
    try {
      await guardarPaquete(p.id, {
        referencia: referenciaOVacia({
          tipo: paquete.tipo,
          tamano: paquete.tamano,
          color: paquete.color,
          nota: notaPaquete(paquete.nota),
        }),
      });
      if (paquete.fotoNueva) await guardarFoto(p.id, paquete.fotoNueva);
      const nuevo = await aplicarLecturaEtiqueta(fecha, { of: codigo.of, bulto: null });
      if (nuevo) onCambio({ ...nuevo, direccionDistinta: r.direccionDistinta });
      setDescribiendo(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-brand px-5 py-4 text-brand-foreground">
        <p className="text-sm font-medium opacity-80">{r.parada ? "PARADA" : "SIN RUTA TODAVÍA"}</p>
        {r.parada ? (
          <p className="text-6xl font-bold leading-none tabular-nums">
            {r.parada.n}
            <span className="text-2xl font-semibold opacity-80"> de {r.parada.total}</span>
          </p>
        ) : (
          <p className="text-base">Arma la ruta para saber su parada.</p>
        )}
        <p className="mt-2 text-2xl font-bold leading-tight">{referencia ?? "Sin descripción"}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums opacity-90">OF {formatoOf(p.of ?? "")}</p>
      </div>

      {p.bultos != null && p.bultos > 1 ? (
        <p className={faltanBultos > 0 ? "rounded-xl bg-warn-bg px-3 py-2 text-sm font-medium text-warn" : "text-sm text-ok"}>
          Bultos: {p.bultosEscaneados.length} de {p.bultos}
          {faltanBultos > 0 ? ` · falta${faltanBultos === 1 ? "" : "n"} ${faltanBultos}` : " · completo"}
        </p>
      ) : null}

      {p.porPagar ? (
        <p className="rounded-xl bg-danger-bg px-3 py-2 text-base font-bold text-danger">
          POR PAGAR {p.montoPorPagar != null ? formatCLP(p.montoPorPagar) : "· monto por revisar"}
        </p>
      ) : null}

      <div className="rounded-2xl bg-card px-4 py-3 shadow-soft">
        <p className="text-sm font-medium">{p.nombre || "Destinatario sin leer"}</p>
        <p className="text-sm text-muted">{p.telefono || "Teléfono sin leer"}</p>
        <p className="text-sm text-muted">{p.direccion}</p>
      </div>

      {r.direccionDistinta ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          La etiqueta dice &ldquo;{r.direccionDistinta}&rdquo;, distinto de la guía. Revisa cuál es la buena.
        </p>
      ) : null}
      {r.direccionDistinta ? (
        <button
          type="button"
          disabled={cambiandoDireccion}
          onClick={() => void usarDireccionEtiqueta(r.direccionDistinta!)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
        >
          {cambiandoDireccion ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Usar la dirección de la etiqueta
        </button>
      ) : null}
      {avisoDireccion ? <p className="text-sm text-muted">{avisoDireccion}</p> : null}

      {ofDistinta ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          La foto es de la OF {formatoOf(ofDistinta)}, no de este paquete: no se usó. Saca la foto a la etiqueta de este paquete.
        </p>
      ) : null}

      <input
        ref={entradaFoto}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void completarConFoto(e.target.files?.[0])}
      />
      {(lecturaIA || esApp()) && faltanDatos ? (
        <button
          type="button"
          disabled={leyendo}
          onClick={() => entradaFoto.current?.click()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground disabled:opacity-60"
        >
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {leyendo ? "Leyendo la etiqueta…" : "Foto de la etiqueta"}
        </button>
      ) : null}
      {/* Con los datos ya cargados se puede volver a leer: si la primera lectura
          salió mal, una foto de ESTA etiqueta la corrige (spec 017, E4). */}
      {(lecturaIA || esApp()) && !faltanDatos ? (
        <button
          type="button"
          disabled={leyendo}
          onClick={() => entradaFoto.current?.click()}
          className="flex w-full items-center justify-center gap-2 py-1 text-sm font-medium text-brand disabled:opacity-60"
        >
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {leyendo ? "Leyendo la etiqueta…" : "Leer la etiqueta de nuevo"}
        </button>
      ) : null}
      {errorIA ? <p className="text-sm text-danger">{errorIA}</p> : null}

      {faltanDatos && !pegando ? (
        <button
          type="button"
          onClick={() => setPegando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-separator py-3 text-sm font-medium text-brand"
        >
          <ClipboardPaste className="h-4 w-4" />
          Completar con el texto de la etiqueta
        </button>
      ) : null}
      {pegando ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Google Lens sobre la etiqueta → Texto → Copiar todo, y pégalo acá.</p>
          <CampoArea
            etiqueta="Texto de la etiqueta"
            autoFocus
            rows={6}
            value={textoEtiqueta}
            onChange={(e) => setTextoEtiqueta(e.target.value)}
            className="text-xs font-normal leading-5"
          />
          <button
            type="button"
            disabled={!textoEtiqueta.trim()}
            onClick={() => void completarConTexto()}
            className="h-11 w-full rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
          >
            Completar
          </button>
        </div>
      ) : null}

      {!referencia && !describiendo ? (
        <button
          type="button"
          onClick={() => setDescribiendo(true)}
          className="w-full rounded-2xl border border-dashed border-separator py-3 text-sm font-medium text-brand"
        >
          Describir el paquete (tres toques)
        </button>
      ) : null}
      {describiendo ? (
        <div className="space-y-2">
          <CamposPaquete
            valor={paquete}
            onCambiar={(c) => setPaquete((x) => ({ ...x, ...c }))}
            fotoGuardadaId={p.fotoId}
            deshabilitado={guardando}
          />
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardarDescripcion()}
            className="h-11 w-full rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
          >
            Guardar la descripción
          </button>
        </div>
      ) : null}
    </div>
  );
}
