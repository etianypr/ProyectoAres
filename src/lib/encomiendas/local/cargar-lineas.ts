// «Crear N pedidos» en «Cargar la guía» (spec 005): crear los pedidos, ubicarlos
// de a uno y pedirle a la IA los que no se ubicaron (spec 018). Sale de la
// pantalla para poder probarlo (spec 033): se puede cortar, para solo sin señal,
// le pregunta a la IA solo por los de ESTA carga y dice por qué quedó cada cosa.

import type { ResultadoUbicacion } from "@/lib/geo/geocoding";
import type { ResultadoIA } from "@/lib/geo/direccion-ia/contrato";
import type { LineaParaCrear, OrigenCarga } from "./almacen";
import { crearDesdeGuia } from "./almacen";
import { corregirSinUbicar, type PropuestaCorreccion, type ResumenCorreccion } from "./corregir-direcciones";
import { hayRed, ubicarCarga } from "./ubicar-carga";

/** Qué pasó con la IA: apagada (sin clave o sin «Corregir con IA»), sin señal,
 *  cortada por el conductor, preguntada, o no hizo falta (null). */
export type EstadoIA = "apagada" | "sinSenal" | "cortada" | "hecha" | null;

export type ResumenCarga = {
  /** Los ids creados: «Deshacer esta carga» borra estos. */
  ids: string[];
  ubicados: number;
  yaEstaban: number;
  sinUbicar: { id: string; direccion: string }[];
  /** La ubicación paró por falta de señal. */
  sinSenal: boolean;
  /** El conductor tocó «Dejar de ubicar». */
  cortado: boolean;
  ia: EstadoIA;
  /** Lo que la IA miró y no supo arreglar. */
  sinArreglo: number;
  propuestas: PropuestaCorreccion[];
};

export type FaseCarga = "ubicando" | "corrigiendo";

export async function cargarLineasGuia(
  lineas: LineaParaCrear[],
  fecha: string,
  {
    folio,
    origen,
    lecturaIA,
    senal,
    alAvanzar,
    alCrear,
    ubicar,
    corregir,
    enLinea = hayRed,
  }: {
    folio: string | null;
    origen: Extract<OrigenCarga, "guia_ia" | "guia_foto" | "guia_pegada">;
    lecturaIA: boolean;
    senal?: AbortSignal;
    alAvanzar?: (fase: FaseCarga, hechos: number, total: number) => void;
    /** Los pedidos ya quedaron en el teléfono: la pantalla los vuelve a leer. */
    alCrear?: () => void;
    /** Para las pruebas: los buscadores y la IA. */
    ubicar?: (direccion: string, senal?: AbortSignal) => Promise<ResultadoUbicacion>;
    corregir?: (direccion: string) => Promise<ResultadoIA>;
    enLinea?: () => boolean;
  },
): Promise<ResumenCarga> {
  const { creados, yaEstaban } = await crearDesdeGuia(lineas, fecha, { folio, origen });
  alCrear?.();
  const u = await ubicarCarga(creados, {
    senal,
    enLinea,
    ubicar,
    alAvanzar: (hechos, total) => alAvanzar?.("ubicando", hechos, total),
  });
  const porId = new Map(creados.map((p) => [p.id, p.direccion]));
  const resumen: ResumenCarga = {
    ids: creados.map((p) => p.id),
    ubicados: u.ubicados,
    yaEstaban,
    sinUbicar: u.sinUbicar.map((id) => ({ id, direccion: porId.get(id) ?? "" })),
    sinSenal: u.sinSenal,
    cortado: u.cortado,
    ia: null,
    sinArreglo: 0,
    propuestas: [],
  };
  if (u.sinUbicar.length === 0) return resumen;
  if (!lecturaIA) return { ...resumen, ia: "apagada" };
  if (u.cortado) return { ...resumen, ia: "cortada" };
  if (u.sinSenal) return { ...resumen, ia: "sinSenal" };

  // La IA, solo con las de esta carga (antes miraba todo el día, spec 033).
  const r: ResumenCorreccion = await corregirSinUbicar(fecha, {
    ids: u.sinUbicar,
    senal,
    enLinea,
    corregir,
    alAvanzar: (hechos, total) => alAvanzar?.("corrigiendo", hechos, total),
  });
  const ia: EstadoIA = r.sinIA
    ? "apagada"
    : senal?.aborted
      ? "cortada"
      : r.sinSenal > 0 && r.propuestas.length === 0 && r.sinArreglo === 0
        ? "sinSenal"
        : "hecha";
  return { ...resumen, ia, sinArreglo: r.sinArreglo, propuestas: r.propuestas };
}
