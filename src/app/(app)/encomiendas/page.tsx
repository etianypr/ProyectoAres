import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/panel/page-header";
import { Kpi } from "@/components/ui/kpi";
import { ErrorDatos } from "@/components/ui/error-datos";
import { buttonClass } from "@/components/ui/button";
import { Package, CalendarRange, Truck, Wallet, CircleDollarSign } from "lucide-react";
import { formatCLP, formatNumber } from "@/lib/comun/format";
import { sumarDias } from "@/lib/comun/fechas";
import { rangoPeriodo, etiquetaPeriodo } from "@/lib/comun/periodo";
import { calcularIndicadores, periodoAnterior } from "@/lib/encomiendas/indicadores";
import { getPeriodo } from "@/lib/comun/periodo-servidor";
import { valorPedido } from "@/lib/encomiendas/pago";
import { aPeriodo, periodosEnRango } from "@/lib/encomiendas/periodos";
import type { ConductorOpcion } from "./agregar-dia";
import { armarDias, enCurso, resumenPorConductor, resumirPeriodos, serieDelPeriodo } from "./_resumen";
import { ReglaPago } from "./regla-pago";
import { CompararIngresos } from "./comparar-ingresos";
import { GraficoDias } from "./grafico-dias";
import { IndicadoresPeriodo } from "./_componentes/indicadores";
import { TablaDias } from "./_componentes/tabla-dias";
import { TablaConductores } from "./_componentes/tabla-conductores";

export const dynamic = "force-dynamic";
export const metadata = { title: "Encomiendas" };

