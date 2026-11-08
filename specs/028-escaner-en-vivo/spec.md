# Spec 028 · Escáner de etiquetas en vivo

**Creada**: 2026-11-07 · **Estado**: en curso · **Rama**: `028-escaner-en-vivo` (sale de la 021;
pasan juntas a `main`) · **Pedido del dueño**: "que no sean fotos sino un escáner especializado […]
porque no quiero que se envíen fotos a anthropic por temas legales de privacidad".

Monedas: **toques** y **privacidad**.
- La privacidad la resuelve la [021](../021-lector-etiquetas/spec.md): la etiqueta se lee en el
  teléfono, sin IA ni Cloud Vision. Esta spec cambia el **gesto**.
- En el paso 4 del flujo (cargar el auto), el conductor pasa por todas las etiquetas. Hoy son 3 o 4
  toques por paquete (escáner de Google → «Foto de la etiqueta» → disparar → ✓ → «Escanear otra»),
  ~100 paquetes al día. Con esto, ninguno salvo un ⚠.

Decidido con el dueño (2026-11-07):
- En vivo y continuo: la cámara queda abierta mientras se carga el auto. Cada etiqueta vibra y
  muestra su parada, y se pasa a la siguiente sin tocar.
- Solo la etiqueta. La guía sigue con la IA ("en la guía de despacho no salen datos personales").
- Dos pasos: primero la 021 (lector Starken, sin `android/`), después esta. El escáner le entrega
  al mismo lector el texto de cada cuadro.

## US1 (P1) · Cargar el auto sin tocar la pantalla

| Hoy | Debe |
|---|---|
| El escáner de Google se abre, lee un código y se cierra | La cámara de ARES queda abierta durante toda la carga |
| El nombre, el teléfono y el POR PAGAR piden una foto aparte | Del mismo cuadro salen el código (OF y bulto) y el texto, leídos con ML Kit en el teléfono |
| «Escanear otra» después de cada paquete | Al leer una etiqueta, vibra y muestra encima de la cámara «PARADA n de N», los bultos, el nombre y el pago; la etiqueta siguiente reemplaza a la anterior |
| El contador x/N se ve en el resultado | El contador x/N está siempre a la vista |

Maqueta aprobada (2026-11-07):

```text
┌────────────────────────────┐
│ ✕  Cargar el auto    37/53 │
│ ┌────────────────────────┐ │
│ │       ( cámara )       │ │
│ └────────────────────────┘ │
│  PARADA 12 de 53           │
│  Bultos 1 de 2             │
│  J. Pérez · +569 ···· 5678 │
│  POR PAGAR  $12.990        │
│  [ Escribir la OF ]        │
└────────────────────────────┘
```

## US2 (P1) · Leer mejor que una foto

- Cada etiqueta se ve en varios cuadros:
  - El código vale con una lectura: Code 128 de 26 dígitos que empieza con 92.
  - El teléfono y el monto valen cuando salen iguales en ≥ 2 cuadros. Si no, quedan dudosos.
- Los renglones llegan con su posición (era el plan B de la 021, `plan.md` §5). Así las zonas del
  destinatario y del remitente se arman por cercanía.

## US3 (P2) · Los ⚠ ahí mismo

Un paquete que no está en el día, una dirección distinta de la guía o más bultos de los que se
sabían: el escáner se pausa y muestra el aviso con sus botones (los de hoy). Al resolverlo, sigue.

## Reglas

Las de `AGENTS.md` («Escaneo de la etiqueta de Starken») y las de la 021 siguen igual. Lo nuevo:
- Los cuadros no salen del teléfono, ni a la red ni al log, y no se guardan (ver «Abierto» por la
  foto del paquete).
- La OF sale solo del código de Starken. Otro código de la caja (un QR, el de Mercado Libre) se
  ignora.
- Un mismo bulto visto en muchos cuadros suma una vez (`bultosEscaneados`, ya existe). La misma
  etiqueta no vuelve a vibrar mientras siga en cámara.
- «Escribir la OF» está siempre a la vista. El escáner de Google queda de respaldo.
- Fuera de la APK, o con una APK anterior a la 1.6.0, queda lo de hoy (escribir la OF, pegar el
  texto).
- Funciona sin señal.

## Arquitectura (para validar)

