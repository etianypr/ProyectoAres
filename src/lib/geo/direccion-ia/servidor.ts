import "server-only";

// Una ida de la conversación con Claude para corregir una dirección (spec 018).
// Las herramientas las ejecuta el teléfono (ver contrato.ts y cliente.ts): acá
// solo se define qué puede pedir la IA y se le pasa la conversación.

import Anthropic from "@anthropic-ai/sdk";
import { HERRAMIENTA, type MensajeIA, type RespuestaPaso } from "./contrato";

/** Sonnet 5: entiende las direcciones chilenas mal escritas ("PJE", "POB.",
 *  "VILLA … CASA 12") y elige bien entre candidatos. ~US$0,02 por dirección
 *  (unas tres idas y vueltas); con 3–5 direcciones malas al día son US$2–3 al
 *  mes. Se cambia con DIRECCION_MODELO (por ejemplo claude-haiku-4-5, ~3 veces
 *  más barato). */
const MODELO = "claude-sonnet-5";

export function direccionIADisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    maxRetries: 1,
    timeout: 25_000,
  });
}

const SISTEMA = [
  "Corriges direcciones de entrega de paquetes en Arica, Chile, que el buscador de la app no pudo ubicar en el mapa.",
  "Vienen de guías de despacho y etiquetas de Starken: con faltas de ortografía, abreviaturas (AV., PJE., PSJE., POB., VLL., N°, #),",
  "sin el tipo de vía (avenida, pasaje), con datos de más (depto, block, casa, sector, referencias) o con el número pegado.",
  `Usa ${HERRAMIENTA.calles} para encontrar el nombre real de la calle y ${HERRAMIENTA.buscar} para buscar la dirección limpia`,
  "(calle y número; si es una población o villa con pasaje y casa, prueba también con la población).",
  `Termina SIEMPRE llamando a ${HERRAMIENTA.proponer} una sola vez. Elige un candidato por su id, nunca inventes coordenadas.`,
  'confianza "alta" solo si el candidato es la misma calle y el mismo número (o el mismo lugar) que la dirección escrita;',
  '"media" si es la calle correcta pero no la puerta; "baja" si dudas. Si ningún candidato sirve, candidato null.',
  "Como mucho tres búsquedas. Responde en español y en pocas palabras.",
].join(" ");

const HERRAMIENTAS: Anthropic.Messages.Tool[] = [
  {
    name: HERRAMIENTA.buscar,
    description:
      "Busca una dirección en Arica en Mapbox, OpenStreetMap y Google a la vez. Devuelve candidatos con id, dirección, confianza (exacta = la puerta; aproximada = la cuadra; baja = el barrio), si el número coincide y solo_calle (true = el buscador no tiene el número: el punto es la calle entera, que puede medir kilómetros).",
    input_schema: {
      type: "object",
      properties: { consulta: { type: "string", description: 'Dirección limpia, por ejemplo "Avenida Santa María 2150".' } },
      required: ["consulta"],
      additionalProperties: false,
    },
  },
  {
    name: HERRAMIENTA.calles,
    description:
      "Busca en el catálogo de calles de Arica (OpenStreetMap) las que se parecen a un nombre mal escrito. Devuelve los nombres reales y su largo en metros.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string", description: "El nombre de la calle tal como vino, sin número." } },
      required: ["nombre"],
      additionalProperties: false,
    },
  },
  {
    name: HERRAMIENTA.proponer,
    description: "Entrega el resultado. Se llama una sola vez, al final.",
    input_schema: {
      type: "object",
      properties: {
        candidato: { type: ["string", "null"], description: "El id del candidato elegido, o null si ninguno sirve." },
        direccion: { type: "string", description: "La dirección corregida, como debería escribirse." },
        confianza: { type: "string", enum: ["alta", "media", "baja"] },
        motivo: { type: "string", description: "En una frase: qué estaba mal y qué se corrigió." },
      },
      required: ["candidato", "direccion", "confianza", "motivo"],
      additionalProperties: false,
    },
  },
];

/** Manda la conversación y devuelve la respuesta de la IA. Deja pasar los
 *  errores de la API para que la ruta los conteste como 503. */
export async function pasoDireccionIA(mensajes: MensajeIA[]): Promise<RespuestaPaso> {
  const modelo = process.env.DIRECCION_MODELO || MODELO;
  const r = await cliente().messages.create({
    model: modelo,
    max_tokens: 1024,
    system: SISTEMA,
    tools: HERRAMIENTAS,
    // Elegir entre candidatos no necesita pensar largo.
    thinking: { type: "disabled" },
    // Haiku no acepta `effort` (ver lectura/servidor.ts).
    ...(/haiku/.test(modelo) ? {} : { output_config: { effort: "low" as const } }),
    messages: mensajes as Anthropic.Messages.MessageParam[],
  });
  const contenido: RespuestaPaso["contenido"] = [];
  for (const b of r.content) {
    if (b.type === "text") contenido.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") {
      contenido.push({ type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
    }
  }
  return { contenido, fin: r.stop_reason };
}
