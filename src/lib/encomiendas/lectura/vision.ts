import "server-only";

// El texto de una foto con Google Cloud Vision: el mismo lector de Google Lens,
// dentro de la app (spec 005). Lens "no falla" en terreno (2026-10-25) y copiar
// y pegar desde Lens cuesta 12–20 s por etiqueta y arriesga pegar la anterior;
// esto da el mismo texto sin salir de la app. ~US$1,50 cada 1.000 fotos (las
// primeras 1.000 del mes, gratis).
//
// La clave solo vive en el servidor: GOOGLE_VISION_KEY, o la misma de Google
// Geocoding (GOOGLE_MAPS_KEY) con la "Cloud Vision API" activada. La foto pasa
// en tránsito: no se guarda ni se registra (docs/PRIVACIDAD.md).

const VISION = "https://vision.googleapis.com/v1/images:annotate";

function clave(): string | undefined {
  return process.env.GOOGLE_VISION_KEY || process.env.GOOGLE_MAPS_KEY;
}

export function visionDisponible(): boolean {
  return Boolean(clave());
}

/** Google contestó con error (clave, API apagada, cuota): la ruta responde 502 y
 *  el teléfono sigue con su propio lector. */
export class VisionNoRespondio extends Error {}

/** La clave no tiene la Cloud Vision API (apagada, restringida o sin cobro): no
 *  es un corte, así que la ruta responde como sin clave (503) y el teléfono deja
 *  de subir cada foto para nada (auditoría del día real, 2026-11-10). */
export class VisionApagada extends VisionNoRespondio {}

/** El texto de la foto, en orden de lectura; "" si no hay texto. */
export async function textoConVision(foto: Uint8Array): Promise<string> {
  const k = clave();
  if (!k) throw new VisionNoRespondio("Cloud Vision no está configurado.");
  let res: Response;
  try {
    res = await fetch(`${VISION}?key=${encodeURIComponent(k)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: Buffer.from(foto).toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["es"] },
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new VisionNoRespondio("Cloud Vision no respondió.");
  }
  const datos = (await res.json().catch(() => null)) as {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[];
  } | null;
  const r = datos?.responses?.[0];
  if (res.status === 401 || res.status === 403) throw new VisionApagada("Cloud Vision está apagada en la clave.");
  if (!res.ok || !r || r.error) throw new VisionNoRespondio("Cloud Vision no pudo leer la foto.");
  return r.fullTextAnnotation?.text ?? "";
}
