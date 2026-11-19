// Los tipos del barrido de la nómina (specs 029, 034 y 036). Aparte de barrido-nomina.ts,
// que los reexporta, para no pasar de 400 líneas (A7).

/** `abiertos`: direcciones que llegaron al borde del cuadro sin cerrarse (pueden venir
 *  cortadas): solo cuentan si se parecen a una cerrada, o si nunca hubo otra (spec 034). */
type VotosOf = {
  cuadros: number[];
  orden: number;
  destinos: Record<string, number>;
  digitos: number[];
  abiertos?: Record<string, number>;
  /** El reloj del barrido (`VotosNomina.reloj`) en su último cuadro: lo por confirmar que
   *  no vuelve a salir en VENCE_MS deja de estar (spec 036). No viene en votos de antes. */
  visto?: number;
  /** La columna BULTOS de su fila → cuántas veces se leyó así (spec 036). */
  bultos?: Record<string, number>;
  /** Solo al medir otras reglas en Diagnóstico (spec 036): por dígito, la suma del peso de
   *  su confianza (`pesoDeConfianza`) y cuántas veces salió con CONFIANZA_ALTA o más. */
  pesos?: number[];
  altos?: number[];
};

/** Cómo queda firme cada dígito de la OF (spec 036). «dosDeTres» es la de siempre y la única
 *  en vivo; las otras se miden en Diagnóstico sobre el mismo barrido: «confianza06» cuenta
 *  solo los dígitos leídos con CONFIANZA_ALTA, y «ponderada» pesa cada voto por su
 *  confianza. */
export type ReglaFirme = "dosDeTres" | "confianza06" | "ponderada";

export type VotosNomina = {
  cuadros: number;
  /** Por número leído (cada lectura distinta aparte): los cuadros en que salió, en
   *  qué orden apareció, cada destino leído (en JSON, como en votos.ts) y, por
   *  posición, en cuántas lecturas votó ese dígito (las de poca confianza no). */
  ofs: Record<string, VotosOf>;
  /** Cuántos encargos enteros, OF sueltas y direcciones sin cerrar se leyeron (spec 034):
   *  dice cuánto del barrido llega por piezas. No viene en votos guardados antes. */
  conteo?: { enteros: number; sueltas: number; abiertas: number };
  /** Por número leído, cuántas veces salió arriba de cada otro en un mismo cuadro: con eso
   *  se ordenan los encargos como van en la hoja (ordenEnLaHoja). No viene en votos
   *  guardados antes. */
  arriba?: Record<string, Record<string, number>>;
  /** Los números del último cuadro, de arriba abajo. */
  delUltimo?: string[];
  /** Por número leído, qué fila de OF salió justo debajo en un mismo cuadro (encargos
   *  enteros y piezas juntos) y a cuántos altos de fila, las últimas 8 veces: con eso se ven
   *  los encargos que la cámara se saltó (rumbo-nomina.ts, spec 036). No viene en votos de
   *  antes. */
  vecinos?: Record<string, Record<string, number[]>>;
  /** Dígitos de OF leídos y cuántos con poca confianza: para ajustar CONFIANZA_MINIMA. */
  digitosLeidos: number;
  digitosDudosos: number;
  /** Los totales leídos y cuántas veces: el TOTAL BULTOS del pie de la nómina (spec 036) o
   *  el MONTO NETO de la guía, que es la cantidad de paquetes. */
  totales: Record<string, number>;
  /** Números de 7 a 10 dígitos de cada cuadro, estén o no en un bloque entero: si la
   *  nómina trae otro formato, aquí se ve que las OF sí se leen. */
  numeros: Record<string, number>;
  /** El último cuadro con texto y el último con un bloque entero (OF y dirección):
   *  dicen si la cámara está leyendo. -1 si ninguno. */
  ultimoConTexto: number;
  ultimoConLineas: number;
  /** Los ms de cámara leyendo hasta el último cuadro (spec 036): cada cuadro suma lo que
   *  pasó desde el anterior, con tope, así que con el celular bloqueado no corre. */
  reloj?: number;
};

