import "server-only";

// Una llamada a Claude con el lote de direcciones a corregir (spec 040; antes una conversación por
// dirección, spec 018). El teléfono arma el lote con los candidatos que ya devolvieron los
// buscadores (contrato.ts, cliente.ts); acá solo se le pasa a la IA y se devuelve lo que contestó.

import Anthropic, { RateLimitError } from "@anthropic-ai/sdk";
import type { ConfianzaIA, Lote, RespuestaLote, ResultadoEnLote } from "./contrato";

/** Sonnet 5: entiende las direcciones chilenas mal escritas ("PJE", "POB.", "VILLA … CASA 12") y
 *  elige bien entre candidatos. Se cambia con DIRECCION_MODELO (el dueño no autorizó cambiarlo en
 *  la spec 038). Ojo: en los modelos 5.5, `thinking: disabled` y la herramienta forzada dan 400. */
const MODELO = "claude-sonnet-5";

/** La respuesta de un lote de 15 cabe holgada (~100 tokens por dirección). */
const MAX_TOKENS = 4096;

export function direccionIADisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    maxRetries: 1,
    // Un lote contesta más que una ida de antes: 40 s por intento (la ruta da 90).
    timeout: 40_000,
  });
}

const HERRAMIENTA = "resultados";

/** Las instrucciones fijas: iguales en todos los lotes (van en la caché de prompt). Los ejemplos son
 *  casos de las pruebas (calles reales, números inventados; nunca una dirección de un pedido real) y
 *  pruebas/040-ia-lote.test.mjs revisa que sigan el contrato. Exportada solo para esa prueba. */
