// Una dirección ya escrita → dónde queda, sin elegir sola cuando hay dudas.

import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { largoDeCalle } from "./calles";
import { comoPlusCode } from "./codigo";
import { aplicarPuertas, combinarSugerencias, completarNumeroEnCalles } from "./completar-numero";
import {
  calleDeLaConsulta,
  coincidenciaCalle,
  compararCoincidencias,
  normalizar,
  normalizarConsulta,
  type Coincidencia,
} from "./consulta";
import { conGoogle } from "./google";
import { conMapbox } from "./mapbox";
import { conNominatim } from "./nominatim";
import type { SugerenciaDireccion, TipoUbicacion } from "./tipos";

// Dos coincidencias más separadas que esto son lugares DISTINTOS, no dos formas
// de escribir el mismo. Trescientos metros es más de una cuadra de Arica: por
// debajo de eso, elegir cualquiera deja al conductor en la puerta o en la de al
// lado; por encima, lo manda a otro barrio.
const METROS_AMBIGUEDAD = 300;

// Una calle que entera mide menos que esto se puede usar sin el número: la
// parada queda, a lo sumo, a una cuadra de la puerta. Es la misma vara que
// METROS_AMBIGUEDAD. Medido con la guía real: pasajes de 135 m y 270 m que
// ningún proveedor tiene numerados y que el conductor corregía a mano.
const METROS_CALLE_CORTA = 300;

/** ¿Hay dos puntos de la lista a más de una cuadra entre sí? */
function separados(puntos: SugerenciaDireccion[]): boolean {
  return puntos.some((a, i) => puntos.slice(i + 1).some((b) => distanciaMetros(a, b) > METROS_AMBIGUEDAD));
}

export type ResultadoUbicacion = {
  tipo: TipoUbicacion;
  /** Todas las coincidencias, la mejor primero. El conductor elige de acá cuando
   *  hay ambigüedad. */
  candidatos: SugerenciaDireccion[];
  /** La única que la aplicación se permite usar SIN preguntar. null cuando hay
   *  que preguntar, y ese null es la mitad del valor de esta función. */
  elegida: SugerenciaDireccion | null;
  /** Mostrable tal cual, o null si no hay nada que advertir. */
  advertencia: string | null;
};

/** Busca una dirección ya escrita y dice qué se encontró, SIN elegir por su
 *  cuenta cuando hay dudas.
 *
 *  Es la función que reemplaza al viejo "toma el primer resultado y seguí". La
 *  diferencia importa en un caso concreto y medido: "Los Aromos 120" existe en
 *  Arica y en el valle de Azapa, a nueve kilómetros. Tomando el primero, el
 *  conductor sale con el paquete hacia el lugar equivocado y no se entera hasta
 *  llegar.
 *
 *  Los dos proveedores se consultan SIEMPRE, no en cascada: se necesitan las dos
 *  listas para poder detectar que dos lugares distintos responden al mismo
 *  texto. Mapbox va primero porque tiene los números de casa (ver la cabecera). */
export async function ubicarDireccion(direccion: string): Promise<ResultadoUbicacion> {
  const r = await ubicarConMapboxYOsm(direccion);
  // Google, último recurso (spec 016, US3; ver ./google.ts): solo si los otros
  // no dieron la puerta exacta. Ante dos lugares posibles sigue eligiendo el
  // conductor (principio IV), y un Plus Code no se le pregunta a nadie.
  if (r.tipo === "exacta" || r.tipo === "ambigua" || r.elegida?.fuente === "plus_code") return r;
  const [puerta] = await conGoogle(normalizarConsulta(direccion));
  if (!puerta) return r;
  // Solo si mejora: una cuadra de Google no reemplaza una cuadra de Mapbox.
  if (r.tipo === "aproximada" && puerta.confianza !== "exacta") return r;
  const exacta = puerta.confianza === "exacta";
  return {
    tipo: exacta ? "exacta" : "aproximada",
    candidatos: [puerta, ...r.candidatos],
    elegida: puerta,
    advertencia: exacta
      ? null
      : "La ubicación es aproximada (Google): llegas a la cuadra, no a la puerta. Confirma el número al llegar.",
  };
}

