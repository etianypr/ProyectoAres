# Servidor MCP de datos geoespaciales de Arica

```bash
npm run mcp     # stdio; ya está registrado en .mcp.json para Claude Code
```

Expone tres herramientas a un LLM. Es una envoltura **delgada**: toda la lógica
vive en `src/lib/geo/`, que la app importa directo sin pasar por el protocolo ni
pagar su latencia. Si algo se pone interesante en `servidor.ts`, está en el lugar
equivocado.

| Tool | Qué hace | Red |
| --- | --- | --- |
| `resolve_plus_code` | Plus Code → lat/lng. Acepta el código corto que la gente dicta ("GMCP+MX, Arica") y lo recupera contra el centro de Arica. | **Ninguna** |
| `encode_plus_code` | lat/lng → Plus Code. La otra mitad: le da dirección estable a una casa sin número, en un texto que se puede dictar por teléfono o escribir en el paquete. | **Ninguna** |
| `get_route_ch` | Trazado real por calles entre coordenadas, con distancia y duración. OpenRouteService: grafo de OSM con Jerarquías de Contracción. | OpenRouteService |

Las tres declaran esquema de **salida** además de entrada. Eso es lo que hace
cumplir por protocolo la regla del servidor: toda respuesta de ubicación es
lat/lng, nunca una dirección de texto. Un texto de dirección se vuelve a
geocodificar y se vuelve a equivocar; una coordenada, no.

`encode_plus_code` devuelve además el punto donde el código cae **de verdad**: un
Plus Code es un recuadro, no un punto, así que codificar redondea. Sin eso, quien
lo use creería que apunta exacto a lo que mandó.

## Por qué `resolve_plus_code` es la que importa

En Arica las casas no tienen numeración estructurada, y está medido: de 23
direcciones reales, Mapbox tiene la puerta exacta en **2** y estima el resto
(`npm run sondear`). Un Plus Code corta ese problema de raíz — la casa se marca
una vez, queda como un texto corto que se puede dictar por teléfono, y no se
vuelve a geocodificar nunca.

Además es la pieza más barata del sistema: aritmética pura, sin red, sin API key,
sin límite de consultas y determinista.

**Y no es solo del LLM.** `src/lib/geo/plus-code.ts` lo usa también la app: el
campo de dirección del conductor reconoce un Plus Code escrito y lo resuelve ahí
mismo, sin consultar a Mapbox ni a OSM (ver `lib/geo/geocoding`). Esa es la razón
de que la lógica viva en `src/lib/geo/` y no acá adentro — el MCP es un
consumidor más, no el dueño.

## Lo que se cayó del plan, y por qué

El plan original tenía cinco tools, con una cascada de geocodificación
`IDE Chile → Photon → Nominatim`. Se midió **antes** de escribirla y quedaron dos:

- **IDE Chile** no expone API REST de geocodificación. Su `/buscar/` es un
  buscador sobre el catálogo de metadatos —capas y datasets—, servido como HTML
  y sin coordenadas. No hay nada que consumir.
- **Photon** devolvió `housenumber: null` en las **26** direcciones de Arica que
  se le pidieron: cero puertas que Mapbox+OSM no tuvieran ya. Rescató una sola
  dirección, y como calle, no como puerta.

Agregarlos habría sido latencia, código y una cascada que mantener a cambio de
nada. El criterio estaba fijado antes de medir: un proveedor entra solo si aporta
puertas que los actuales no tienen.

## Configuración

`ORS_API_KEY` en `.env.local`, **sin** el prefijo `NEXT_PUBLIC_`: esta clave se
usa desde el servidor MCP y nunca sale al teléfono. Se saca gratis en
openrouteservice.org (2.000 consultas/día). Sin ella, las dos tools de Plus Codes
funcionan igual y `get_route_ch` contesta diciendo exactamente qué falta.

El máximo de puntos de una ruta es **70**, medido contra la API: 70 devuelve 200
y 71 devuelve 400 ("must not be greater than 70"). Da de sobra — un día de
30 paradas más la base son 31 puntos.

`ORS_BASE` permite apuntar a una instancia propia: si algún día hay que cortar la
dependencia del servicio alojado, ORS o Valhalla se levantan en un contenedor con
el extracto OSM de Chile y no cambia nada más.

## Cómo se corre sin paso de compilación

Node 24 ejecuta `.ts` directo. Lo único que no resuelve es el alias `@/…` y los
imports sin extensión — exactamente lo que ya resolvía el arnés de pruebas. Ese
resolvedor se sacó a `pruebas/resolver-ts.mjs` y lo usan los dos: las pruebas
(que además enchufan sus dobles) y `mcp/loader.mjs` (que no enchufa ninguno).

**En stdio, stdout es el canal del protocolo.** Un `console.log` suelto rompe la
sesión entera y el error que se ve no se parece a la causa. Para depurar,
`console.error`.

Las pruebas están en `pruebas/16-mcp.test.mjs`: levantan este servidor como
proceso y le hablan con el cliente oficial del SDK.
