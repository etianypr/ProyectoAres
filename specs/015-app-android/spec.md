# Feature Specification: App Android del conductor (APK)

**Feature Branch**: `015-app-android` · **Created**: 2026-10-24 · **Status**: Draft

**Input**: "El enfoque cambió: ahora tenemos la libertad de trabajar en Android, una APK sería
excelente." · Decisiones del dueño (2026-10-24): APK con funciones nativas que abre la misma app
publicada (se actualiza sola); se instala con el archivo, sin Google Play; después de una llamada
la app sabe sola si el cliente contestó. Prioridad: generar la mejor ruta y llamar más fácil
(WhatsApp en pausa, spec 013).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instalar la app y repartir como hoy (Priority: P1)

Como conductor, quiero instalar la app en mi Android con un archivo y abrirla como cualquier
app, para trabajar el día sin navegador, también donde la señal falla.

**Why this priority**: es la base de todo lo demás; sin la app instalada no hay funciones nativas.

**Independent Test**: instalar el archivo en un Android, iniciar sesión, cargar pedidos, generar
la ruta y marcar entregas; cerrar la app, apagar los datos y volver a abrirla: muestra el día.

**Acceptance Scenarios**:

1. **Given** el archivo de la app, **When** el conductor lo instala, **Then** aparece "ARES" con su ícono y abre en pantalla completa en la pantalla de inicio de sesión.
2. **Given** una sesión iniciada, **When** abre la app otro día, **Then** entra directo a la ruta del día sin volver a iniciar sesión.
3. **Given** un cambio publicado en la app web, **When** el conductor abre la app, **Then** ve la versión nueva sin reinstalar nada.
4. **Given** que ya abrió la app con señal ese día, **When** la abre sin señal, **Then** ve la ruta y los pedidos del día y puede marcar resultados; lo pendiente de enviar sale al volver la señal.

---

### User Story 2 - Llamar con un toque y que la app sepa si contestó (Priority: P1)

Como conductor, quiero tocar "Llamar" y que la llamada salga al tiro, y al volver que la app ya
sepa si el cliente contestó, para no perder toques ni tiempo en cada parada.

**Why this priority**: con WhatsApp en pausa, la llamada es el único contacto con el cliente y
es lo que más se repite en el día.

**Independent Test**: llamar a 3 números de prueba (uno contesta, uno no contesta, uno rechaza):
cada llamada sale con un toque y al volver la app marca "contestó" o "no contestó" sola.

**Acceptance Scenarios**:

1. **Given** una parada con teléfono, **When** toca "Llamar", **Then** la llamada sale directo, sin pasar por el marcador.
2. **Given** que el cliente contestó y hablaron, **When** termina la llamada y vuelve a la app, **Then** la parada queda "contestó" sin que el conductor toque nada.
3. **Given** que nadie contestó o la llamada se cortó sin conversación, **When** vuelve a la app, **Then** queda "no contestó" y se ofrecen las salidas de siempre (dejar pendiente / no entregado).
4. **Given** un resultado detectado equivocado (por ejemplo, contestó el buzón de voz), **When** el conductor lo corrige, **Then** basta un toque y vale la corrección.
5. **Given** "Pedido finalizado", **When** hay una parada siguiente con teléfono, **Then** la app ofrece "Llamar a [nombre]" como botón principal; no llama sola.
6. **Given** que el conductor no dio permiso de llamadas o de registro de llamadas, **When** toca "Llamar", **Then** se abre el marcador como hoy y después pregunta "¿Contestó?" con los botones de siempre.

---

### User Story 3 - Escanear la etiqueta con el lector del teléfono (Priority: P2)

Como conductor, quiero escanear el código de barras de la etiqueta de Starken rápido y sin señal,
para que la carga rápida (spec 005) encuentre el pedido.

**Why this priority**: lo necesita la spec 005; sin ella no aporta por sí sola.

**Independent Test**: escanear 20 etiquetas reales sin señal: cada código se lee en menos de 1 s
y coincide con el impreso.

**Acceptance Scenarios**:

1. **Given** la pantalla de escaneo, **When** apunta a una etiqueta, **Then** el código se lee solo, sin apretar nada, y la app recibe los 26 dígitos.
2. **Given** una etiqueta arrugada o con reflejo, **When** no se lee en 5 s, **Then** se ofrece escribir el código a mano.
3. **Given** sin permiso de cámara, **When** se abre el escáner, **Then** la app explica cómo darlo y ofrece escribir el código.

---

### User Story 4 - Pantalla encendida y ubicación durante la ruta (Priority: P2)

Como conductor, quiero que la pantalla no se apague mientras manejo con la ruta abierta y que la
ubicación sea precisa, para seguir la navegación sin tocar el teléfono.

**Why this priority**: hoy la pantalla se apaga sola a mitad de camino y hay que desbloquear.

**Independent Test**: con la ruta en curso y el teléfono quieto 15 min, la pantalla sigue
encendida; al cerrar el día vuelve a apagarse sola.

**Acceptance Scenarios**:

1. **Given** una ruta en curso y la app en primer plano, **When** pasa el tiempo de apagado del teléfono, **Then** la pantalla sigue encendida.
2. **Given** el día cerrado o la app en segundo plano, **When** pasa ese tiempo, **Then** la pantalla se apaga como siempre.
3. **Given** la navegación abierta, **When** el conductor se mueve, **Then** el punto en el mapa sigue su posición con la precisión del GPS del teléfono.

---

