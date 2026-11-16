"use client";

// Diagnóstico → «Probar escaneo de nómina» (dueño, 2026-11-11): el mismo barrido de
// «Cargar la guía» → «Barrer la nómina» (use-barrido-nomina), pero sin crear pedidos:
// al terminar muestra lo leído y las cifras para medirlo en terreno (cuántas OF, cuántas
// lecturas con dígitos mal, la confianza de ML Kit, si juntar los renglones por fila
// arma mejor los encargos que el orden de ML Kit) y «Copiar anonimizado». No guarda
// nada ni manda nada: todo queda en el teléfono.

import { useState } from "react";
import { Check, Copy, ScrollText } from "lucide-react";
import { mejorResultado, resultadoNomina, VOTOS_PARA_FIRME, type ResultadoNomina } from "@/lib/encomiendas/lectura/barrido-nomina";
import { anonimizarEtiqueta } from "@/lib/encomiendas/lectura/etiqueta/anonimizar";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { elegirExposicionDelBarrido, escanerVivoDisponible, exposicionDelBarrido, type ExposicionViva } from "@/lib/nativo/escaner-vivo";
import { CamaraBarrido } from "../../encomiendas/_componentes/camara-barrido";
import { useBarridoNomina, type Barrido } from "../../encomiendas/_hooks/use-barrido-nomina";

type Medida = {
  segundos: number;
  cuadros: number;
  msPromedio: number;
  conTexto: number;
  porFilas: ResultadoNomina;
  comoLlegan: ResultadoNomina;
  /** Los mismos cuadros contando también las piezas (apagadas, spec 034). */
  conPiezas: ResultadoNomina | null;
  exposicion: ExposicionViva;
  cuadrosFijos: number;
  muestra: string;
};

const EXPOSICIONES: { valor: ExposicionViva; nombre: string }[] = [
  { valor: "auto", nombre: "Automática" },
  { valor: "corta", nombre: "Corta" },
  { valor: "cortaOscura", nombre: "Corta y oscura" },
];

function medir(b: Barrido): Medida {
  return {
    segundos: Math.round((Date.now() - b.inicio) / 1000),
    cuadros: b.cuadros,
    msPromedio: Math.round(b.msTotal / Math.max(1, b.cuadros)),
    conTexto: b.conTexto,
    porFilas: resultadoNomina(b.porFilas),
    comoLlegan: resultadoNomina(b.comoLlegan),
    conPiezas: b.conPiezas ? resultadoNomina(b.conPiezas) : null,
    exposicion: exposicionDelBarrido(),
    cuadrosFijos: b.cuadrosFijos,
    muestra: b.muestra.texto,
  };
}

/** Las cifras del barrido, sin ninguna OF ni dirección. */
function cifras(m: Medida): string[] {
  const porSegundo = (m.cuadros / Math.max(1, m.segundos)).toFixed(1);
  return [
    `${m.cuadros} cuadros en ${m.segundos} s (${porSegundo} por segundo) · ${m.msPromedio} ms promedio · ${m.conTexto} con texto · exposición ${m.exposicion}${m.cuadrosFijos ? ` (${m.cuadrosFijos} cuadros/s fijos)` : ""}`,
    resumen("Por filas", m.porFilas),
    resumen("Como llegan", m.comoLlegan),
    ...(m.conPiezas ? [resumen("Con piezas (apagadas; solo se mide)", m.conPiezas)] : []),
    ...mejorResultado(m.porFilas, m.comoLlegan).lista.map((l, i) => {
      const c = l.cerca;
      const cerca = c ? `más parecida a ${c.digitos} dígitos${c.mismoCuadro ? ", en el mismo cuadro" : ""}${c.mismaDireccion == null ? "" : c.mismaDireccion ? ", misma dirección" : ", otra dirección"}` : "sola";
      return `${i + 1}. ${l.estado}${l.motivo ? ` (${l.motivo})` : ""} · número ${l.ofFirme ? "firme" : "sin firmar"} · ${l.cuadros} cuadros · ${l.lecturas} lecturas · ${cerca}`;
    }),
    `La nómina dice: ${m.porFilas.total ?? "no se leyó"} · números de 7 a 10 dígitos en ≥ ${VOTOS_PARA_FIRME} cuadros: ${m.porFilas.numerosFirmes}`,
  ];
}

