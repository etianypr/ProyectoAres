# 029 · Barrer la nómina de reparto con la cámara

Estado: hecha (falta día real) · paso 1 del flujo («Cargar la guía») · dueño, 2026-11-10/11.

## Qué y por qué
- Starken entregó las órdenes de flete corruptas, y la nómina de reparto (el rollo impreso de la
  sucursal) es muy larga para sacarle fotos. «Cargar la guía» suma una tercera opción, junto a
  «Sacar foto» y «Galería»: **«Barrer la nómina»**. Se pasa el teléfono despacio por el rollo y la
  cámara en vivo lee cada encargo.
- **La nómina trae el nombre del destinatario** (la guía no). El barrido la lee solo en el teléfono,
  con ML Kit, sin IA ni red, y a las líneas de la guía pasan solo la OF y la dirección. Por fotos,
  con la IA encendida, la nómina iría a Anthropic y a Cloud Vision: falta decidirlo (abajo).

## Lo decidido
- **Formato** (`lectura/nomina.ts`): un bloque por encargo: la fila «OF TOTAL DOCTOS BULTOS
  DESTINATARIO COMUNA», «DIRECCION» y la dirección, y el pie «VALOR $ FORMA PAGO DD». Se toman la OF
  (a lo más 9 dígitos: ML Kit a veces le pega el TOTAL) y la dirección; el nombre no se lee. Un
  bloque cortado en el borde del cuadro no se toma.
- **La OF se decide dígito por dígito** (`lectura/barrido-nomina.ts`; dueño: «tiene que demorarse
  más en procesar cuál número es»; primer barrido: 49 de 99 OF con un dígito distinto):
  - las lecturas de un encargo se juntan (≤ 2 dígitos distintos, misma dirección, nunca en el mismo
    cuadro, así dos OF reales parecidas no se mezclan);
  - cada dígito se vota aparte y la OF queda firme con ≥ 3 votos y 2 de cada 3 en cada posición;
  - un dígito con confianza de ML Kit bajo `CONFIANZA_MINIMA` (0,5) no vota.
- **En pantalla** (dueño): un recuadro por encargo entero con su OF arriba, punteado («…») mientras
  se lee; verde con ✓ solo los 2 s al confirmarse y después una línea fina («no me confunde el
  progreso»). Abajo: si está leyendo, cuántas van y la última confirmada. Tic y vibración al
  confirmar; linterna.
- **Los recuadros los dibuja Android** (`MarcasEscaner.java`, `EscanerVivo.marcar`): un redibujo de
  la WebView con la cámara encendida es caro.
- **Lo que no quedó firme** llega a la revisión como «⚠ Por confirmar» (`LineaGuia.porConfirmar`):
  se mira en el papel y se confirma con ✓; «Crear N pedidos» espera. El origen es `guia_foto`.

## Medido en el V2430 (2026-11-11)
- Con la foto en alta abierta (como la 028), los cuadros de análisis bajan a **720×960**. El barrido
  abre la cámara sin ella (`iniciar({ captura: false })`): **1080×1920**, ~123 ms por cuadro.
- **La traba** no era el mapa: era la pantalla del día invisible detrás de la cámara
  (`visibility: hidden`). Con un texto que cambia cada 0,5 s: 154–194 cuadros en 6 s y trabas de
  1–5 s; quitándola (`display: none`, clase `camara-sola`, solo el barrido) 333–358 y ninguna.

## Falta para el día real
- [ ] APK 1.7.0 (tag `apk-v1.7.0`) y, el dueño, instalarla y subir `APK_VERSION_MINIMA` en Vercel.
  Sin ella el botón no aparece (`barridoDisponible`).
- [ ] Barrer una nómina real en la APK y compararla con el papel: OF confirmadas, alguna con un número
  equivocado, si los recuadros calzan con cada encargo.
- [ ] Ajustar `CONFIANZA_MINIMA` con el % de dígitos de poca confianza (Diagnóstico → «Probar barrido
  de nómina» → «Copiar anonimizado»).
- [ ] Decidir (dueño): si la nómina se puede cargar por fotos (con la IA lleva los nombres), y si la
  028 usa también `camara-sola` y cuadros sin la foto en alta (probable arreglo de su traba).
- Después: la nómina trae los bultos de cada OF (sirven para la ruta, spec 024); hoy no se usan.
