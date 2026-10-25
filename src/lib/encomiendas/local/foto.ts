"use client";

// La foto del paquete se achica en el teléfono antes de guardarla (spec 003):
// lado mayor 1280 px, JPEG al 70 %, unos 150 KB. Nunca sale del teléfono.

const LADO_MAXIMO = 1280;
const CALIDAD = 0.7;

export async function comprimirFoto(archivo: Blob, ladoMaximo = LADO_MAXIMO): Promise<Blob> {
  // "from-image": la foto del celular viene girada en los metadatos.
  const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    const contexto = lienzo.getContext("2d");
    if (!contexto) throw new Error("Este teléfono no pudo procesar la foto.");
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob>((listo, falla) =>
      lienzo.toBlob(
        (blob) => (blob ? listo(blob) : falla(new Error("Este teléfono no pudo procesar la foto."))),
        "image/jpeg",
        CALIDAD,
      ),
    );
  } finally {
    imagen.close();
  }
}
