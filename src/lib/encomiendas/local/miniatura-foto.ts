// La foto del paquete en miniatura para la burbuja (spec 046): un JPEG de 480 × 152 px (el
// doble de lo que mide en la burbuja del V2430), recortado al centro, en base64. La burbuja es
// una ventana de la APK en el mismo teléfono: la foto no sale de él. Se hace una vez por foto y
// se recuerda mientras la app está abierta; como la etiqueta trae nombre y dirección, se olvida
// con los datos del día (olvidar-memorias.ts).

import { leerFoto } from "./almacen";

const ANCHO = 480;
const ALTO = 152;
const CALIDAD = 0.72;

const hechas = new Map<string, string>();

async function achicar(blob: Blob): Promise<string | null> {
  const imagen = await createImageBitmap(blob);
  try {
    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    // Recortada al centro, como la muestra la burbuja (CENTER_CROP): no se deforma.
    const escala = Math.max(ANCHO / imagen.width, ALTO / imagen.height);
    const w = ANCHO / escala;
    const h = ALTO / escala;
    ctx.drawImage(imagen, (imagen.width - w) / 2, (imagen.height - h) / 2, w, h, 0, 0, ANCHO, ALTO);
    return lienzo.toDataURL("image/jpeg", CALIDAD).split(",")[1] ?? null;
  } finally {
    imagen.close();
  }
}

/** La miniatura ya hecha de esa foto, o null si todavía no se hizo. */
export function miniaturaHecha(fotoId: string): string | null {
  return hechas.get(fotoId) ?? null;
}

/** Hace la miniatura de la foto guardada (una vez). null si no existe o no se pudo leer. */
export async function hacerMiniatura(fotoId: string): Promise<string | null> {
  const lista = hechas.get(fotoId);
  if (lista) return lista;
  const blob = await leerFoto(fotoId);
  const base64 = blob ? await achicar(blob) : null;
  if (base64) hechas.set(fotoId, base64);
  return base64;
}

export function olvidarMiniaturas(): void {
  hechas.clear();
}
