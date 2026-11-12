---
description: "Tareas de menos visitas fallidas (confirmar la dirección)"
---

# Tasks: Menos visitas fallidas — confirmar la dirección

Rama `004-menos-visitas-fallidas`. Usa la migración **0008** (no la v7 de IndexedDB).

## Hecho (2026-11-09)

- [x] T001 Migración `0008_confirmar_direccion.sql` (escrita, **sin correr**).
- [x] T002 `catalogos.ts`: `DIRECCION_SI`/`DIRECCION_NO`; `BOTONES_DISPONIBILIDAD` para la 010.
- [x] T003 `config.ts`: `leerFormularioDireccion` y `limpiarTextoReceptor`.
- [x] T004 `whatsapp/confirmar-direccion.ts`: plantilla con botón Flow.
- [x] T005 `api/whatsapp/send` (`tipo: "direccion"`), `webhook` (`nfm_reply`), `status` (`texto`).
- [x] T006 Teléfono: `pedidosSinAviso` exige teléfono y nombre; `pedirAviso` manda la dirección;
  `aplicar-respuestas.ts` y `registrarRespuestaDireccion`.
- [x] T007 Pantalla: ⚠ «El receptor dice otra dirección» con «Usar la del receptor» / «Dejar la de
  la guía»; confirmación y referencia en la parada activa; aviso en pantalla.
- [x] T008 `pruebas/confirmar-direccion.test.mjs` (envío, formulario, teléfono).
- [x] T009 Docs: `WHATSAPP.md` (Flow y plantilla), `PRIVACIDAD.md`, `ARQUITECTURA.md`,
  `CLASES.md`, `.env.example`.

## Falta

- [ ] T010 Correr la 0008 en Supabase (con aprobación del dueño), `npm run test:esquema`.
- [ ] T011 Dueño: app de Meta, número de prueba, el Flow y la plantilla (`docs/WHATSAPP.md`).
- [ ] T012 Recorrer a 360 px el ⚠ del receptor y la referencia en la parada (skill
  `recorrer-conductor`; con un pedido escrito a mano en IndexedDB, porque el modo prueba no manda
  WhatsApp).
- [ ] T013 Quickstart con el número de prueba de Meta en el preview de la rama.
- [ ] T014 Día real: SC-001 y SC-002; anotar aquí.
