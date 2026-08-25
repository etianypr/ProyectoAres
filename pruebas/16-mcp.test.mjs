// El contrato del servidor MCP, hablado por el protocolo de verdad.
//
// Levanta el servidor como PROCESO y le habla con el cliente oficial del SDK,
// en vez de importar las funciones y darlas por buenas. Es a propósito, y por lo
// mismo que las pruebas de proveedores reemplazan el `fetch` global en vez de
// los módulos: lo que se rompe no son las funciones —esas ya están probadas en
// 12-plus-code y 15-ruteo-ch— sino el ARMADO. Un nombre de tool cambiado, un
// campo que se cayó del esquema de salida, un console.log que ensucia stdout y
// tumba la sesión entera: nada de eso lo ve un import.
//
// Es el mismo criterio de whatsapp-contract.test.mjs: probar el borde por donde
// habla otro.
import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Un servidor recién levantado por cada prueba sería medio segundo cada vez.
 *  Uno solo alcanza: ninguna de estas pruebas escribe nada. */
let cliente;

test.before(async () => {
  cliente = new Client({ name: "pruebas-ares", version: "1.0.0" });
  await cliente.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "./mcp/registrar.mjs", "mcp/servidor.ts"],
      cwd: process.cwd(),
      // A propósito SIN ORS_API_KEY: así se puede probar que la falta de clave
      // se dice con todas las letras, y así estas pruebas no dependen de que
      // exista un .env.local en la máquina que las corre.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    }),
  );
});

test.after(async () => {
  await cliente?.close();
});

// ---------------------------------------------------------------------------
// Qué expone
// ---------------------------------------------------------------------------

test("expone las tools que sobrevivieron a la medición", async () => {
  // El plan tenía un geocodificador con cascada IDE Chile → Photon. IDE Chile se
  // cayó porque no tiene API REST de geocodificación, y Photon porque devolvió
  // housenumber null en las 26 direcciones de Arica que se le pidieron. Ver
  // scripts/sondear-proveedores.
  const { tools } = await cliente.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["encode_plus_code", "get_route_ch", "resolve_plus_code"],
  );
});

