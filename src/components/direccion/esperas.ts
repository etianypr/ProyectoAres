// Las esperas del campo de dirección (direccion-input.tsx): cuándo consultar a
// cada buscador y cuándo cerrar la lista.

// Lo que se espera desde la última tecla antes de consultar. Escribiendo una
// dirección entera, esto son unas pocas consultas en vez de una por letra.
export const MS_ESPERA_TECLEO = 300;

// A OpenStreetMap se le pregunta con más pausa: no completa palabras a medias
// (escribir "chacab" no le devuelve nada), así que solo aporta cuando el conductor
// terminó de escribir, y su política de uso pide no consultarlo seguido.
export const MS_ESPERA_OSM = 800;

// Y el número colgado se busca al final, cuando el conductor ya paró de escribir:
// cada intento son una o dos consultas más (ver completarNumeroEnCalles), y
// tecleando "3536" dígito a dígito serían cuatro intentos por un solo número.
// Con esta espera, escribir seguido no cuesta nada.
export const MS_ESPERA_NUMERO = 500;

export const MIN_CARACTERES = 3;

// El clic en una sugerencia llega DESPUÉS del blur del campo. Si la lista se
// cerrara en el blur, el toque caería en el vacío y no elegiría nada.
export const MS_CIERRE_TRAS_BLUR = 150;
