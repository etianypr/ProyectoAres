# 041 · Acabado de la app del conductor

Dueño, 2026-11-19: «siento que el proyecto está muy vibecodeado». Alcance elegido: solo lo visual
de la app del conductor, sin tocar lógica, `android/` ni IndexedDB. Maqueta aprobada (lado a lado,
claude.ai/artifact/E9Qh3gnDTRxEuksdvq2BJ6).

## Causa
Las primitivas de `components/ui` se hicieron para el tema frío del panel y la app del conductor
casi no las usa: el botón principal estaba copiado en 7 archivos con diferencias, los controles del
mapa medían 40 o 44 px, 30 textos de ≤ 11 px, mono en bultos, plata y teléfono (y no en algunas
OF), grises azulados que el tema cálido no alcanzaba y el marcador del conductor con degradados.

## Qué cambió
- **Tokens** (`globals.css`): `--surface`, `--surface-hover`, `--surface-ink`, `--border-strong`,
  `--label`, `--shadow-ink` y `shadow-float`, con los valores de siempre del panel (no cambia).
  `tema-dashund.css` los redefine cálidos.
- **Primitivas** (`button`, `badge`, `label`, `checkbox`, `input`, `campo`): sin hex; la etiqueta de
  `Campo` sube a 12 px.
- **Botones** (`_componentes/botones.ts`): `BOTON_PRINCIPAL`, `BOTON_SECUNDARIO`,
  `BOTON_RESULTADO`, `BOTON_REDONDO`. Todo lo que se aprieta manejando mide 48 px; los redondos del
  mapa, 44 px con `shadow-float`.
- **Letra**: piso de 12 px (`text-xs`); 13–14,5 px → `text-sm`.
- **Cifras**: mono solo en OF, km y horas; lo demás `tabular-nums`. Plex Mono sin `font-bold`
  (solo se carga en 500/600).
- **Estados**: «Centrar» siguiendo lleva fondo, anillo y `aria-pressed`; la parada activa de la
  lista, su número en un círculo lleno; el control segmentado, seminegrita.
- **Glifos**: ✓, ● y ⚠ del barrido → íconos de lucide; «Resolver el ⚠» → «Resolver advertencia(s)»
  (y la Ayuda).
- **Marcador del conductor**: azul plano (elegido por el dueño), sin degradados.
- **Ruta propuesta deslizable** (dueño, 2026-11-19): la cabecera es un tirador
  (`cabecera-propuesta.tsx`); abajo quedan «Ruta propuesta · N paradas», la ✕ y «Usar esta ruta»
  sobre el mapa, arriba (o un toque) el detalle. «Ver las N» (lista a pantalla completa, spec 033)
  salió: «es inútil»; la lista ocupa lo que deja el panel y se desplaza. Mientras hay propuesta, la hoja del día queda invisible (`pantalla.tsx`), si no
  asomaba su cabecera sobre la propuesta plegada.

## Fase 2 (dueño, 2026-11-19: «dale con fase 2»)
- **Botón de ícono** (`BOTON_ICONO`, 44 px): cerrar, volver, ayuda y los ± de bultos, que eran de
  36 y 40 px escritos a mano en 9 archivos.
- **Superficies** (`_componentes/superficies.ts`): `PANTALLA` (5 pantallas completas), `HOJA` y
  `TIRADOR` (la hoja del día y la ruta propuesta, que tenían sombra y radio distintos).
- **Capas con nombre** (`@utility` en `globals.css`): `z-mapa` 10, `z-hoja` 20, `z-sobre-hoja` 30,
  `z-pantalla` 50, `z-cinta` 55, `z-ventana` 60, `z-bloqueo` 70. Mismos valores que antes.
- **Radios**: `rounded-t-hoja` (26 px) y `rounded-campo` (14 px) como tokens; `rounded-lg` →
  `rounded-xl` (10), y los sueltos (`3xl`, `[22px]`, `rounded`) a la escala.
- **Mapa**: la parada entregada lleva ✓ antes del número (antes solo era verde contra gris).
- **⚠**: el «⚠ revisar» del escáner en vivo es ícono; `AlertTriangle` en dos tamaños (3,5 y 4).

## Fuera
Panel del jefe, `.cifra` y `.rotulo` sin uso, los ⚠ que van dentro de textos (avisos, burbuja,
Ayuda: son parte del mensaje) y los colores del mapa en `_mapa/` (MapLibre pide valores literales).

## Recorrido (2026-11-19)
En Chrome a 360 px (iframe de 360 × 800, modo prueba, 6 pedidos con Plus Code, APIs que gastan
bloqueadas: 0 consultas): cargar guía (pegar → revisar → crear), optimizar ruta, cargar vehículo
(OF escrita), parada activa con una entrega, ruta del día y menú. Sin cortes ni scroll horizontal;
los rótulos de 12 px del visor caben. Arreglado en el camino: la OF de la tarjeta del escaneo, de
«no está en los pedidos» y de «Buscar paquete por OF» pasa a mono.

## Falta
Lo que solo existe en la APK: cámara en vivo del visor y del escáner, barrido de la nómina
(íconos nuevos sobre la cámara) y la burbuja.