function resumen(nombre: string, r: ResultadoNomina): string {
  const sinDestino = r.lineas.filter((l) => !l.destino).length;
  const dudosos = r.lineas.filter((l) => l.destino && !l.destinoFirme).length;
  const confianza = r.digitosLeidos
    ? `${Math.round((100 * r.digitosDudosos) / r.digitosLeidos)} % de ${r.digitosLeidos} dígitos con poca confianza`
    : "sin confianza por dígito";
  const piezas = `${r.conteo.enteros} encargos enteros, ${r.conteo.sueltas} OF sueltas y ${r.conteo.abiertas} direcciones sin cerrar leídos · ${r.ambiguas} sueltas sin dueño · ${r.ruido} números de ruido y ${r.malLeidas} malas lecturas de una OF firme botados · ${r.dobles} firmes que parecen la misma fila`;
  return `${nombre}: ${piezas} · ${r.firmes} OF confirmadas · ${r.porConfirmar} por confirmar · ${r.unaVez} vistas una vez · ${r.lecturasCorregidas} lecturas con dígitos mal, corregidas · ${sinDestino} sin dirección · ${dudosos} con dirección dudosa · ${confianza}`;
}

export function ProbarBarridoNomina({ enApp }: { enApp: boolean }) {
  // enApp llega después de abrir la pantalla: en el servidor no hay APK.
  const disponible = enApp && escanerVivoDisponible();
  const [medida, setMedida] = useState<Medida | null>(null);
  const [anonimo, setAnonimo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Lo guardado se lee recién en la app (`enApp` llega después de abrir la pantalla).
  const [elegida, setElegida] = useState<ExposicionViva | null>(null);
  const exposicion = elegida ?? (enApp ? exposicionDelBarrido() : "corta");
  const barrido = useBarridoNomina((b) => setMedida(medir(b)), { comparar: true });

  function iniciar() {
    setMedida(null);
    setAnonimo(null);
    setCopiado(false);
    void barrido.iniciar();
  }

  /** Las cifras y un cuadro anonimizado: sin ninguna OF ni dirección real. */
  async function copiarAnonimizado(m: Medida) {
    const sinDatos = [...cifras(m), "", "Cuadro con más renglones:", anonimizarEtiqueta(m.muestra)].join("\n");
    setAnonimo(sinDatos);
    try {
      await navigator.clipboard.writeText(sinDatos);
      setCopiado(true);
    } catch {
      // Sin portapapeles queda a la vista para seleccionarlo a mano.
      setCopiado(false);
    }
  }

  const mejor = medida ? mejorResultado(medida.porFilas, medida.comoLlegan) : null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        disabled={!disponible || barrido.activo}
        onClick={iniciar}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
      >
        <ScrollText className="h-4 w-4" />
        Probar escaneo de nómina
      </button>
      {/* Spec 034: la misma nómina con cada exposición, para elegir con cifras. */}
      <div role="radiogroup" aria-label="Exposición al escanear" className="grid grid-cols-3 gap-2">
        {EXPOSICIONES.map((e) => (
          <button
            key={e.valor}
            type="button"
            role="radio"
            aria-checked={exposicion === e.valor}
            disabled={barrido.activo}
            onClick={() => (elegirExposicionDelBarrido(e.valor), setElegida(e.valor))}
            className={
              exposicion === e.valor
                ? "h-11 rounded-full bg-brand text-xs font-semibold text-brand-foreground"
                : "h-11 rounded-full border border-separator bg-card text-xs font-semibold"
            }
          >
            {exposicion === e.valor ? "● " : ""}
            {e.nombre}
          </button>
        ))}
      </div>
      {!disponible ? (
        <p className="text-xs text-muted">{enApp ? "Esta versión no incluye el escáner en vivo (APK 1.6.0)." : "Solo en la app."}</p>
      ) : null}
      {barrido.error ? <p className="text-sm text-danger">{barrido.error}</p> : null}

      {medida && mejor ? (
        <div className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-soft">
          {cifras(medida).map((linea, i) => (
            <p key={i} className={i === 0 ? "font-mono text-xs text-muted" : undefined}>
              {linea}
            </p>
          ))}
          <ol className="divide-y divide-separator rounded-xl border border-separator">
            {mejor.lineas.map((l, i) => (
              <li key={l.of} className="flex gap-2 px-3 py-1.5">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-mono">OF {formatoOf(l.of)}</span> · {l.destino ?? "sin dirección"}
                  <span className="ml-1.5 font-mono text-xs text-muted">
                    {l.cuadros} cuadros{l.lecturas > 1 ? ` · ${l.lecturas} lecturas` : ""}
                  </span>
                  {!l.firme ? <span className="ml-1.5 text-xs font-semibold text-warn">⚠ número por confirmar</span> : null}
                  {l.destino && !l.destinoFirme ? (
                    <span className="ml-1.5 text-xs font-semibold text-warn">⚠ dirección dudosa</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => void copiarAnonimizado(medida)}
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
        </div>
      ) : null}

      {barrido.activo ? (
        <CamaraBarrido vista={barrido.vista} conLinterna={barrido.conLinterna} onDetener={() => void barrido.terminar()} />
      ) : null}
    </section>
  );
}