```text
Teléfono (APK 1.6.0)
 cámara (CameraX) DEBAJO de la WebView transparente
   └─ ML Kit: código + texto de cada cuadro, sin red
        └─ evento {códigos, renglones con posición} ─▶ web (React)
             leerCodigoEtiqueta → OF y bulto (la llave)
             lector Starken (021) → nombre, teléfono, POR PAGAR
             aplicarLecturaEtiqueta → IndexedDB `pedidos`
             dibuja encima «PARADA n de N»
```

- **Datos:** Postgres, nada. IndexedDB, nada: se llenan los mismos campos de `pedidos`, y `fotos`
  solo si se decide guardar un cuadro.
- **`android/`:** un método del plugin para abrir y cerrar la cámara y un evento por cuadro leído.
  - CameraX 1.5.2 y ML Kit (códigos 17.3.0, texto 16.0.1) ya vienen en la APK por
    `@capacitor-mlkit/barcode-scanning` y la 005: no hay dependencias nuevas.
  - Hay un permiso nuevo, `CAMERA`. Hoy no se pide: el escáner de Google y la cámara del sistema
    no lo necesitan. Se pide una vez, la primera vez que se abre.
- **Por qué debajo de la WebView y no una Activity aparte:**
  - La WebView sigue al frente y no se congela a los ~60 s, como pasó con la burbuja (spec 020).
  - La pantalla se dibuja en React, y la lógica se publica con Vercel y se prueba con `node:test`.
- El trabajo de la sesión del 2026-11-07 (una foto → código + texto, `TelefonoPlugin.leerEtiqueta`
  y `codigoEnLaFoto`) está en `git stash` («028 escáner en vivo…»). Sirve de base.

## Primero, medir

Antes de construir la pantalla, se agrega Diagnóstico → «Probar escáner en vivo». Muestra lo que lee
ML Kit en cada cuadro (código y texto) y no guarda nada. Se prueba en el V2430 con etiquetas reales
para medir:
- si la letra chica se lee con la resolución de análisis (1280×720 o 1920×1080);
- cuánto tarda cada cuadro.

**Medido (2026-11-08):** en el V2430 con las tres etiquetas reales, el dueño: «quedó muy bueno».
En vivo alcanza; el plan B queda de respaldo.

Si el texto no se lee en vivo, hay un **plan B**: el código en vivo y, apenas aparece, una captura
en alta resolución automática para el texto. Sigue sin toques y en el teléfono.

## Criterios

- **SC-001**: cargar el auto no pide ningún toque por paquete sin ⚠ (se comprueba en el recorrido).
- **SC-002**: entre que la etiqueta entra en cuadro y la vibración pasan ≤ 1,5 s.
- **SC-003**: ≥ 90 % de ~50 etiquetas reales quedan con OF, nombre, teléfono y pago sin tocar
  (se mide junto con la T012 de la 021 y la T030 de la 005).
- **SC-004**: ninguna consulta de red durante el escaneo (`chrome://inspect` → Network vacío, más
  una prueba estática).
- **SC-005**: un bulto suma una vez aunque se vea en 30 cuadros.

## Decidido (2026-11-08)

- Se guarda una foto del paquete: una captura en alta, automática y sin toques, cuando la etiqueta
  queda leída (solo en el teléfono; se borra con el día).
- Botón de linterna y vibración corta. Sonidos «Marimba» (el dueño, 2026-11-08, elegida en
  https://claude.ai/artifact/UUubHvpkZGVhv1PmJKkPAb): un tic que sube por cada dato firme (do6 · mi6
  · sol6), el de pedido leído al quedar completa (llega a do7) y dos notas que bajan con un ⚠. Sin
  racha: la descartó el dueño. Enfocado en que escanear dé gusto.
- Desde la parada (cuando falta el teléfono) sigue la foto de hoy; el escáner en vivo es para
  cargar el auto.
- Manda la precisión sobre la rapidez (el dueño, 2026-11-08): mejor tardar más y que los datos
  estén bien.
- El dueño prueba el escaneo completo con esta feature; la 021 pasa a `main` junto con ella.

## Fuera de alcance

- La guía, que sigue con la IA.
- El lector Starken, que es la 021.
- Describir el paquete en automático (tres toques, 021).