async function ubicarConMapboxYOsm(direccion: string): Promise<ResultadoUbicacion> {
  // Un Plus Code no tiene ambigüedad que resolver: ES la ubicación. Se contesta
  // sin consultar a nadie, y por eso va antes que todo lo demás.
  const codigo = comoPlusCode(direccion);
  if (codigo) {
    const alaPuerta = codigo.sugerencia.confianza === "exacta";
    return {
      tipo: alaPuerta ? "exacta" : "aproximada",
      candidatos: [codigo.sugerencia],
      elegida: codigo.sugerencia,
      // Un código de pocos dígitos cubre media cuadra o el barrio entero. Se usa
      // igual —es lo que hay— pero con el tamaño a la vista, porque es la
      // diferencia entre llegar a la puerta y llegar a la esquina.
      advertencia: alaPuerta
        ? null
        : `Ese Plus Code cubre unos ${Math.round(codigo.precisionMetros)} m: apunta a la zona, no a la puerta.`,
    };
  }

  const q = normalizarConsulta(direccion);
  if (!q) {
    return { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "La dirección está vacía." };
  }

  // En paralelo: son proveedores distintos y ninguno depende del otro. El
  // espaciado que pide OpenStreetMap lo garantiza su propia fila de turnos (ver
  // la cabecera), no una espera acá.
  const [deMapbox, deOsm] = await Promise.all([conMapbox(q), conNominatim(q)]);
  const primeraVuelta = combinarSugerencias(deMapbox, deOsm);

  // El número que quedó colgando de un nombre de calle a medias ("Linderos
  // 3536"). Va acá y no adentro de cada proveedor porque necesita las DOS
  // listas: OSM es el que tiene los nombres de calle correctos y Mapbox el que
  // tiene los números de casa.
  const completadas = await completarNumeroEnCalles(q, primeraVuelta);
  const candidatos = aplicarPuertas(primeraVuelta, completadas);

  if (candidatos.length === 0) {
    return {
      tipo: "no_encontrada",
      candidatos: [],
      elegida: null,
      advertencia:
        "No encontramos esa dirección en el mapa. Revísala o marca el punto a mano.",
    };
  }

  // Ese número existe en más de una calle que se llama como lo escrito: el
  // "Linderos 3536" que está en Linderos Poniente Y en Linderos Oriente. Acá la
  // aplicación no elige, aunque las dos coincidencias sean exactas y estén
  // lejísimo una de otra — son dos avenidas distintas y el único que sabe cuál
  // es el conductor. Si las puertas caen juntas, es UNA calle con dos nombres
  // ("Alejandro Azolas" y "Avenida Alejandro Azola"): no hay nada que elegir.
  if (separados(completadas.puertas)) {
    return {
      tipo: "ambigua",
      candidatos,
      elegida: null,
      advertencia:
        "Ese número existe en más de una calle que se llama así. Elige en cuál es.",
    };
  }

  // Ambigüedad de verdad: dos candidatos con el MISMO texto de dirección pero en
  // lugares separados. Dos textos distintos no son ambiguos — son dos opciones
  // entre las que el conductor ya puede distinguir leyendo.
  // Dos tramos de la MISMA calle sin número no son ambiguos: una avenida larga
  // viene en varios tramos de OSM. Eso lo resuelve "solo la calle", más abajo.
  const mejor = candidatos[0];
  const gemelos = mejor.soloCalle
    ? []
    : candidatos.filter((c) => !c.soloCalle && normalizar(c.direccion) === normalizar(mejor.direccion));
  const lejano = gemelos.find((c) => distanciaMetros(c, mejor) > METROS_AMBIGUEDAD);

  if (lejano) {
    return {
      tipo: "ambigua",
      candidatos,
      // A propósito null: la aplicación NO elige entre dos lugares distintos con
      // el mismo nombre.
      elegida: null,
      advertencia: `"${mejor.direccion}" aparece en más de un lugar. Elige cuál es.`,
    };
  }

  // Solo la CALLE: no hay número que valga y no hay nada que interpolar. Sigue
  // sin elegirse sola, salvo que la calle sea tan corta que el número no cambie
  // nada (ver METROS_CALLE_CORTA).
  if (mejor.soloCalle) {
    const { calle, ordenados } = callesEscritasPrimero(q, candidatos);
    const largo = calle ? await largoDeCalle(calle.direccion) : null;
    if (calle && largo !== null && largo <= METROS_CALLE_CORTA) {
      return {
        tipo: "aproximada",
        candidatos: ordenados,
        elegida: calle,
        advertencia: `El mapa no tiene ese número, pero ${calle.direccion} es corta (unos ${Math.max(10, Math.round(largo / 10) * 10)} m): la parada queda en la calle. Busca el número al llegar.`,
      };
    }
    return {
      tipo: "solo_calle",
      candidatos: ordenados,
      elegida: null,
      advertencia:
        "Encontramos la calle pero no el número: la parada queda a mitad de cuadra. Revisa el número o marca el punto.",
    };
  }

  // La puerta está INTERPOLADA: calle correcta, número dentro de su cuadra,
  // pero el proveedor no tiene esa puerta. Entra a la ruta CON la advertencia a
  // la vista, y esto es una decisión medida y no una comodidad: Mapbox contesta
  // "plausible" en 10 de cada 23 direcciones de Arica. Dejarlas todas fuera es
  // lo que estuvo pasando —el conductor confirmaba a mano ruta por ruta— y nadie
  // confirma media ruta: se sale igual, o no se sale. Llegar a la cuadra
  // correcta con el cartel puesto es mejor que no llegar.
  if (mejor.confianza !== "exacta") {
    return {
      tipo: "aproximada",
      candidatos,
      elegida: mejor,
      advertencia:
        "La ubicación es aproximada: llegas a la cuadra, no a la puerta. Confirma el número al llegar.",
    };
  }

  return { tipo: "exacta", candidatos, elegida: mejor, advertencia: null };
}

