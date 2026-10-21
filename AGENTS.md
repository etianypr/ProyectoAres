# This is NOT the Next.js you know

Next.js 16.4: APIs y convenciones distintas a tu entrenamiento. Lee la guía en
`node_modules/next/dist/docs/` antes de escribir código. El middleware se llama **Proxy**
(`src/proxy.ts`).

## Mapa

- `src/app/(app)` panel del jefe (escritorio) · `src/app/(conductor)` PWA del conductor.
  No comparten layout.
- Sistema, datos y capas: `docs/ARQUITECTURA.md` · tipos y módulos: `docs/CLASES.md` ·
  prioridades: `docs/HOJA-DE-RUTA.md` · privacidad: `docs/PRIVACIDAD.md` · plantilla de
  WhatsApp y despliegue: `docs/WHATSAPP.md`.
- Trabajo con Spec Kit: `specs/` (índice en `specs/README.md`), reglas en
  `.specify/memory/constitution.md`.

## Reglas

- Datos de destinatarios: solo en el teléfono (IndexedDB), se borran al cerrar el día;
  nunca en el servidor ni en logs. Todo proveedor que los reciba va en `docs/PRIVACIDAD.md`.
- Si cambias un límite, tabla, store, tipo o carpeta: actualiza `docs/ARQUITECTURA.md` o
  `docs/CLASES.md` en el mismo cambio.
- Vocabulario: el glosario de `docs/CLASES.md` §0. **conductor** (la base aún dice `chofer`) y
  **día de trabajo** (la base aún dice `jornada`); se renombran en la spec 002. No agregar
  "chofer" ni "jornada" nuevos.
- Verificar con `npm test`, `npm run lint`, `npm run build`. Sin commits salvo pedido.
