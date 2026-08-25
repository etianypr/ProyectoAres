// Servidor MCP de datos geoespaciales de Arica.
//
//   node --import ./mcp/registrar.mjs mcp/servidor.ts
//
// Es una envoltura DELGADA: no hay lógica de negocio acá. Todo lo que hace de
// verdad vive en src/lib/geo/, que la app importa directo sin pasar por MCP ni
// pagar su latencia. Este archivo solo traduce entre el protocolo y esas
// funciones — si algo se pone interesante en este archivo, está en el lugar
// equivocado.
//
// Qué NO está y por qué: el plan original tenía un geocodificador con cascada
// IDE Chile → Photon. Se midió antes de escribirlo (scripts/sondear-proveedores)
// y los dos se cayeron: IDE Chile no expone API REST de geocodificación —solo un
// buscador sobre su catálogo de metadatos, sin coordenadas— y Photon devolvió
// housenumber null en las 26 direcciones de Arica que se le pidieron, o sea cero
// puertas que Mapbox+OSM no tuvieran ya. Agregarlos habría sido latencia y
// código para nada.
//
// ⚠️ En stdio, stdout ES el canal del protocolo. Un console.log suelto acá
// adentro rompe la sesión entera y el error que se ve no se parece a la causa.
// Para depurar, console.error (que va a stderr).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolverPlusCode, plusCodeDe } from "@/lib/geo/plus-code";
import { obtenerRutaAbierta, ErrorClaveORS } from "@/lib/geo/openrouteservice";
import {
  entradaPlusCode,
  salidaPlusCode,
  entradaCodificar,
  salidaCodificar,
  entradaRuta,
  salidaRuta,
} from "./esquemas";

const servidor = new McpServer({ name: "ares-geo", version: "1.0.0" });

/** Una tool que no pudo hacer su trabajo contesta esto, y NO lanza: un throw se
 *  le presenta al modelo como una falla del servidor y no como "esto no se
 *  pudo, probá otra cosa". */
function falla(mensaje: string) {
  return { content: [{ type: "text" as const, text: mensaje }], isError: true };
}

// ---------------------------------------------------------------------------
// resolve_plus_code
// ---------------------------------------------------------------------------

servidor.registerTool(
  "resolve_plus_code",
  {
    title: "Google Plus Code → coordenadas",
    description:
      "Convierte un Plus Code en latitud y longitud SIN consultar ninguna red: " +
      "es aritmética, no falla, no tiene límite de consultas y siempre da lo " +
      "mismo. En Arica es la forma más confiable de ubicar una casa sin número: " +
      "se marca una vez y no se vuelve a geocodificar nunca.",
    inputSchema: entradaPlusCode,
    outputSchema: salidaPlusCode,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ codigo, referencia }) => {
    const r = resolverPlusCode(codigo, referencia);
    if (!r) {
      return falla(
        `"${codigo}" no es un Plus Code válido. Un código usa solo las letras ` +
          "23456789CFGHJMPQRVWX y lleva un '+' (por ejemplo 57HFGMCP+MX, o " +
          "GMCP+MX si es corto).",
      );
    }

    const structuredContent = {
      lat: r.lat,
      lng: r.lng,
      codigo_completo: r.codigoCompleto,
      era_corto: r.eraCorto,
      precision_metros: r.precisionMetros,
      recuadro: r.recuadro,
    };

    return {
      content: [
        {
          type: "text" as const,
          text:
            `${r.lat}, ${r.lng} (±${r.precisionMetros} m` +
            `${r.eraCorto ? `, recuperado como ${r.codigoCompleto}` : ""})`,
        },
      ],
      structuredContent,
    };
  },
);

// ---------------------------------------------------------------------------
// encode_plus_code
// ---------------------------------------------------------------------------

