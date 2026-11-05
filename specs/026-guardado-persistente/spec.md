# Spec 026 · Que el teléfono no borre el día por falta de espacio

**Creada**: 2026-11-05 · **Estado**: borrador (falta definirla) · **Rama**: sin empezar ·
**Origen**: revisión de skills (2026-11-05). La skill `capacitor-offline-first` (descartada porque
empuja SQLite) advierte que el navegador puede desalojar IndexedDB cuando falta espacio.

## Hoy
- Todo el día vive en IndexedDB (`dashund-encomiendas` v5): pedidos, ruta, fotos y la `cola` de
  actividad sin enviar (`lib/encomiendas/local/idb.ts`).
- El código no pide almacenamiento persistente: no hay `navigator.storage.persist()` ni
  `navigator.storage.estimate()` en `src/`.
- Un almacenamiento «best-effort» lo puede borrar el navegador si el teléfono se queda sin espacio.
  Las fotos de la guía y de las etiquetas lo llenan rápido.

## Debe
- Pedir almacenamiento persistente al abrir la app del conductor, sin preguntarle nada al
  conductor.
- Diagnóstico muestra si el almacenamiento es persistente y cuánto se usa (para revisarlo por
  teléfono con el dueño).
- Si el navegador lo niega, la app funciona igual. Un aviso solo tiene sentido si el espacio está
  por acabarse.
- No cambia el formato de datos ni la versión de `idb.ts`. La `cola` no se toca.

## Por definir
- Qué pasa en la APK: si la WebView de Android desaloja el almacenamiento y si `persist()` responde
  ahí. Medirlo en el teléfono con `chrome://inspect` antes de diseñar el aviso.
- En la PWA (Chrome), `persist()` se concede solo según el uso. ¿Hace falta instalarla?
- Desde qué porcentaje de uso se avisa, y qué se le propone al conductor (¿borrar fotos de días ya
  cerrados? ya se borran al cerrar el día).

## Cruces
007 (borrado diario) · 015 (APK, abrir sin señal) · 021 (fotos de etiquetas solo en el teléfono).
