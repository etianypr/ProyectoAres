// Sugerencias mientras el conductor escribe una dirección (spec 019: antes las
// daba Mapbox, que completaba palabras a medias). Un Plus Code se resuelve ahí
// mismo, sin red; una calle con número se le pregunta a Google, que es el que
// tiene las puertas de Arica. Las calles sin número y los lugares los trae OSM
// por su lado (sugerirEnOsm), con más pausa.
//
// Nunca lanza: quedarse sin sugerencias (sin señal, texto muy corto) tiene que
// dejar el campo funcionando como un campo de texto normal. "senal" corta la
// consulta cuando el conductor siguió escribiendo; el llamador descarta la
// respuesta si su propia señal quedó abortada.

import { comoPlusCode } from "./codigo";
import { normalizarConsulta } from "./consulta";
import { conGoogle } from "./google";
import { MIN_CARACTERES, type SugerenciaDireccion } from "./tipos";

export async function sugerirDirecciones(texto: string, senal?: AbortSignal): Promise<SugerenciaDireccion[]> {
  const codigo = comoPlusCode(texto);
  if (codigo) return [codigo.sugerencia];

  // El largo mínimo se mide sobre lo ESCRITO y no sobre lo normalizado: si no,
  // escribir "Av." (que normaliza a "avenida") disparaba una consulta por una
  // abreviatura sola.
  if (texto.trim().length < MIN_CARACTERES) return [];
  const q = normalizarConsulta(texto);
  return q ? conGoogle(q, senal) : [];
}