export type LineaNomina = {
  of: string;
  destino: string | null;
  /** Cuadros en que salió su bloque, con todas sus lecturas. */
  cuadros: number;
  /** Cada dígito salió igual en VOTOS_PARA_FIRME cuadros y en 2 de cada 3 lecturas. */
  firme: boolean;
  destinoFirme: boolean;
  /** Lecturas distintas del número que se juntaron aquí (errores del lector). */
  lecturas: number;
  /** La columna BULTOS, si se leyó igual las veces que pide VOTOS_BULTOS; null si no se
   *  sabe (spec 036). */
  bultos: number | null;
};

/** Una OF del barrido para la lista y para «Cargar la guía» (spec 034). `aMedias`: se vio
 *  pero no entera, y antes se perdía en silencio: sin su dirección (`sinDireccion`) o en un
 *  solo cuadro (`unaVez`). `porConfirmar`: número o dirección sin firmar. */
type EstadoLista = "firme" | "porConfirmar" | "aMedias";
export type LineaListada = {
  of: string;
  destino: string | null;
  estado: EstadoLista;
  motivo?: "sinDireccion" | "unaVez";
  /** El número quedó firme (la dirección puede seguir dudosa): no hay que volver a pasar. */
  ofFirme: boolean;
  bultos: number | null;
  /** Cifras para Diagnóstico, sin datos: en cuántos cuadros salió, cuántas lecturas
   *  distintas se juntaron y cómo es el encargo de número más parecido (un duplicado se
   *  ve como pocos dígitos de diferencia, nunca en el mismo cuadro; solo se calcula con
   *  `cerca`). */
  cuadros: number;
  lecturas: number;
  cerca: { digitos: number; mismoCuadro: boolean; mismaDireccion: boolean | null } | null;
};

export type ResultadoNomina = {
  cuadros: number;
  /** Las OF vistas en 2 cuadros o más, firmes y por confirmar, en el orden de la nómina. */
  lineas: LineaNomina[];
  /** Todo lo visto en el orden de la nómina, con lo «a medias» (spec 034, ideas B y D). */
  lista: LineaListada[];
  firmes: number;
  porConfirmar: number;
  /** Vistas en un solo cuadro: ruido o una que pasó muy rápido. */
  unaVez: number;
  /** OF sueltas (sin dirección) que calzaban con dos encargos y no votaron por ninguno. */
  ambiguas: number;
  /** Números sin ninguna dirección vistos menos de VOTOS_PARA_FIRME veces: no se listan. */
  ruido: number;
  /** Encargos que eran una mala lectura de otro ya firme: no se listan. */
  malLeidas: number;
  /** Firmes que parecen la misma fila leída de dos formas: quedan por confirmar. */
  dobles: number;
  /** Por confirmar que no volvieron a salir en VENCE_MS de cámara leyendo: no se listan
   *  ni pasan a la guía (spec 036). */
  vencidas: number;
  conteo: { enteros: number; sueltas: number; abiertas: number };
  /** Lecturas que traían algún dígito distinto de la OF que quedó. */
  lecturasCorregidas: number;
  /** El total de la boleta (TOTAL BULTOS, o el MONTO NETO de una guía), leído igual dos
   *  veces o más; null si no. */
  total: number | null;
  /** Los bultos de las OF leídas (las de `firmes`), con 1 si su columna no se leyó; y
   *  cuántas de esas no se leyeron (para Diagnóstico). Es lo que se compara con `total`. */
  bultos: { leidos: number; sinLeer: number };
  numerosFirmes: number;
  /** De los dígitos de OF leídos con su confianza, cuántos no votaron (bajo
   *  CONFIANZA_MINIMA). 0 de 0 con una APK que no manda la confianza. */
  digitosLeidos: number;
  digitosDudosos: number;
  /** Cada número leído → la OF que quedó para su bloque: un cuadro que leyó mal un
   *  dígito de una OF confirmada la marca igual, con el número bueno. */
  deLectura: Record<string, string>;
};
