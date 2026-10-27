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
- [x] T017 E8 errores de sincronización visibles; evento rechazado aislado (solo si los demás pasan; si fallan todos, es sesión o permisos y se informa) — `apartarRechazado`, `leerRechazados`
- [x] T018 E9 tope de tiempo en todas las consultas (`lib/comun/tope.ts`: 8–15 s; lectura con IA 60 s)
- [x] T019 E10–E11 fotos de la guía de a una; OF repetida queda la mejor; total de la guía se conserva
- [x] T020 E12 promesas sin manejar (escáner, WhatsApp, cerrar sesión sin señal, botón atrás al ubicar)

## US2 · Navegación

- [x] T030 N1 voz nativa (`hablar`/`callar` con TextToSpeech en el plugin `Telefono`, canal de navegación, baja la música) + APK 1.2.0 (versionCode 3); fuera de la APK o con una APK vieja, `speechSynthesis`
- [x] T031 N2–N3 el cartel cambia al doblar (`pasoEnCurso`, 8 m de la esquina o sobre un paso posterior); avisos por tramo y maniobra (la misma esquina se vuelve a avisar en otro tramo; no se repite al recalcular); el aviso del giro corta, los lejanos se encolan
- [x] T032 N4 la tarjeta de la parada muestra metros, minutos y hora de llegada a la PARADA (`restanteDelTramo`, tiempos de Mapbox por paso)
- [x] T033 N5 el punto se desliza al mismo ritmo que la cámara (y gira por el lado corto); un salto de más de 150 m no se anima
- [x] T034 N6–N11 tope de tiempo; el GPS se arma de nuevo al volver a primer plano, tras 30 s sin lecturas y al centrar; una primera lectura mala la reemplaza cualquiera más precisa; rumbo de más de 25 s no va a Mapbox; sin recálculo a menos de 100 m de la parada ni bajo 2 m/s; paso por proyección hasta 4 adelante
- [x] T035 N12 zoom por velocidad (18,4 → 17,4 entre 30 y 60 km/h, se calla si el conductor pellizca); cartel con la distancia grande; "2.ª salida" en rotondas. Fuera: `approaches=curb` (obligaría a dar la vuelta a la manzana para llegar por la vereda de la casa; en Arica se estaciona a cualquier lado)

## US3 · Rutas

- [x] T040 R1 matriz de calles por bloques (`geo/mapbox/matriz.ts`): 12 × 13 la primera vez, por fila o columna lo que falta; pares en memoria del día; tope de 90.000 elementos al mes (el gratis de Mapbox son 100.000; después US$2 cada 1.000). Solo distancia: el reloj es el de `planificar.ts`
- [x] T041 R2 optimizador con horarios (`con-horarios.ts`): arranca de la más corta y de la de antes; 60 paradas y 15 bloques al azar: 0 minutos fuera (la corta, 1.685), ~0,3 s en el PC
- [x] T042 R3 huella con horario, confirmación y hora (al cuarto de hora); tramos reordenados solo si no alargan; par sin camino con costo finito; salida no antes de las 8:00
- [x] T043 R4 "Dejar como pendiente" donde menos alarga a partir de 30 min (`dejarParaMasTarde`, avisa en qué lugar quedó); "Sumar a la ruta" para los pedidos de afuera (`sumarALaRuta`), sin mover la parada activa
- [x] T044 R5 la búsqueda con horarios va por partes y cede la pantalla cada 30 ms (`sin-congelar.ts`); mismo resultado que de un tirón. Un Web Worker no sirvió: Turbopack publica su archivo como TypeScript sin compilar

## Cierre

- [x] T050 Pruebas: `pruebas/listo-para-terreno.test.mjs`, `replanificar.test.mjs` (E6), `lectura-servidor.test.mjs` (varias fotos)
- [ ] T051 Docs y prueba en terreno
