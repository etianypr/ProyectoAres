// Los contratos de las tools, escritos UNA vez en Zod. El SDK los publica como
// JSON Schema, así que esto es la única fuente de verdad: no hay un JSON a mano
// que se pueda desincronizar del código que valida.
//
// Los dos declaran `outputSchema` además del de entrada, y eso no es adorno: es
// lo que hace cumplir POR PROTOCOLO la regla de este servidor —toda respuesta de
// ubicación es lat/lng, nunca una dirección de texto—. Un texto de dirección se
// vuelve a geocodificar y se vuelve a equivocar; una coordenada, no.
import { z } from "zod";

const Coordenada = z.object({
  lat: z.number().min(-90).max(90).describe("Latitud en grados decimales."),
  lng: z.number().min(-180).max(180).describe("Longitud en grados decimales."),
});

const Recuadro = z.object({
  sur: z.number(),
  oeste: z.number(),
  norte: z.number(),
  este: z.number(),
});

// ---------------------------------------------------------------------------
// resolve_plus_code
// ---------------------------------------------------------------------------

export const entradaPlusCode = {
  codigo: z
    .string()
    .min(2)
    .describe(
      "Plus Code completo ('57HFGMCP+MX') o corto ('GMCP+MX'). Se acepta en " +
        "minúsculas y con la localidad al lado ('GMCP+MX, Arica'): esa localidad " +
        "se DESCARTA, no se geocodifica — esta tool no consulta la red. Para " +
        "situar un código corto usá 'referencia'.",
    ),
  referencia: Coordenada.optional().describe(
    "Solo se usa si el código es CORTO, que es ambiguo por diseño: se recupera " +
      "el código global más cercano a este punto. Por defecto, el centro de " +
      "Arica (-18.4783, -70.3126). Con una referencia en otra ciudad, el mismo " +
      "código corto cae en esa otra ciudad.",
  ),
};

export const salidaPlusCode = {
  lat: z.number().describe("Latitud del centro del recuadro."),
  lng: z.number().describe("Longitud del centro del recuadro."),
  codigo_completo: z
    .string()
    .describe("El código global. Es lo que conviene guardar: no depende de referencia."),
  era_corto: z.boolean().describe("Si hubo que recuperarlo contra la referencia."),
  precision_metros: z
    .number()
    .describe("Lado mayor del recuadro. 10 dígitos ≈ 14 m; 11 ≈ 3 m."),
  recuadro: Recuadro,
};

// ---------------------------------------------------------------------------
// encode_plus_code
// ---------------------------------------------------------------------------

export const entradaCodificar = {
  punto: Coordenada.describe("El lugar a codificar."),
  digitos: z
    .number()
    .int()
    .min(8)
    .max(12)
    .default(11)
    .describe(
      "Cuántos dígitos. Once (~3 m) apunta a la puerta y es lo que conviene " +
        "para anotar una casa; diez (~14 m) es el largo habitual y en un pasaje " +
        "de Arica puede caer en la casa de al lado; ocho cubre más de 5 km.",
    ),
};

export const salidaCodificar = {
  codigo: z.string().describe("El Plus Code global. Se puede dictar por teléfono."),
  lat: z
    .number()
    .describe("Centro del recuadro del código. NO es exactamente el punto que entró."),
  lng: z.number(),
  precision_metros: z.number().describe("Lado mayor del recuadro."),
};

// ---------------------------------------------------------------------------
// get_route_ch
// ---------------------------------------------------------------------------

export const entradaRuta = {
  puntos: z
    .array(Coordenada)
    .min(2)
    .max(70)
    .describe(
      "Origen, paradas del medio y destino, en ese orden salvo que " +
        "optimizar_orden sea true. Máximo 70, medido contra la API (71 da 400). " +
        "SOLO coordenadas: esta tool no geocodifica texto. Para convertir una " +
        "dirección en coordenadas, primero resolve_plus_code o el " +
        "geocodificador de la app.",
    ),
  perfil: z
    .enum(["driving-car", "driving-hgv", "cycling-regular", "foot-walking"])
    .default("driving-car"),
  optimizar_orden: z
    .boolean()
    .default(false)
    .describe(
      "Deja que OpenRouteService reordene las paradas del medio. Por defecto " +
        "NO: en este proyecto el orden lo decide ordenarParadas(), que además " +
        "pondera los bloques horarios que el receptor pidió por WhatsApp.",
    ),
  instrucciones: z.boolean().default(false).describe("Maniobras paso a paso, en castellano."),
  incluir_geometria: z
    .boolean()
    .default(false)
    .describe(
      "El trazado completo puede traer miles de puntos y no se lee: por eso " +
        "viene apagado. La cantidad de puntos se informa igual en " +
        "puntos_geometria. Encendelo solo si vas a dibujar el trazado.",
    ),
  evitar: z.array(z.enum(["autopistas", "peajes", "ferries"])).default([]),
};

export const salidaRuta = {
  distancia_metros: z.number().int().min(0),
  duracion_segundos: z.number().int().min(0),
  orden: z
    .array(z.number().int().min(0))
    .describe("Índices de 'puntos' en el orden recorrido."),
  puntos_geometria: z.number().int().min(0).describe("Cuántos puntos tiene el trazado."),
  geometria: z
    .array(z.array(z.number()).length(2))
    .optional()
    .describe(
      "Pares [lng, lat] — orden GeoJSON, el mismo que usa lib/rutas.ts. " +
        "Invertirlos no da error: pone la ruta en el mar. Solo viene si se pidió " +
        "incluir_geometria.",
    ),
  pasos: z
    .array(
      z.object({
        texto: z.string(),
        distancia_metros: z.number(),
        duracion_segundos: z.number(),
        punto: Coordenada,
      }),
    )
    .optional(),
  fuente: z.literal("openrouteservice"),
};