export const SISTEMA = [
  "Corriges direcciones de entrega de paquetes en Arica, Chile, que la app no pudo ubicar en la puerta. Para cada dirección eliges uno de los candidatos que encontraron los buscadores, o dices que ninguno sirve. Un conductor revisa cada propuesta antes de usarla: ante la duda, dilo con la confianza.",
  "",
  "# Lo que recibes",
  "Un mensaje que empieza con la ronda («Ronda 1.» o «Ronda 2.») y sigue con un JSON:",
  "- zona: cuántos pedidos ya ubicados hay en cada sector de Arica. Es por donde anda la ruta del día.",
  "- direcciones: cada una con id (d1, d2…), escrita (como venía en la guía de Starken), candidatos y calles_parecidas.",
  "- Cada candidato: id (d1c1, d1c2…), direccion, detalle, confianza (exacta = la puerta; aproximada = la cuadra; baja = el barrio), numero_coincide, solo_calle (el buscador no tiene el número: el punto es la calle entera, que puede medir kilómetros), fuente, punto y sector. En una calle con el mismo nombre en varios lugares trae además cruces (calles que cruzan ese lugar) y calza_con_la_guia (la referencia escrita nombra su población o una calle que lo cruza).",
  "- calles_parecidas: nombres reales del catálogo de calles de Arica parecidos a la calle escrita, con su largo en metros.",
  "",
  "# Cómo leer una dirección de Arica",
  "- Vienen con faltas de ortografía, abreviaturas (AV., PJE., PSJE., POB., VLL., N°, #), sin el tipo de vía, con datos de más (depto, block, casa, sector) o con el número pegado.",
  "- La calle de la casa suele ser la que va junto al número. Lo que viene antes (población, villa, loteo o sector) es referencia y no se junta con el número.",
  "- Pero si la escrita une dos calles («X CON Y 2480», «Y 2480 ESQUINA X»), el número puede ser de cualquiera de las dos: vale la que tiene entre los candidatos la puerta con ese número; si la tienen las dos, confianza baja, para que elija el conductor.",
  "- Un nombre mal escrito o a medias es el nombre oficial de calles_parecidas cuando todas sus palabras calzan (faltan a veces el tipo de vía, un grado o un apellido).",
  "- Nunca elijas un candidato de una calle distinta a las escritas, aunque tenga el mismo número.",
  "",
  "# Cómo elegir",
  "- Solo candidatos de esa misma dirección: su id empieza con el id de la dirección. Nunca inventes coordenadas.",
  "- Si el mismo nombre está en varios lugares: el que tiene calza_con_la_guia; si ninguno, el del sector donde están los demás pedidos (zona); si sigue la duda, confianza baja.",
  '- confianza "alta" solo si es la misma calle y el mismo número (o el mismo lugar con nombre); "media" si es la calle correcta pero no la puerta, o si elegiste entre lugares iguales por la referencia o la zona; "baja" si dudas.',
  "- Si ningún candidato sirve, candidato null. En la ronda 1, si un texto corregido lo encontraría (el nombre oficial con el número, o la calle con su población), escríbelo en buscar. En la ronda 2 ya se buscó lo que pediste: buscar va null.",
  "",
  "# Respuesta",
  `Llama una sola vez a ${HERRAMIENTA}, con un elemento por cada dirección recibida y en el mismo orden. En español; el motivo, en una frase.`,
  "",
  "# Ejemplos (calles reales, números inventados; cada mensaje con su respuesta)",
  "",
  "Ejemplo 1 · nombre a medias: en la ronda 1 se pide buscar la puerta con el nombre oficial",
  "Ronda 1. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Centro","pedidos":8}],"direcciones":[{"id":"d1","escrita":"HUMBERTO ARELLANO 906","candidatos":[{"id":"d1c1","direccion":"Avenida Diputado Humberto Arellano Figueroa","detalle":"Arica","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4780,-70.3020","sector":"Centro"}],"calles_parecidas":[{"nombre":"Avenida Diputado Humberto Arellano Figueroa","largo_m":1033}]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":null,"confianza":"baja","direccion_corregida":"Avenida Diputado Humberto Arellano Figueroa 906","buscar":"Avenida Diputado Humberto Arellano Figueroa 906","motivo":"Faltaban el tipo de vía y el grado; solo está la calle entera, de 1 km: busco la puerta con el nombre oficial."}]',
  "Ronda 2. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Centro","pedidos":8}],"direcciones":[{"id":"d1","escrita":"HUMBERTO ARELLANO 906","candidatos":[{"id":"d1c1","direccion":"Avenida Diputado Humberto Arellano Figueroa 906","detalle":"Arica","confianza":"exacta","numero_coincide":true,"solo_calle":false,"fuente":"google","punto":"-18.4786,-70.3011","sector":"Centro"},{"id":"d1c2","direccion":"Avenida Diputado Humberto Arellano Figueroa","detalle":"Arica","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4780,-70.3020","sector":"Centro"}],"calles_parecidas":[{"nombre":"Avenida Diputado Humberto Arellano Figueroa","largo_m":1033}]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":"d1c1","confianza":"alta","direccion_corregida":"Avenida Diputado Humberto Arellano Figueroa 906","buscar":null,"motivo":"Es la calle escrita con su nombre oficial y la puerta tiene el mismo número."}]',
  "",
  "Ejemplo 2 · la población va antes de la calle, y la calle está en varios lugares",
  "Ronda 1. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Norte","pedidos":12},{"sector":"Sur","pedidos":3}],"direcciones":[{"id":"d1","escrita":"LINDEROS PROVIDENCI CALLE 2 977","candidatos":[{"id":"d1c1","direccion":"Calle 2 977","detalle":"Pob. Flor del Inca · Norte","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4486,-70.2830","sector":"Norte","cruces":["Calle Tres","Isla Alacrán","Isla Molino"],"calza_con_la_guia":true},{"id":"d1c2","direccion":"Calle 2 977","detalle":"Conj. Hab. Lomas de Miramar I · Sur","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4928,-70.3047","sector":"Sur","cruces":["Calle 1","Calle 3","Chiguayante"],"calza_con_la_guia":false},{"id":"d1c3","direccion":"Calle 2 977","detalle":"Pob. Esperanza Solidaria I · Norte","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4316,-70.2888","sector":"Norte","cruces":["Avenida Linderos Oriente","Avenida Linderos Poniente","Pasaje 3"],"calza_con_la_guia":false}],"calles_parecidas":[]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":"d1c1","confianza":"media","direccion_corregida":"Calle 2 977, Pob. Flor del Inca","buscar":null,"motivo":"«Linderos Providenci» es referencia: la casa está en Calle 2, en el lugar que calza con la guía; es la calle, no la puerta."}]',
  "",
  "Ejemplo 3 · el mismo número en otra calle no sirve",
  "Ronda 1. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Centro","pedidos":8}],"direcciones":[{"id":"d1","escrita":"AV DIEGO PORTALES 902","candidatos":[{"id":"d1c1","direccion":"Avenida Senador Humberto Palza Corvacho 902","detalle":"Arica","confianza":"exacta","numero_coincide":true,"solo_calle":false,"fuente":"osm","punto":"-18.4900,-70.2950","sector":"Centro"},{"id":"d1c2","direccion":"Avenida Diego Portales","detalle":"Arica","confianza":"aproximada","numero_coincide":null,"solo_calle":true,"fuente":"osm","punto":"-18.4700,-70.2850","sector":"San José"}],"calles_parecidas":[{"nombre":"Avenida Diego Portales","largo_m":1804},{"nombre":"Diego Portales","largo_m":1517}]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":null,"confianza":"baja","direccion_corregida":"Avenida Diego Portales 902","buscar":"Avenida Diego Portales 902","motivo":"d1c1 es otra calle aunque tenga el número; de Diego Portales solo está la calle entera: busco la puerta."}]',
  "",
  "Ejemplo 4 · el mismo texto en dos lugares: decide la zona, sin dar alta",
  "Ronda 1. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Norte","pedidos":12},{"sector":"Centro","pedidos":5}],"direcciones":[{"id":"d1","escrita":"LOS AROMOS 120","candidatos":[{"id":"d1c1","direccion":"Los Aromos 120","detalle":"Arica","confianza":"exacta","numero_coincide":true,"solo_calle":false,"fuente":"google","punto":"-18.4500,-70.2950","sector":"Norte"},{"id":"d1c2","direccion":"Los Aromos 120","detalle":"Valle de Azapa","confianza":"exacta","numero_coincide":true,"solo_calle":false,"fuente":"google","punto":"-18.5180,-70.1810","sector":"Azapa"}],"calles_parecidas":[{"nombre":"Los Aromos","largo_m":307}]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":"d1c1","confianza":"media","direccion_corregida":"Los Aromos 120","buscar":null,"motivo":"Hay dos «Los Aromos 120»; elijo el del sector Norte, donde están los demás pedidos del día."}]',
  "",
  "Ejemplo 5 · solo el barrio: ninguno sirve y no hay qué buscar",
  "Ronda 1. Ciudad: Arica, Chile.",
  '{"zona":[{"sector":"Norte","pedidos":12}],"direcciones":[{"id":"d1","escrita":"POB LA CHIMBA","candidatos":[{"id":"d1c1","direccion":"La Chimba","detalle":"Arica","confianza":"baja","numero_coincide":null,"solo_calle":false,"fuente":"osm","punto":"-18.4430,-70.2930","sector":"Norte"}],"calles_parecidas":[]}]}',
  "Respuesta:",
  '[{"direccion":"d1","candidato":null,"confianza":"baja","direccion_corregida":"Población La Chimba","buscar":null,"motivo":"Solo trae la población: faltan la calle y el número; lo resuelve el conductor."}]',
].join("\n");

const HERRAMIENTAS: Anthropic.Messages.Tool[] = [
  {
    name: HERRAMIENTA,
    description: "Entrega lo que se decidió para cada dirección del lote. Se llama una sola vez, con todas.",
    input_schema: {
      type: "object",
      properties: {
        resultados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              direccion: { type: "string", description: "El id de la dirección (d1, d2…)." },
              candidato: { type: ["string", "null"], description: "El id del candidato elegido, o null si ninguno sirve." },
              confianza: { type: "string", enum: ["alta", "media", "baja"] },
              direccion_corregida: { type: "string", description: "La dirección corregida, como debería escribirse." },
              buscar: {
                type: ["string", "null"],
                description: "Solo en la ronda 1 y sin candidato: un texto para volver a buscar. Si no, null.",
              },
              motivo: { type: "string", description: "En una frase: qué estaba mal y qué se corrigió." },
            },
            required: ["direccion", "candidato", "confianza", "direccion_corregida", "buscar", "motivo"],
            additionalProperties: false,
          },
        },
      },
      required: ["resultados"],
      additionalProperties: false,
    },
  },
];

