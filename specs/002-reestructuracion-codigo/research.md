# Research: Reestructuración y "conductor"

| # | Decisión | Por qué | Descartado |
|---|---|---|---|
| R1 | `lib/` por dominio (`auth`, `supabase`, `geo`, `rutas`, `whatsapp`, `encomiendas`, `conductores`, `comun`) | 14 archivos sueltos mezclan dominios; nombres chocan (`whatsapp.ts` vs `local/whatsapp.ts`) | por pantalla (geo/rutas los usan teléfono, panel y MCP); solo dividir (no resuelve ciclos) |
| R2 | Migración nueva idempotente (siguiente número libre); 0001–0003 quedan como históricas con nota | cambio chico y revisable; reescribir ~1.900 líneas de SQL sin `test:base` es el mayor riesgo | reescribir 0001–0003; consolidar en línea base nueva (después) |
| R3 | Ventana nocturna: ensayo → migración → despliegue; sin capa de compatibilidad | `enviarActividadPendiente()` solo borra con confirmación del servidor; `upsert … ignoreDuplicates` evita duplicados | vistas/columnas con nombre viejo (no conviven con la tabla) |
| R4 | `ALTER TYPE rol_usuario RENAME VALUE 'chofer' TO 'conductor'` con guarda en `pg_enum` | `get_rol()` devuelve el enum; las policies guardan la constante convertida. **Verificar en copia** | valor nuevo + migrar filas (deja valor muerto) |
| R5 | Recrear las 10 funciones plpgsql que nombran `choferes`/`chofer_id`/`'chofer'`; las 2 RPC (`p_chofer_id`) con `drop`+`create` y sus `grant` | el cuerpo plpgsql es texto: renombrar la tabla no lo actualiza | — |
| R6 | `(app)/choferes` → `(app)/conductores` + redirección en `next.config.ts` | enlaces viejos siguen funcionando | — |
| R7 | `ActividadPorEnviar.choferId` → `conductorId`, lectura `conductorId ?? choferId`; sin subir versión IndexedDB | forma de objetos cambia sin versión (`idb.ts`) | renombrar la base local (pierde pedidos) |
| R8 | Fotos nuevas en `fotos/conductores/`; las viejas no se mueven | la ficha guarda la URL completa | — |
| R9 | `pruebas/arquitectura.test.mjs` en el arnés `node:test` | cubre capas, `server-only`, tamaño y vocabulario sin dependencias | eslint-plugin-boundaries / dependency-cruiser |
| R10 | Carpetas privadas `_componentes/`, `_hooks/`, `_mapa/` | Next 16 las excluye del enrutamiento (docs: project-structure, "Private folders") | — |
| R11 | Módulo dividido = carpeta con `index.ts` barril | la ruta de importación no cambia; el resolvedor de pruebas ya prueba `/index.ts` | — |

Funciones a recrear (R5): `handle_new_user`, `private.encomienda_congelar_dia`,
`_congelar_si_cerrada`, `_congelar_insertados`, `_congelar_borrados`,
`_congelar_actualizados`, `_jornada_cambio`, `_congelar_pendientes`,
`_cerrar_jornadas_vencidas`, `_borrar_correlaciones_jornada`; RPC `encomienda_repreciar_dia`,
`encomienda_valorar_dia`.