/** Las calles sin número que SON la escrita van primero, la más parecida antes:
 *  Mapbox puede poner arriba "Santiago" cuando se escribió "Santiago Arata". */
function callesEscritasPrimero(
  consulta: string,
  candidatos: SugerenciaDireccion[],
): { calle: SugerenciaDireccion | null; ordenados: SugerenciaDireccion[] } {
  const escrita = calleDeLaConsulta(consulta);
  const calzan = candidatos
    .map((c, orden) => ({ c, orden, m: c.soloCalle ? coincidenciaCalle(escrita, c.direccion) : null }))
    .filter((x): x is { c: SugerenciaDireccion; orden: number; m: Coincidencia } => x.m !== null)
    .sort((a, b) => compararCoincidencias(a.m, b.m) || a.orden - b.orden)
    .map((x) => x.c);
  const ordenados = [...calzan, ...candidatos.filter((c) => !calzan.includes(c))];
  return { calle: calzan[0] ?? null, ordenados };
}

/** Solo las coordenadas de la mejor coincidencia, o null.
 *
 *  Para la dirección de la EMPRESA (punto de partida de la ruta), donde no hay a
 *  quién preguntar y una coordenada aproximada es mejor que ninguna.
 *
 *  Para un pedido que el conductor está mirando hay que usar ubicarDireccion(): esta
 *  se queda con la mejor coincidencia sin decir que había otra. */
export async function geocodificarDireccion(direccion: string): Promise<Coordenada | null> {
  const r = await ubicarDireccion(direccion);
  const punto = r.elegida ?? r.candidatos[0];
  return punto ? { lat: punto.lat, lng: punto.lng } : null;
}