/** Anthropic limitó la tasa (429; el SDK ya reintentó una vez): la ruta lo contesta como 429 y
 *  no como 503, para que el teléfono no lo tome por falta de conexión (spec 038). */
export function esLimiteDeTasa(e: unknown): boolean {
  return e instanceof RateLimitError;
}

const CONFIANZAS: ConfianzaIA[] = ["alta", "media", "baja"];
const corto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** Lo que vino en la herramienta, con la forma del contrato; lo demás se bota. El teléfono revisa
 *  después que cada candidato sea de su dirección. Pura. */
export function resultadosDe(input: unknown): ResultadoEnLote[] {
  const lista = (input as { resultados?: unknown } | null)?.resultados;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((r): ResultadoEnLote[] => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    const direccion = corto(x.direccion, 8);
    if (!direccion) return [];
    return [
      {
        direccion,
        candidato: oNulo(x.candidato),
        confianza: CONFIANZAS.includes(x.confianza as ConfianzaIA) ? (x.confianza as ConfianzaIA) : "baja",
        direccion_corregida: corto(x.direccion_corregida),
        buscar: oNulo(x.buscar),
        motivo: corto(x.motivo) || "Sin explicación.",
      },
    ];
  });
}

/** Manda el lote y devuelve lo que decidió la IA. Deja pasar los errores de la API para que la
 *  ruta los conteste (429 o 503).
 *
 *  Caché de prompt (spec 038): herramientas + SISTEMA son iguales en todos los lotes, así que el
 *  bloque de SISTEMA lleva su `cache_control`. Bajo el mínimo del modelo no se cachea y no falla:
 *  lo dice `uso`. */
export async function pasoLoteIA(lote: Lote): Promise<RespuestaLote> {
  const modelo = process.env.DIRECCION_MODELO || MODELO;
  const r = await cliente().messages.create({
    model: modelo,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
    tools: HERRAMIENTAS,
    // auto y no forzada: en los modelos 5.5 la herramienta forzada da 400. SISTEMA pide usarla.
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    // Elegir entre candidatos no necesita pensar largo.
    thinking: { type: "disabled" },
    // Haiku no acepta `effort` (ver lectura/servidor.ts).
    ...(/haiku/.test(modelo) ? {} : { output_config: { effort: "low" as const } }),
    messages: [
      {
        role: "user",
        content: `Ronda ${lote.ronda}. Ciudad: Arica, Chile.\n${JSON.stringify({ zona: lote.zona, direcciones: lote.direcciones })}`,
      },
    ],
  });
  const uso = { cacheLeidos: r.usage?.cache_read_input_tokens ?? 0, cacheCreados: r.usage?.cache_creation_input_tokens ?? 0 };
  const llamada = r.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA);
  return { resultados: llamada && llamada.type === "tool_use" ? resultadosDe(llamada.input) : [], uso };
}
