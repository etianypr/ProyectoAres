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

## Fuera
Panel del jefe, puntos del mapa en canvas, capas (z-index), radios de cada tarjeta, `.cifra` y
`.rotulo` sin uso.

## Falta
Recorrer a 360 px en el teléfono (skill `recorrer-conductor`): cargar guía, optimizar ruta, cargar
vehículo, parada activa, ruta del día, controles del mapa y menú. Ojo con lo que creció a 12 px:
los rótulos bajo los botones del visor («Galería», «Descartar», «Pegar») y los números en círculos
de 24 px.