test("todas declaran esquema de SALIDA, no solo de entrada", async () => {
  // Es lo que hace cumplir por protocolo la regla del servidor: toda respuesta
  // de ubicación es lat/lng. Sin outputSchema, un día alguien devuelve una
  // dirección de texto y nada lo impide.
  const { tools } = await cliente.listTools();
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} no declara outputSchema`);
    assert.equal(t.outputSchema.type, "object");
  }
});

test("ninguna salida de ubicación promete una dirección de texto", async () => {
  const { tools } = await cliente.listTools();
  const plus = tools.find((t) => t.name === "resolve_plus_code");
  const campos = Object.keys(plus.outputSchema.properties);

  assert.ok(campos.includes("lat") && campos.includes("lng"));
  assert.ok(
    !campos.some((c) => /direccion|address|calle|etiqueta/i.test(c)),
    `la salida trae un campo de dirección de texto: ${campos.join(", ")}`,
  );
});

test("solo es obligatorio lo que de verdad no tiene default", async () => {
  const { tools } = await cliente.listTools();
  const porNombre = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(porNombre.resolve_plus_code.inputSchema.required, ["codigo"]);
  assert.deepEqual(porNombre.encode_plus_code.inputSchema.required, ["punto"]);
  assert.deepEqual(porNombre.get_route_ch.inputSchema.required, ["puntos"]);
});

// ---------------------------------------------------------------------------
// encode_plus_code: la otra mitad
// ---------------------------------------------------------------------------

test("un punto vuelve como código dictable", async () => {
  const r = await cliente.callTool({
    name: "encode_plus_code",
    arguments: { punto: { lat: -18.4783, lng: -70.3126 } },
  });

  assert.ok(!r.isError);
  assert.match(r.structuredContent.codigo, /^[23456789CFGHJMPQRVWX]+\+[23456789CFGHJMPQRVWX]+$/);
  // Once dígitos por defecto: la puerta, no la cuadra.
  assert.ok(
    r.structuredContent.precision_metros < 5,
    `el largo por defecto dio ${r.structuredContent.precision_metros} m`,
  );
});

test("codificar avisa DÓNDE cae el código, que no es exactamente lo que entró", async () => {
  // Un Plus Code es un recuadro, no un punto: codificar redondea. Sin devolver
  // el centro, quien lo use creería que apunta exacto a lo que mandó.
  const punto = { lat: -18.47831, lng: -70.31264 };
  const r = await cliente.callTool({ name: "encode_plus_code", arguments: { punto } });

  const { lat, lng, precision_metros } = r.structuredContent;
  assert.ok(Number.isFinite(lat) && Number.isFinite(lng));
  const desvio = Math.hypot((lat - punto.lat) * 111320, (lng - punto.lng) * 111320 * Math.cos(punto.lat * Math.PI / 180));
  assert.ok(desvio <= precision_metros, `el código cayó a ${desvio} m, más que su propia precisión`);
});

test("el viaje de ida y vuelta entre las dos tools no mueve la casa", async () => {
  // Es el uso de verdad: se marca la casa, se guarda el código, y mañana se lee.
  const punto = { lat: -18.4712, lng: -70.2899 }; // Quinsachata 1749, puerta real
  const ida = await cliente.callTool({ name: "encode_plus_code", arguments: { punto } });
  const vuelta = await cliente.callTool({
    name: "resolve_plus_code",
    arguments: { codigo: ida.structuredContent.codigo },
  });

  const s = vuelta.structuredContent;
  const metros = Math.hypot(
    (s.lat - punto.lat) * 111320,
    (s.lng - punto.lng) * 111320 * Math.cos(punto.lat * (Math.PI / 180)),
  );
  assert.ok(metros < 3, `la casa se movió ${metros.toFixed(1)} m entre las dos tools`);
});

test("un punto imposible lo ataja el esquema, no el código", async () => {
  const r = await cliente
    .callTool({ name: "encode_plus_code", arguments: { punto: { lat: 999, lng: 0 } } })
    .catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));

  assert.equal(r.isError, true);
});

// ---------------------------------------------------------------------------
// resolve_plus_code, por el protocolo
// ---------------------------------------------------------------------------

test("un código completo vuelve como coordenadas de Arica", async () => {
  const r = await cliente.callTool({
    name: "resolve_plus_code",
    arguments: { codigo: "57HFGMCP+MX" },
  });

  assert.ok(!r.isError);
  const s = r.structuredContent;
  assert.equal(s.era_corto, false);
  assert.ok(Math.abs(s.lat - -18.4783) < 0.01, `latitud ${s.lat} no es de Arica`);
  assert.ok(Math.abs(s.lng - -70.3126) < 0.01, `longitud ${s.lng} no es de Arica`);
  assert.ok(s.precision_metros > 0);
});

test("un código corto dictado con la ciudad al lado también entra", async () => {
  // "GMCP+MX, Arica" es la forma en que la gente lo comparte. La ciudad se
  // descarta: el servidor no geocodifica texto ni acá ni en ningún lado.
  const r = await cliente.callTool({
    name: "resolve_plus_code",
    arguments: { codigo: "gmcp+mx, Arica" },
  });

  assert.equal(r.structuredContent.era_corto, true);
  assert.equal(r.structuredContent.codigo_completo, "57HFGMCP+MX");
});

test("un código inválido es un error CONTESTADO, no una excepción", async () => {
  // isError:true le dice al modelo "esto no se pudo, probá otra cosa". Un throw
  // se le presentaría como una falla del servidor.
  const r = await cliente.callTool({
    name: "resolve_plus_code",
    arguments: { codigo: "ABCD+EF" },
  });

  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /no es un Plus Code válido/i);
  assert.match(r.content[0].text, /23456789CFGHJMPQRVWX/, "el error no dice cuál es el alfabeto");
});

test("una entrada que viola el esquema la ataja el protocolo", async () => {
  const r = await cliente
    .callTool({ name: "resolve_plus_code", arguments: { codigo: 42 } })
    .catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));

  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /validation|inválid|invalid/i);
});

// ---------------------------------------------------------------------------
// get_route_ch
// ---------------------------------------------------------------------------

test("sin ORS_API_KEY se dice qué falta y dónde se pone", async () => {
  // Un mensaje de "no se pudo" a secas manda a buscar el problema a la red.
  const r = await cliente.callTool({
    name: "get_route_ch",
    arguments: {
      puntos: [
        { lat: -18.4712, lng: -70.2899 },
        { lat: -18.4785, lng: -70.3132 },
      ],
    },
  });

  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /ORS_API_KEY/);
  assert.match(r.content[0].text, /NEXT_PUBLIC_/, "no advierte que la clave no sale al teléfono");
});

test("una ruta de un punto solo la rechaza el esquema", async () => {
  const r = await cliente
    .callTool({
      name: "get_route_ch",
      arguments: { puntos: [{ lat: -18.4712, lng: -70.2899 }] },
    })
    .catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));

  assert.equal(r.isError, true);
});

test("el trazado completo NO viene por defecto", async () => {
  // Son miles de pares que nadie lee y que llenan el contexto del modelo. La
  // cantidad se informa igual, para que se pueda pedir a sabiendas.
  const { tools } = await cliente.listTools();
  const ruta = tools.find((t) => t.name === "get_route_ch");

  assert.equal(ruta.inputSchema.properties.incluir_geometria.default, false);
  assert.ok(
    ruta.outputSchema.required?.includes("puntos_geometria") ??
      Object.keys(ruta.outputSchema.properties).includes("puntos_geometria"),
    "no se informa cuántos puntos tiene el trazado que no se mandó",
  );
});