servidor.registerTool(
  "encode_plus_code",
  {
    title: "Coordenadas → Google Plus Code",
    description:
      "La otra mitad de resolve_plus_code: convierte un punto en un código corto " +
      "que una persona puede dictar por teléfono o escribir en un paquete. Es la " +
      "forma de darle dirección estable a una casa que no tiene número, que en " +
      "Arica es la mayoría. Tampoco consulta la red.",
    inputSchema: entradaCodificar,
    outputSchema: salidaCodificar,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ punto, digitos }) => {
    const codigo = plusCodeDe(punto, digitos);
    // Solo pasa con coordenadas imposibles: el esquema ya acota los rangos.
    if (!codigo) return falla(`No se pudo codificar ${punto.lat}, ${punto.lng}.`);

    // Se vuelve a decodificar para informar DÓNDE cae de verdad el código. Un
    // Plus Code no es un punto sino un recuadro, así que codificar redondea: sin
    // esto, quien lo use creería que el código apunta exactamente a lo que mandó.
    const vuelta = resolverPlusCode(codigo);
    if (!vuelta) return falla(`Se generó un código ilegible para ${punto.lat}, ${punto.lng}.`);

    return {
      content: [{ type: "text" as const, text: `${codigo} (±${vuelta.precisionMetros} m)` }],
      structuredContent: {
        codigo,
        lat: vuelta.lat,
        lng: vuelta.lng,
        precision_metros: vuelta.precisionMetros,
      },
    };
  },
);

// ---------------------------------------------------------------------------
// get_route_ch
// ---------------------------------------------------------------------------

servidor.registerTool(
  "get_route_ch",
  {
    title: "Ruta por calles (Contraction Hierarchies)",
    description:
      "Trazado real por calles entre coordenadas, con su distancia y duración, " +
      "vía OpenRouteService: grafo de OpenStreetMap con Jerarquías de " +
      "Contracción, así que respeta avenidas, calles y pasajes. Recibe y " +
      "devuelve SOLO coordenadas. No es la ruta que maneja el chofer —esa sale " +
      "de Mapbox, con la voz en español— sino la que se puede preguntar sin " +
      "gastar esa cuota.",
    inputSchema: entradaRuta,
    outputSchema: salidaRuta,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ puntos, perfil, optimizar_orden, instrucciones, incluir_geometria, evitar }) => {
    let r;
    try {
      r = await obtenerRutaAbierta(puntos, {
        perfil,
        optimizarOrden: optimizar_orden,
        instrucciones,
        evitar,
      });
    } catch (e) {
      // La falta de API key no es una falla de red y se dice con todas las
      // letras: si no, un .env mal armado se ve igual que "ORS está caído".
      if (e instanceof ErrorClaveORS) {
        return falla(
          "Falta ORS_API_KEY en el entorno del servidor MCP. Se saca gratis en " +
            "openrouteservice.org y se pone en .env.local (SIN el prefijo " +
            "NEXT_PUBLIC_: esta clave nunca sale al teléfono).",
        );
      }
      throw e;
    }

    if (!r) {
      return falla(
        "OpenRouteService no devolvió una ruta utilizable. Puede ser que algún " +
          "punto quede lejos de cualquier calle, o que el servicio no esté " +
          "respondiendo. Las coordenadas van {lat, lng} y tienen que caer en tierra.",
      );
    }

    const structuredContent = {
      distancia_metros: r.distanciaM,
      duracion_segundos: r.duracionS,
      orden: r.orden,
      puntos_geometria: r.geometria.length,
      // El trazado completo son miles de pares que nadie lee y que llenan el
      // contexto del modelo. Va solo si se pidió.
      ...(incluir_geometria ? { geometria: r.geometria } : {}),
      ...(r.pasos
        ? {
            pasos: r.pasos.map((p) => ({
              texto: p.texto,
              distancia_metros: p.distanciaM,
              duracion_segundos: p.duracionS,
              punto: p.punto,
            })),
          }
        : {}),
      fuente: "openrouteservice" as const,
    };

    const km = (r.distanciaM / 1000).toFixed(1);
    const min = Math.round(r.duracionS / 60);
    return {
      content: [{ type: "text" as const, text: `${km} km, ${min} min (${r.geometria.length} puntos de trazado)` }],
      structuredContent,
    };
  },
);

await servidor.connect(new StdioServerTransport());
