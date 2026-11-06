# Quickstart 027 · Recorrer la hoja paso por paso

> Desde la 022 la OF de otro largo **no** lleva ⚠ (dueño, 2026-11-06): en B queda «1 por resolver»
> (el sin ubicar) y en B → C se resuelve uno solo.

A 360 × 800, en modo prueba (skill `recorrer-conductor`). Sin gasto: claves de pago vacías y
pedidos con Plus Code (se ubican sin proveedor). Armar la ruta necesita `NEXT_PUBLIC_ORS_KEY`
(gratis, con cupo: ~1 matriz y hasta 3 trazados por recorrido; se pregunta antes). Si Chrome no deja
achicar la ventana, la pantalla se monta en un `iframe` de 360 × 800 del mismo origen.

```powershell
# En `npm run dev` (Next 16.4), /login da 404 por el slot (app)/@modal: se prueba con el build.
$env:GOOGLE_MAPS_KEY=""; $env:GOOGLE_VISION_KEY=""; $env:ANTHROPIC_API_KEY=""
$env:WHATSAPP_TOKEN=""
npm run build; npx next start
```

Guía inventada para «Pegar el texto de Google Lens» (puntos y OF inventados). Toda OF que no tenga
exactamente 9 dígitos, menos o más, va con ⚠; para probar también una larga, agrega
`OF:3000001060 DESTINO:57HFGMCQ+JG` (suma uno a cada cuenta de la tabla):

```text
GUIA DE DESPACHO
DESCRIPCION
OF:300000101 DESTINO:57HFGMCQ+JG
OF:300000102 DESTINO:57HFGMHX+G5
OF:30000103 DESTINO:57HFGP73+Q7
OF:300000104 DESTINO:57HFGPM4+XJ
OF:300000105 DESTINO:MZ K SITIO 7
SOLO TRASLADO NO CONSTITUYE VENTA
```

| Caso | Hacer | Debe verse con la hoja cerrada |
|---|---|---|
| A | Modo prueba, sin pedidos | «Paso 1 de 6 · Cargar la guía», «Hola, …», el día escrito, «Cargar la guía» (cámara) y «Agregar un pedido a mano». Adentro: Ayer (o «Sin pedidos para hoy») y nada más |
| B | Cargar la guía → pegar el texto → «Crear 5 pedidos». La ventana termina en «Resolver los 2 ⚠» y «Armar la ruta igual» | «Paso 2 de 6», «5 pedidos · 2 por resolver», «Resolver los 2 ⚠», «Armar la ruta igual». Adentro: «Por resolver · 2» (Sin ubicar · Corregir; OF de 8 dígitos · Revisar) y «Listos · 3» plegado |
| B → C | «Resolver los 2 ⚠»: el formulario dice «⚠ 1 de 2»; escribir un Plus Code (`57HFGM5V+VR`) y guardar → abre «⚠ 2 de 2»; corregir la OF a 9 dígitos y guardar → se cierra | «Paso 3 de 6», «5 pedidos listos · Todos ubicados», «Armar la ruta», «Desde: …». Adentro: «Pedidos · 5», sin «Ubicado» en cada fila |
| D | «Armar la ruta» → «Usar esta ruta» | Sin ventana «Ruta lista». «Paso 4 de 6 · Cargar el auto», «0 de 5 paquetes escaneados», «Escanear paquete», «Salir a repartir». Arriba, sin el resumen de entregadas. Adentro: «Faltan · 5» con el número de parada |
| E | «Escanear paquete» → escribir la OF → cerrar. Escribirla otra vez → «Bultos: 2 de 2» | «1 de 5», «Seguir escaneando». La OF sale de «Faltan» |
| D' | Desde B, «Armar la ruta igual» → «Usar esta ruta» | Adentro de la hoja, «Por resolver · 2» con «Resolver los 2 ⚠», antes de «Faltan» |
| F | «Salir a repartir» | La parada 1 con sus botones (spec 020), sin barra de pasos; arriba, el resumen. Adentro: «Sin escanear · 4» plegado, la ruta, y «Agregar pedido · Sumar otra guía · Rehacer la ruta» |
| F' | Recargar la página | Sigue en la parada 1 (no vuelve a «Cargar el auto») |
| G | Cerrar todas las paradas; en el cierre, tocar «después» (o el botón atrás) | «Paso 6 de 6», «Ruta completa», «Cerrar el día» → vuelve a abrir el cierre. Adentro: «No entregados» primero y la ruta plegada |

Al terminar: salir del modo prueba (borra lo de la prueba de este navegador).