export default async function EncomiendasPage() {
  // Mismo periodo global que el resto de la app: el mes/año lo fija el
  // PeriodoSelector de la barra superior (cookie "periodo"), igual que en el
  // Dashboard y en Finanzas. Esta página no monta ningún selector propio.
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);
  // El período anterior del mismo largo, para comparar los indicadores (spec 006).
  const previo = rangoPeriodo(periodoAnterior(periodo));

  const supabase = await createClient();

  // Los cortes de facturación (0034). Van primero y solos porque de ellos sale
  // el rango de la consulta de abajo: un periodo puede empezar en abril y
  // terminar en mayo, y para decir cuánto facturó hay que mirar sus días, no
  // los del mes que se está viendo.
  //
  // Se piden TODOS: la tabla es de unas pocas filas al año y el orden completo
  // es lo que fija el color de cada periodo. Filtrar por el mes en pantalla
  // haría que un mismo corte cambiara de color según desde dónde se lo mira.
  const { data: periodosData, error: errorPeriodos } = await supabase
    .from("encomienda_periodos_facturacion")
    .select("*")
    .order("fecha_inicio");

  const periodos = (periodosData ?? []).map(aPeriodo);
  // El rango que cubren TODOS los cortes. De ahí sale la consulta de sus cifras:
  // el diálogo de comparar ingresos ofrece cualquier periodo, no solo los del
  // mes en pantalla —una liquidación puede llegar con dos cortes de atraso— y
  // cada uno tiene que traer su estimado ya calculado. Van ordenados por fecha,
  // así que los extremos son el primero y el último.
  const spanPeriodos = periodos.length
    ? {
        desde: periodos[0].fecha_inicio,
        hasta: periodos.reduce((a, p) => (p.fecha_fin > a ? p.fecha_fin : a), periodos[0].fecha_fin),
      }
    : null;

  // Una fila por acción en terreno (ver 0026). Se agrupan por (conductor, día)
  // acá abajo: cada grupo que existe es, por definición, un día trabajado — un
  // día en que nadie salió no tiene filas y simplemente no aparece.
  const [
    { data: actividadData, error: errorActividad },
    { data: reglasData, error: errorReglas },
    { data: pagosData, error: errorPagos },
    { data: diasTrabajoData, error: errorDiasTrabajo },
    { data: conductoresData, error: errorConductores },
    { data: ingresosRealesData, error: errorIngresosReales },
    { data: pagosPeriodosData },
    { data: actividadPrevia },
    { data: diasPrevios },
    { data: pagosPrevios },
  ] = await Promise.all([
    supabase
      .from("encomienda_actividad")
      .select("conductor_id, fecha, tipo, origen, hora, conductor:conductores(id,nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    // Hay una sola (0031). Se pide igual porque el diálogo la necesita para
    // prellenar el formulario, y porque su ausencia es lo que bloquea el resto
    // de la pantalla.
    supabase.from("encomienda_reglas_pago").select("*").limit(1).maybeSingle(),
    // Las cifras ya congeladas de cada día del periodo. De acá salen TODOS los
    // números de plata de esta pantalla: no se recalcula nada al vuelo.
    supabase.from("encomienda_pagos").select("*").gte("fecha", desde).lte("fecha", hasta),
    // El sobre de cada día: si la ruta está en curso o ya terminó (0032).
    supabase
      .from("encomienda_jornadas")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    // Para el selector de "Agregar día": todos los conductores. En el sistema del
    // que salió este proyecto esta consulta iba por conductor_categorias, porque
    // había tres líneas de trabajo y un conductor de taxis no debía aparecer en la
    // liquidación del reparto. Acá el reparto es el único negocio.
    supabase
      .from("conductores")
      .select("id, nombre, activo"),
    // Lo que Starken liquidó de verdad. Se piden TODAS las filas y no las del
    // mes: desde la 0035 se imputan a un periodo de facturación, no a un mes, así
    // que no hay por dónde filtrarlas por el periodo global — y son unas pocas
    // por año. Las anteriores a la 0035 vienen en el mismo lote con su (año, mes)
    // y se muestran aparte, como historial.
    supabase
      .from("encomienda_ingresos_reales")
      .select("*")
      .order("created_at"),
    // Las cifras de los días que cubren los periodos, que NO son las del mes en
    // pantalla: un corte del 25 de abril al 10 de mayo se factura entero, y
    // sumarle solo los días de mayo diría poco menos de la mitad. Sin periodos
    // definidos no hay nada que sumar y no se consulta.
    spanPeriodos
      ? supabase
          .from("encomienda_pagos")
          .select("fecha, ingresos_totales, pedidos_entregados, pago_total")
          .gte("fecha", spanPeriodos.desde)
          .lte("fecha", spanPeriodos.hasta)
      : Promise.resolve({ data: [], error: null }),
    // El período anterior, solo para los indicadores: si falla, se comparan
    // contra nada y la pantalla lo dice ("sin dato del período anterior").
    supabase
      .from("encomienda_actividad")
      .select("conductor_id, fecha, tipo, origen, hora")
      .gte("fecha", previo.desde)
      .lte("fecha", previo.hasta),
    supabase.from("encomienda_jornadas").select("*").gte("fecha", previo.desde).lte("fecha", previo.hasta),
    supabase
      .from("encomienda_pagos")
      .select("conductor_id, fecha, ingresos_totales, pago_total")
      .gte("fecha", previo.desde)
      .lte("fecha", previo.hasta),
  ]);

  // Las tres primeras consultas son la plata: la actividad son los días
  // trabajados, los pagos son lo que valió cada uno y la regla es lo que se
  // está aplicando. Si CUALQUIERA falla, todo número de esta pantalla queda
  // corto sin parecerlo: sin actividad se ve un mes sin trabajo, sin pagos sale
  // "$0", sin la regla el panel se cree sin configurar. Antes los errores se
  // descartaban y el resultado era indistinguible de un mes tranquilo.
  const errorPlata = errorActividad ?? errorReglas ?? errorPagos ?? errorDiasTrabajo;
  if (errorPlata) {
    return (
      <div>
        <PageHeader
          title="Gestión de encomiendas"
          description={etiquetaPeriodo(periodo)}
        />
        <ErrorDatos
          titulo="No se pudo leer la actividad de encomiendas."
          detalle={errorPlata.message}
        />
      </div>
    );
  }

  const regla = reglasData ?? null;
  const pagos = pagosData ?? [];
  const diasTrabajo = diasTrabajoData ?? [];
  // Este NO entra en errorPlata: que falte el ingreso real no vuelve falso
  // ningún número de la pantalla —el estimado sigue siendo el estimado—, solo
  // deja sin hacer la comparación. El aviso va dentro del diálogo, donde sirve.
  const ingresosReales = ingresosRealesData ?? [];

  // Solo conductores activos: uno dado de baja no debería aparecer como opción
  // para cargarle días nuevos. Su historial y sus liquidaciones ya cargadas
  // siguen intactos — eso sale de la actividad, no de esta lista.
  const conductoresEncomiendas: ConductorOpcion[] = (conductoresData ?? [])
    .filter((c) => c.activo)
    .map((c) => ({ id: c.id, nombre: c.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const dias = armarDias(actividadData ?? [], pagos, diasTrabajo);

  // Días de CALENDARIO, no filas: con dos conductores saliendo los mismos 20
  // días, el KPI diría 40 en un mes que tiene 20. El pago sí se calcula por
  // día-conductor (cada uno cobra su fijo), pero la cifra que el dueño lee acá
  // es "cuántos días hubo reparto".
  const diasCalendario = new Set(dias.map((d) => d.fecha)).size;
  const totalEntregados = dias.reduce((a, d) => a + d.conteo.entregados, 0);
  const totalIngresos = dias.reduce((a, d) => a + (d.cifras?.ingresos_totales ?? 0), 0);
  const totalPago = dias.reduce((a, d) => a + (d.cifras?.pago_total ?? 0), 0);
  const promedioDia = diasCalendario > 0 ? totalEntregados / diasCalendario : 0;
  // Días sin cifras que NO son una ruta en curso. Un día abierto también
  // suma $0, pero eso no es un problema que reportar: es una ruta que todavía
  // está pasando y se va a contar cuando termine. Mezclarlas haría que el aviso
  // se encendiera todas las tardes.
  const diasSinCifras = dias.filter((d) => d.cifras == null && !enCurso(d)).length;
  const diasEnCurso = dias.filter(enCurso).length;

  const valorVigente = valorPedido(regla);

  const indicadores = calcularIndicadores({ actividad: actividadData ?? [], dias: diasTrabajo, pagos });
  const indicadoresPrevios = calcularIndicadores({
    actividad: actividadPrevia ?? [],
    dias: diasPrevios ?? [],
    pagos: pagosPrevios ?? [],
  });

  const serie = serieDelPeriodo(periodo, dias, periodos);

  const resumenPeriodos = resumirPeriodos(periodos, pagosPeriodosData ?? [], ingresosReales);

  // Los cortes que tocan el mes/año en pantalla: son los únicos que se pintan y
  // se listan en el gráfico — uno de marzo no tiene nada que hacer en la vista de
  // mayo. El diálogo de comparar ingresos sí ve todos.
  const resumenVisibles = periodosEnRango(resumenPeriodos, desde, hasta);

  // La comparación estimado/real ahora se hace por periodo (0035), así que el
  // KPI no puede contrastar el mes contra "lo real del mes": ya no existe tal
  // cosa. Contrasta los cortes que tocan el mes y tienen liquidación cargada
  // contra el estimado DE ESOS MISMOS cortes — las dos cifras del mismo rango de
  // días, aunque el rango se salga del mes.
  const cerrados = resumenVisibles.filter((p) => p.real != null);
  const realCerrados = cerrados.reduce((a, p) => a + (p.real ?? 0), 0);
  const estimadoCerrados = cerrados.reduce((a, p) => a + p.ingresos, 0);
  const difCerrados = realCerrados - estimadoCerrados;

  // Las liquidaciones viejas, imputadas a un mes antes de que existieran los
  // periodos. Van al diálogo como historial de solo lectura: siguen siendo plata
  // que entró y esconderlas haría parecer que se perdieron.
  const ingresosPorMes = ingresosReales.flatMap((r) =>
    r.periodo_id == null && r.anio != null && r.mes != null
      ? [{ id: r.id, anio: r.anio, mes: r.mes, monto: r.monto, nota: r.nota }]
      : [],
  );

  // Con qué fecha arranca un corte nuevo: el día siguiente al último definido,
  // para no dejar huecos sin querer. Sin ninguno todavía, el primer día del mes
  // que se está mirando.
  const sugerenciaInicio = periodos.length
    ? sumarDias(periodos[periodos.length - 1].fecha_fin, 1)
    : desde;

  const porConductor = resumenPorConductor(dias);

  return (
    <div>
      <PageHeader
        title="Gestión de encomiendas"
        description={`Ingresos, pedidos por día y liquidación del conductor · ${etiquetaPeriodo(periodo)}`}
      >
        <Link href="/encomiendas/dia" className={buttonClass({ variant: "secondary" })}>
          <CalendarRange className="h-4 w-4" />
          Actividad por día
        </Link>
        {/* Ya no hay "Nuevo pedido" desde la oficina: los pedidos los carga el
            conductor en su teléfono y no pasan por la base (ver 0026). Uno
            cargado acá no le llegaría a nadie. */}
        <CompararIngresos
          ingresos={{
            periodos: resumenPeriodos,
            // Viene elegido el último corte que toca el mes en pantalla: es el
            // que se acaba de cerrar y del que llega la liquidación. Si el mes no
            // toca ninguno, el diálogo cae en el último definido.
            periodoInicial: resumenVisibles.at(-1)?.id ?? "",
            porMes: ingresosPorMes,
            error: errorIngresosReales?.message ?? null,
          }}
        />
        <ReglaPago regla={regla} />
      </PageHeader>

      {/* Sin regla no hay cómo valorar un día: la base no le escribe cifras a
          ninguno y todo el panel queda en cero, con los días igual apareciendo
          en la tabla. Eso se lee como "no se trabajó" si no se dice. */}
      {regla == null ? (
        <div className="mb-4 rounded-[14px] border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger">
          <p className="font-medium">Falta configurar la regla de pago.</p>
          <p className="mt-0.5 text-xs">
            Hasta que la guardes no se puede calcular el ingreso de ningún día ni lo que hay que
            pagarle al conductor, y no se pueden cargar días desde la oficina. Los días que el
            teléfono registre mientras tanto quedan guardados y se calculan solos apenas configures
            la regla.
          </p>
        </div>
      ) : null}

      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ingresos estimados"
          value={formatCLP(totalIngresos)}
          valueClass="text-ok"
          // Con lo real cargado, lo que importa deja de ser el estimado y pasa
          // a ser cuánto le erró: es el número con el que se calibra el valor
          // por entrega. Se compara por periodo cerrado y no contra el mes: es
          // por corte que llega la liquidación (0035), y se dice cuántos son
          // para que no se lea como si cubriera el mes completo.
          sub={
            cerrados.length > 0
              ? `${cerrados.length} periodo${cerrados.length === 1 ? "" : "s"} cerrado${cerrados.length === 1 ? "" : "s"}: real ${formatCLP(realCerrados)} · ${difCerrados >= 0 ? "+" : "−"}${formatCLP(Math.abs(difCerrados))}`
              : periodos.length === 0
                ? `a ${formatCLP(valorVigente)} por entrega · define periodos para comparar con lo real`
                : `a ${formatCLP(valorVigente)} por entrega · carga lo real de un periodo para comparar`
          }
          subClass={
            cerrados.length === 0 ? "text-muted" : difCerrados >= 0 ? "text-ok" : "text-danger"
          }
          icon={CircleDollarSign}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Pedidos entregados"
          value={formatNumber(totalEntregados)}
          sub={
            diasCalendario > 0
              ? `${formatNumber(Math.round(promedioDia))} por día trabajado`
              : "Sin entregas en el periodo"
          }
          icon={Package}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Días trabajados"
          value={formatNumber(diasCalendario)}
          sub="Días en que el conductor salió a repartir"
          icon={Truck}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="A pagar al conductor"
          value={formatCLP(totalPago)}
          valueClass="text-warn"
          sub={
            diasSinCifras > 0
              ? `${diasSinCifras} día(s) sin calcular, no incluidos`
              : diasEnCurso > 0
                ? `${diasEnCurso} ruta(s) en curso, se suman al terminar`
                : "Por día trabajado + por pedido"
          }
          subClass={
            diasSinCifras > 0 ? "text-danger" : diasEnCurso > 0 ? "text-info" : "text-muted"
          }
          icon={Wallet}
          tint="bg-warn-bg text-warn"
        />
      </div>

      <div className="mt-4">
        <IndicadoresPeriodo actual={indicadores} anterior={indicadoresPrevios} />
      </div>

      <div className="mt-4">
        <GraficoDias
          etiqueta={etiquetaPeriodo(periodo)}
          serie={serie}
          totalEntregados={totalEntregados}
          resumen={resumenVisibles}
          periodos={periodos}
          sugerenciaInicio={sugerenciaInicio}
          errorPeriodos={errorPeriodos?.message ?? null}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <TablaDias
          dias={dias}
          conductores={conductoresEncomiendas}
          errorConductores={errorConductores?.message ?? null}
          regla={regla}
        />

        <TablaConductores porConductor={porConductor} />
      </div>
    </div>
  );
}
