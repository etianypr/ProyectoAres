# Tasks: Spec 018

- [x] T001 Contrato y validación de la conversación (`lib/geo/direccion-ia/contrato.ts`)
- [x] T002 Una ida con Claude y sus herramientas (`lib/geo/direccion-ia/servidor.ts`, `server-only`) y la ruta `api/direccion-ia`
- [x] T003 El bucle en el teléfono: ejecutar herramientas, `interpretar` la propuesta (`lib/geo/direccion-ia/cliente.ts`)
- [x] T004 Proponer correcciones para los sin ubicar del día sin cambiar nada (`corregirSinUbicar`, `esSegura`) y aplicar la confirmada con nota (`aplicarCorreccion`)
- [x] T005 Al cargar la guía, después de ubicar (`_componentes/fin-guia.tsx`); botón en "Pedidos fuera de la ruta" (`_componentes/corregir-ia.tsx`); confirmar o descartar cada una con el mapa (`_componentes/confirmar-correcciones.tsx`)
- [x] T006 "Cargar la guía": Sacar foto y Galería al centro; Google Lens aparte (`fotos-guia.tsx`, `lineas-guia.tsx`)
- [x] T007 Pruebas (`pruebas/direccion-ia.test.mjs`) y prueba con la API real (3 direcciones)
- [x] T009 Lápiz para editar cada línea leída de la guía (`lineas-guia.tsx`)
- [x] T010 Al confirmar la ruta, aviso "Ahora carga el auto" con "Escanear los N paquetes" (`aviso-cargar-auto.tsx`)
- [ ] T008 Día real: SC-001 y SC-002
