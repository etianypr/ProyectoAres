"use client";

// Diagnóstico → «Probar etiqueta» (spec 021, US3): la foto de una etiqueta, lo que
// leyó ML Kit y lo que entendió el lector (con las mismas dos lecturas que el
// escaneo, y en qué no coincidieron), y «Copiar anonimizado» para que una
// etiqueta que falló en terreno vuelva como prueba sin datos de nadie. Todo en el
// teléfono: no guarda nada ni manda nada.

import { useRef, useState } from "react";
import { Check, Copy, Loader2, Tag } from "lucide-react";
import { formatCLP } from "@/lib/comun/format";
import { formatoEtiqueta, type FormatoEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { anonimizarEtiqueta } from "@/lib/encomiendas/lectura/etiqueta/anonimizar";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { leerFotoEtiquetaDoble } from "@/lib/encomiendas/local/lectura-cliente";

type Prueba = { texto: string; leido: LecturaEtiqueta; formato: FormatoEtiqueta; distintos: string[] } | { texto: null };

const NOMBRES: Record<string, string> = {
  ofImpresa: "OF impresa",
  bulto: "bulto",
  bultosTotal: "bultos",
  destinatario: "destinatario",
  telefono: "teléfono",
  direccion: "dirección",
  porPagar: "pago",
  montoPorPagar: "monto",
};

const FORMATOS: Record<FormatoEtiqueta, string> = {
  lion: "Lion × Starken",
  expres: "Starken EXPRES",
  starken: "Starken",
  desconocido: "otro (no está en el diccionario)",
};

function pagoDe(e: LecturaEtiqueta): string {
  if (e.porPagar === null) return "sin leer";
  if (!e.porPagar) return "no se cobra";
  return e.montoPorPagar != null ? `POR PAGAR ${formatCLP(e.montoPorPagar)}` : "POR PAGAR · monto por revisar";
}

function Dato({ etiqueta, valor, dudoso }: { etiqueta: string; valor: string | null; dudoso?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-2 text-sm">
      <span className="w-24 shrink-0 text-muted">{etiqueta}</span>
      <span className="min-w-0 flex-1 break-words">
        {valor ?? "sin leer"}
        {dudoso ? <span className="ml-1.5 text-xs font-semibold text-warn">⚠ revisar</span> : null}
      </span>
    </div>
  );
}

export function ProbarEtiqueta({ enApp }: { enApp: boolean }) {
  const entradaFoto = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [anonimo, setAnonimo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function probar(archivo: File | undefined) {
    if (!archivo) return;
    setLeyendo(true);
    setAnonimo(null);
    setCopiado(false);
    try {
      const leida = await leerFotoEtiquetaDoble(archivo);
      setPrueba(
        leida
          ? { texto: leida.texto, leido: leida.lectura, formato: formatoEtiqueta(leida.texto), distintos: leida.distintos }
          : { texto: null },
      );
    } catch {
      setPrueba({ texto: null });
    } finally {
      setLeyendo(false);
      if (entradaFoto.current) entradaFoto.current.value = "";
    }
  }

  /** Se muestra antes de copiar: el que lo manda ve que no quedó ningún dato. */
  async function copiarAnonimizado(texto: string) {
    const sinDatos = anonimizarEtiqueta(texto);
    setAnonimo(sinDatos);
    try {
      await navigator.clipboard.writeText(sinDatos);
      setCopiado(true);
    } catch {
      // Sin portapapeles queda a la vista para seleccionarlo a mano.
      setCopiado(false);
    }
  }

  const dudoso = (campo: string) => prueba?.texto != null && prueba.leido.dudosos.includes(campo);

  return (
    <section className="space-y-2">
      <input
        ref={entradaFoto}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void probar(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={leyendo || !enApp}
        onClick={() => entradaFoto.current?.click()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
      >
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
        {leyendo ? "Leyendo la etiqueta…" : enApp ? "Probar etiqueta" : "Probar etiqueta · Solo en la app"}
      </button>

      {prueba && prueba.texto === null ? (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm text-danger shadow-soft">ML Kit no leyó texto en la foto.</p>
      ) : null}

      {prueba?.texto ? (
        <>
          <div className="divide-y divide-divider rounded-2xl bg-card shadow-soft">
            <Dato etiqueta="Formato" valor={FORMATOS[prueba.formato]} />
            <Dato etiqueta="Destinatario" valor={prueba.leido.destinatario} dudoso={dudoso("destinatario")} />
            <Dato etiqueta="Teléfono" valor={prueba.leido.telefono} dudoso={dudoso("telefono")} />
            <Dato
              etiqueta="Pago"
              valor={pagoDe(prueba.leido)}
              dudoso={dudoso("pago") || dudoso("montoPorPagar")}
            />
            <Dato etiqueta="Dirección" valor={prueba.leido.direccion} dudoso={dudoso("direccion")} />
            <Dato
              etiqueta="Bultos"
              valor={prueba.leido.bulto != null ? `${prueba.leido.bulto} de ${prueba.leido.bultosTotal ?? "?"}` : null}
            />
            <Dato etiqueta="OF impresa" valor={prueba.leido.ofImpresa ? formatoOf(prueba.leido.ofImpresa) : null} />
          </div>

          <p className="text-xs text-muted">
            {prueba.distintos.length
              ? `Las dos lecturas no coincidieron en: ${prueba.distintos.map((d) => NOMBRES[d] ?? d).join(", ")}.`
              : "Las dos lecturas coincidieron."}
          </p>

          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-card px-4 py-3 font-mono text-xs shadow-soft">
            {prueba.texto}
          </pre>

          <button
            type="button"
            onClick={() => void copiarAnonimizado(prueba.texto)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-brand-foreground"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? "Copiado sin datos" : "Copiar anonimizado"}
          </button>
          {anonimo ? (
            <pre className="max-h-60 select-all overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-dashed border-separator px-4 py-3 font-mono text-xs">
              {anonimo}
            </pre>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
