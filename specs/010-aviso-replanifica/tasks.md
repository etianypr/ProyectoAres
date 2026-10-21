---
description: "Tareas: el aviso replanifica la ruta en curso"
---

# Tasks: El aviso replanifica la ruta en curso

**Regla**: tras cada fase, `npx tsc --noEmit` + `npm test`; al final, lint y build.

## Phase 1: Vocabulario (US1, US3)

- [x] T001 `catalogos.ts`: `ACCIONES_WHATSAPP` = CONFIRMAR · MANANA · HORARIO; `DISPONIBILIDADES` sin `rechazado` ni `disponibilidad_sin_respuesta`, con `manana`; etiqueta "No morador"
- [x] T002 `config.ts` alias RECHAZAR → MANANA; `estados.ts` sin `rechazoPendiente` ni `rechazoPorAviso`; `migrar.ts` normaliza disponibilidades viejas

## Phase 2: Planificador (US2)

- [x] T003 `local/planificar.ts`: `llegadas`, `minutosFueraDeBloque`, `ubicarConHorario` + pruebas
- [x] T004 `generar-ruta.ts`: estrategia "horarios" con el planificador; `fueraDeHorario`; sin rechazados ni `versionDisponibilidad`

## Phase 3: Respuestas en vivo (US1, US2)

- [x] T005 `almacen/disponibilidad.ts`: "manana" cierra (No morador + evento); quitar `registrarRechazo`; `reiniciarDisponibilidad` sin reabrir
- [x] T006 `almacen/ruta.ts`: `ordenarRuta`, `fijarTrazado`; `local/replanificar.ts`
- [x] T007 `local/whatsapp.ts` (`choferId`, cambios) y `use-jornada.ts` (replanifica y expone avisos; sin rechazos ni "sin respuesta")
- [x] T008 `pantalla.tsx`, `vista-previa-ruta.tsx`, `pedido-form-local.tsx`: avisos de cambios, sin sección de rechazos, "No morador"

## Phase 4: Servidor y fuera del código (US1)

- [x] T009 `lib/whatsapp.ts` botones; migración `0004_aviso_manana.sql`
- [x] T010 `docs/WHATSAPP.md` (plantilla y orden de despliegue), `.env.example`, `docs/DOCUMENTO-PRINCIPAL.md`

## Phase 5: Docs y verificación

- [x] T011 Pruebas: reescribir las de rechazo por WhatsApp; nuevas de "Mañana", reubicación y alias
- [x] T012 `docs/CLASES.md` (+ página), `docs/ARQUITECTURA.md`, `specs/README.md`, `docs/HOJA-DE-RUTA.md`
- [x] T013 `npm test`, `npm run lint`, `npm run build`
