# 042 · Acabado del panel del jefe

Dueño, 2026-11-19: «sigue con la fase 4». Después de la 041 (la app del conductor), el panel de
escritorio del jefe: que deje de verse armado a mano. Solo lo visual, sin tocar lógica, datos ni el
cálculo del pago. Maqueta con tres variantes (claude.ai/artifact/GSd9Sriq13dJPCwviFMXsh): el dueño
eligió **A · Fría**, los neutros azulados que el panel ya tenía a propósito.

## Causa (auditoría)
- El panel salía en la letra del sistema: `layout.tsx` cargaba Geist y nadie la usaba, y
  `--font-texto/--font-cifras` solo existían en la app del conductor; `font-mono` nunca se veía.
- Barra lateral `#1d1d1f` con un ícono de caja y «Gestión interna»; el login ya usaba el logo de ARES.
- ~25 avisos escritos a mano con borde, `bg-white` en vez de `bg-card`, `Card` de 18 px (el resto
  de la escala es `2xl`), el botón de peligro con un rojo fuera del token, morado sin token, tamaños
  fijos en px en `Button` y `Kpi`.

## Qué cambió
- **Letra**: `layout.tsx` carga Manrope e IBM Plex Mono como `--font-texto` y `--font-cifras` para
  toda la app; `--font-titulo` es la del texto (`globals.css`). `tema-dashund.tsx` ya no las carga.
- **Barra lateral**: `bg-foreground`, la marca ARES (`LogoDashund`) con el nombre de la empresa
  debajo, el ítem activo además en seminegrita, rótulos de 12 px.
- **Piezas**: `Card` `rounded-2xl`; `Kpi` con rótulo en versalitas y cifra `2xl` extranegrita;
  `PageHeader` extranegrita; `Button` en la escala (36/44/48 px, `text-sm`) y el peligro con el
  token `--danger`; `--violet`/`--violet-bg` para la carga manual.
- **Barrido** (`(app)`, `components/panel`, login y contraseña): avisos sin borde y `rounded-xl`
  (25), `bg-white` → `bg-card` (11), letra mínima de 12 px, radios de la escala; `Input` `rounded-xl`.

## Fuera
Los dos diálogos hechos a mano (`eliminar-conductor-dialog.tsx`, `dialogo-agregar-dia.tsx`) siguen
con su propio portal: pasarlos a `Dialogo` toca foco y cierre. Login y contraseña conservan su
fondo cálido (son la entrada de las dos apps). Paleta de los gráficos (`periodos.ts`).

## Falta
Recorrer el panel con la cuenta del jefe (la sesión de prueba es de conductor y redirige a la app):
Encomiendas, un día, Conductores, Configuración, login y «¿Olvidaste tu contraseña?».