### User Story 5 - Saber cuándo hay que instalar una versión nueva (Priority: P3)

Como dueño, quiero que la app avise cuando hace falta instalar un archivo nuevo, para no tener
al conductor con funciones viejas sin saberlo.

**Why this priority**: casi todos los cambios llegan solos; esto cubre solo los cambios de la parte nativa.

**Independent Test**: publicar una versión que exige una APK más nueva: la app instalada muestra
el aviso con el enlace de descarga; con la APK nueva, el aviso desaparece.

**Acceptance Scenarios**:

1. **Given** una APK más vieja que la mínima exigida, **When** abre la app, **Then** ve un aviso con el enlace para descargar la nueva y puede seguir repartiendo.
2. **Given** la APK al día, **When** abre la app, **Then** no ve ningún aviso.

### Edge Cases

- El conductor tenía el día cargado en el navegador (PWA) y pasa a la APK: los datos del teléfono
  no se comparten entre los dos. El cambio se hace con el día vacío (al empezar un día nuevo).
- Teléfono con dos SIM o número escrito distinto (con o sin +56): la llamada se empareja por los
  últimos 8 dígitos.
- Varias llamadas al mismo número: cuenta la más reciente hecha después de tocar "Llamar".
- El conductor no vuelve a la app justo después de colgar: el resultado se determina cuando vuelve.
- Llamada entrante de un cliente: no cambia el resultado de ninguna parada (solo cuentan las salientes desde la app).
- Abrir la app por primera vez sin señal: no puede entrar; se pide abrirla una vez con señal.
- La app abierta en un teléfono que no es Android (navegador): funciona como hoy, sin las funciones nativas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La app MUST instalarse en Android desde un archivo, sin tienda de aplicaciones.
- **FR-002**: La app MUST mostrar la misma app del conductor que está publicada y recibir sus cambios sin reinstalar.
- **FR-003**: La app MUST abrir sin señal y mostrar el día en curso si ya se abrió con señal antes (los pedidos ya viven en el teléfono).
- **FR-004**: "Llamar" MUST iniciar la llamada con un toque, sin pasar por el marcador, desde la parada activa y desde la lista.
- **FR-005**: Al volver de una llamada hecha desde la app, MUST determinarse si el cliente contestó según la duración de la conversación en el registro de llamadas del teléfono (≥ 5 s = contestó) y registrarse como la marca de llamada actual.
- **FR-006**: El conductor MUST poder corregir el resultado de la llamada con un toque.
- **FR-007**: Números y duraciones del registro de llamadas MUST leerse solo en el teléfono y MUST NOT enviarse a ningún servidor; al servidor sigue llegando solo lo de hoy (la primera llamada del día, sin datos del cliente).
- **FR-008**: Tras "Pedido finalizado", la app MUST ofrecer llamar a la siguiente parada con un toque y MUST NOT llamar sola.
- **FR-009**: La app MUST leer códigos de barras de etiquetas Starken con la cámara, sin señal, y entregar el código a la carga rápida (spec 005).
- **FR-010**: La pantalla MUST mantenerse encendida mientras haya ruta en curso y la app esté en primer plano.
- **FR-011**: La app MUST entregar la ubicación del GPS a la navegación mientras está abierta; MUST NOT seguir la ubicación en segundo plano.
- **FR-012**: Sin un permiso (llamadas, registro de llamadas, cámara, ubicación), cada función MUST volver al comportamiento actual del navegador sin frenar el reparto.
- **FR-013**: La app MUST avisar cuando su versión instalada es menor que la mínima exigida, con el enlace para descargar la nueva.
- **FR-014**: El panel del jefe y la app en el navegador MUST seguir funcionando igual.

### Key Entities

- **Llamada** (solo en el teléfono, no se guarda aparte): número llamado, hora en que se tocó "Llamar", duración leída del registro → resultado `contestó` / `no contestó` en `Pedido.llamada`.
- **Versión de la app**: versión instalada y versión mínima exigida (sin datos personales).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Llamar a un cliente toma 1 toque desde la parada (hoy 2: botón y marcador).
- **SC-002**: En un día de reparto, ≥ 95 % de las llamadas quedan como "contestó" o "no contestó" sin que el conductor toque nada, y ≥ 95 % de esas marcas son correctas.
- **SC-003**: Cada etiqueta se escanea en menos de 1 s, sin señal (20 etiquetas reales).
- **SC-004**: Durante una ruta de 4 h la pantalla no se apaga ni una vez.
- **SC-005**: Instalar la app desde el archivo e iniciar sesión toma menos de 5 min.
- **SC-006**: Ningún número ni duración del registro de llamadas sale del teléfono (verificado en pruebas).

## Assumptions

- Teléfono Android 10 o superior, propio del conductor (no compartido), con cámara trasera.
- Instalación por archivo, aceptando "orígenes desconocidos" una vez; sin Google Play (permite leer el registro de llamadas, que Play restringe).
- Decisión del dueño: la app nativa se hace con Capacitor y carga la app publicada en Vercel; las funciones nativas se suman encima. La web sigue siendo la misma base de código.
- Umbral "contestó": 5 s de conversación (ajustable). El buzón de voz puede contar como contestó: por eso existe la corrección de un toque.
- WhatsApp sigue en pausa (spec 013): la llamada es el canal de contacto.
- Permisos que se piden una vez: llamadas, registro de llamadas, cámara, ubicación.
- Relación: la 005 usa el escáner (FR-009); la 007 borra los datos del día también dentro de la app.
