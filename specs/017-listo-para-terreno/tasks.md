---
description: "Tareas: listo para terreno"
---

# Tasks: Spec 017

**Reglas**: sin commits salvo pedido; `npm test`, `npm run lint`, `npm run build` en verde.

## Terreno 2026-10-27 (pedidos del dueño en la primera prueba)

- [x] T001 Corregir la dirección de un pedido de la guía no pide nombre ni teléfono (llegan con la etiqueta); sin OF siguen siendo obligatorios (`pedido-form-local.tsx`)
- [x] T002 Guía → paquetes: tarjeta "Cargar el auto" (`_componentes/progreso-carga.tsx`, `avanceCarga`) con escaneados/total, botón para seguir y OF que faltan; el escáner muestra el contador y "Escanear el siguiente paquete"; al terminar la guía, "Armar la ruta" o "Escanear los paquetes"
- [x] T003 Las fotos de la guía van todas en UNA consulta (`leerFotos`, `leerFotosGuia`, hasta 6, 4 MB en total). Medido con 3 fotos de una guía de 20 líneas: 20/20 y US$0,051 contra US$0,063 en tres consultas (−20 %)

## US1 · Errores

- [x] T010 E1 fecha del día calculada en el teléfono (`_hooks/use-fecha-del-dia.ts`)
- [x] T011 E2 deshacer solo con el evento retenido; retenido sin plazo con la app atrás (`retenerEvento`, operación atómica `actualizar` en `idb.ts`)
- [x] T012 E3 parada sin teléfono: "Teléfono", "Entregado", "No se pudo"
- [x] T013 E4 foto de otra OF no se aplica; lectura con OF confirmada corrige (`ofConfirmada`); "Leer la etiqueta de nuevo"
- [x] T014 E5 se conserva el aviso de dirección distinta tras la foto
- [x] T015 E6 la respuesta de otro cliente no mueve la parada en curso (`replanificar.ts`)
- [x] T016 E7 el día se cierra tras un "Mañana" o un borrado
- [ ] T017 E8 errores de sincronización visibles; evento rechazado aislado
- [ ] T018 E9 tope de tiempo en todas las consultas
- [x] T019 E10–E11 fotos de la guía de a una; OF repetida queda la mejor; total de la guía se conserva
- [ ] T020 E12 promesas sin manejar (escáner, WhatsApp, cerrar sesión sin señal, botón atrás al ubicar)

## US2 · Navegación

- [ ] T030 N1 voz nativa (TextToSpeech en el plugin `Telefono`) + APK nueva
- [ ] T031 N2–N3 cartel después de la esquina; avisos por tramo/paso; el de giro no se corta
- [ ] T032 N4 metros y minutos a la parada, hora de llegada
- [ ] T033 N5 punto y cámara juntos
- [ ] T034 N6–N11 tope de tiempo, GPS se rearma, primera lectura mala, rumbo viejo, recálculo en la puerta, paso por proyección global
- [ ] T035 N12 zoom por velocidad, rumbo del tramo, menos redibujos, llegada, cartel grande, rotonda, vereda

## US3 · Rutas

- [ ] T040 R1 matriz de calles por bloques con distancia y duración
- [ ] T041 R2 optimizador con horarios, esperas y tope 18:00
- [ ] T042 R3 huella con horarios, tramos que empeoran, parada sin camino, hora de salida
- [ ] T043 R4 "pendiente" y pedido tardío donde menos alargan
- [ ] T044 R5 más búsqueda sin congelar la pantalla

## Cierre

- [x] T050 Pruebas: `pruebas/listo-para-terreno.test.mjs`, `replanificar.test.mjs` (E6), `lectura-servidor.test.mjs` (varias fotos)
- [ ] T051 Docs y prueba en terreno
