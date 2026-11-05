# Pruebas de la lectura

Las reglas generales están en `pruebas/README.md`. Aquí va solo lo de este tema.

## Qué cubre cada una
| Archivo | Cubre |
|---|---|
| `lectura.test.mjs` | `leerCodigoEtiqueta` (26 dígitos, EXPRES, OF corta con ceros, OF a mano), `leerGuia` / `limpiarDestino` (fixture `guia.txt`, repetidas, total, «0F»), `leerEtiqueta` (los tres fixtures, POR PAGAR sin monto, valor en el renglón siguiente, «0.F.», sin RUT, remitente ni correo), `etiquetaCompleta` y `faltanEnLaPrimera` |
| `lectura-servidor.test.mjs` | `lectura/servidor.ts` contra un doble del `fetch`: modelo, foto, salida estructurada, sin pensamiento, `effort` (nunca con Haiku), workspace, varias fotos en una consulta, rechazo = ilegible |
| `vision.test.mjs` | `lectura/vision.ts`: sin clave, la clave de Vision o la de Maps, y el error de Google |
| `descripcion-etiqueta.test.mjs` | `conDescripcion` (la 021 lo borra; se pregunta antes) |
| `carga.test.mjs` | almacén real (`fake-indexeddb`): `crearDesdeGuia` sin duplicar, «PARADA n de N», bultos sin duplicar, OF fuera del día, dirección distinta, no pisar lo escrito, cobros, `sinEtiquetaEscaneada`, `cambiarDireccion` |
| `listo-para-terreno.test.mjs` | spec 017: E4 (la OF confirmada corrige), `avanceCarga`, E11 (mejor lectura de una OF repetida) |
| `paquete.test.mjs` | `ofValida` / `ofDistinta` / `formatoOf`, la referencia, `buscarPorOf` y las fotos del paquete |
| `privacidad.test.mjs` · `arquitectura.test.mjs` | las rutas de API sin `console.*`; `servidor.ts` y `vision.ts` con `server-only` (A5); cada host en `docs/PRIVACIDAD.md` (A10) |

## Patrones (copiar de los archivos de arriba)
- **Puro:** `const { leerEtiqueta } = await import("@/lib/encomiendas/lectura/etiqueta");`. Se
  importa el `src/` real con el alias; el resolvedor está en `pruebas/registrar.mjs`.
- **Almacén:** `import "fake-indexeddb/auto";` en la primera línea. En `beforeEach` se vacían todos
  los stores (`idb.escribir([store], ({ vaciar }) => vaciar(store))`). El día se arma con
  `crearDesdeGuia` + `guardarRuta` (ver `diaDesdeGuia` en `carga.test.mjs`).
- **Proveedor:** se reemplaza `globalThis.fetch` dentro de la prueba, se guardan los pedidos que
  salen para revisarlos y se devuelve el original en `test.after`. Nunca se sustituye el módulo.
  Pon la clave falsa en `process.env` en `beforeEach`.
- **Una prueba de borrador** sirve para confirmar un comportamiento sin tocar el repo. Va en el
  scratchpad y se corre desde la raíz con `node --import ./pruebas/registrar.mjs --test <archivo>`.
  El alias `@/` funciona igual, pero `fake-indexeddb` hay que importarlo con su ruta absoluta
  (`file:///C:/dev/proyect-ares/node_modules/fake-indexeddb/auto/index.mjs`).

## Fixtures (`pruebas/fixtures/lectura/`)
Hoy están `guia.txt`, `etiqueta-por-pagar.txt` (EXPRES, con remitente, RUT y correo **para
comprobar que no se extraen**), `etiqueta-contado.txt` y `etiqueta-lion.txt`. La 021 los nombra
`etiqueta-<formato>.txt`.

Al agregar uno:
- Copia el texto **tal como lo lee el lector**: los renglones partidos, «0.F.» en vez de «O.F.» y el
  valor en el renglón siguiente. Un texto prolijo pasa la prueba y falla en terreno.
- Usa nombres inventados (`JUAN PEREZ SOTO`), celulares inventados (`9 1234 5678`, `+56987654321`),
  OF de la serie `2000000nn` y calles reales de Arica con números inventados (`PASAJE LOS PINOS 56`).
- El remitente, el RUT y el correo van inventados (`TIENDA DE PRUEBA SPA`, `11.111.111-1`,
  `tienda@ejemplo.cl`).
- Si el fixture sale de una etiqueta real, revisa línea por línea que no quede ningún dato real
  antes de agregarlo. Si hay duda, no entra: se pregunta al dueño.

Ejemplo, con un renglón por línea como lo da ML Kit:
```text
starken
EXPRES
0.F. 200000007
DESTINATARIO:
ANA ROJAS
Tel.
9 1234 5678
DIRECCIÓN: CALLE MARACAIBO 1472, ARICA
POR PAGAR
Total Monto 0.F. $
7.990
Bulto N° 001/001
```
