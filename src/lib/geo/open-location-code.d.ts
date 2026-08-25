// La librería de Google no trae tipos y no hay @types publicados. Esto declara
// SOLO lo que usa plus-code.ts, y cada firma está verificada corriéndola contra
// la versión instalada (1.0.3) — no copiada de la documentación.
//
// Dos cosas que la firma no dice y hay que saber:
//
//   · decode() y recoverNearest() LANZAN UN STRING pelado
//     ("IllegalArgumentException: …"), no un Error. Un `catch (e)` que espere
//     e.message recibe undefined. Por eso plus-code.ts atrapa y devuelve null.
//   · isValid() acepta minúsculas; encode() y decode() también.
declare module "open-location-code" {
  /** El recuadro que representa un código. Un Plus Code no es un punto: es un
   *  área, y su tamaño depende de cuántos dígitos tenga. */
  export interface CodeArea {
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  }

  export class OpenLocationCode {
    /** ¿Es un código bien formado? Acepta completos y cortos, en cualquier caja. */
    isValid(code: string): boolean;
    /** Le faltan los primeros dígitos: no significa nada sin una referencia. */
    isShort(code: string): boolean;
    /** Se resuelve solo, en cualquier parte del mundo. */
    isFull(code: string): boolean;

    /** Coordenadas → código. `codeLength` por defecto 10 (~14 m); 11 da ~3 m. */
    encode(latitude: number, longitude: number, codeLength?: number): string;

    /** Código COMPLETO → recuadro. Lanza (un string) si el código es corto o inválido. */
    decode(code: string): CodeArea;

    /** Código corto → código completo más cercano a la referencia. */
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string;

    /** Código completo → la forma corta relativa a la referencia. */
    shorten(code: string, latitude: number, longitude: number): string;
  }
}
