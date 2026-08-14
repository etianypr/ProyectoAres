"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth";
import { s, sReq, bool } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

// Quién puede administrar la ficha de un conductor. Coincide con la policy
// choferes_write_admin_op: RLS ya frena a los demás roles.
async function puedeAdministrarChoferes(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "admin" || sesion?.rol === "operador";
}

async function esAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  return perfil?.rol === "admin";
}

// Origen del sitio para el link del correo de invitación. Se puede fijar
// con NEXT_PUBLIC_SITE_URL (recomendado en producción); si no, se deriva de
// los headers de la request (funciona igual en local y en cada deploy).
async function obtenerOrigen(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  return `${proto}://${hdrs.get("host")}`;
}

export async function guardarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = s(formData.get("id"));
  const nombre = sReq(formData.get("nombre"));
  if (!nombre) return { error: "El nombre del chofer es obligatorio." };

  // La licencia se gestiona aparte (en la ficha), no aquí, para no sobrescribirla.
  const values = {
    nombre,
    rut: s(formData.get("rut")),
    telefono: s(formData.get("telefono")),
    activo: bool(formData.get("activo")),
    notas: s(formData.get("notas")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("choferes").update(values).eq("id", id)
    : await supabase.from("choferes").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/choferes");
  revalidatePath("/");
  // Al crear, vuelve a la lista; al editar inline, se queda en el acordeón.
  if (!id) redirect("/choferes");
  return { ok: true };
}

// Borrado total: elimina al conductor. Sus días de reparto y sus liquidaciones
// NO se borran — quedan con chofer_id en null (on delete set null), así que los
// ingresos históricos siguen cuadrando aunque ya no se sepa quién los hizo. Para
// "ya no trabaja aquí" sin perder el nombre, usar desactivarChofer.
export async function eliminarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };

  // Guardia explícita, no decorativa: más abajo esta acción usa la llave
  // service_role, que se salta RLS por completo. Sin este chequeo cualquier
  // usuario con sesión (un chofer, por ejemplo) podía invocar esta Server
  // Action por POST — las Server Actions son endpoints POST de la ruta donde
  // se usan, no las protege el proxy — y aunque RLS frenaba el DELETE de la
  // fila EN SILENCIO (0 filas afectadas, sin error), el borrado de la cuenta
  // de Auth sí se ejecutaba.
  if (!(await puedeAdministrarChoferes())) {
    return { error: "No tienes permiso para eliminar choferes." };
  }

  const supabase = await createClient();

  // Si tenía cuenta vinculada, se guarda el user_id ANTES de borrar la fila
  // (después ya no habría cómo encontrarlo).
  const { data: chofer } = await supabase
    .from("choferes")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("choferes").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };

  // Borra también la cuenta de acceso (Auth): si no, el correo queda
  // "ocupado" para siempre y no se puede volver a invitar a nadie con él.
  if (chofer?.user_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(chofer.user_id);
  }

  revalidatePath("/choferes");
  revalidatePath("/");
  redirect("/choferes");
}

// El chofer deja de trabajar, pero se conserva junto con su historial.
export async function desactivarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("choferes").update({ activo: false }).eq("id", id);
  if (error) return { error: `No se pudo desactivar: ${error.message}` };
  revalidatePath("/choferes");
  revalidatePath("/");
  return { ok: true };
}

// Antes de eliminar, se consulta al vuelo si el conductor tiene días de reparto
// registrados, para decidir qué advertencia mostrar en el diálogo.
//
// Se pregunta por la actividad y no por las liquidaciones: la actividad es lo
// primero que existe (un día con eventos pero con la jornada abierta todavía no
// tiene fila de pago), así que es la señal que se enciende antes.
export async function tieneHistorialChofer(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("encomienda_actividad")
    .select("id", { count: "exact", head: true })
    .eq("chofer_id", id);
  return (count ?? 0) > 0;
}

// Actualiza la licencia del chofer (sus clases, número y única fecha de vencimiento).
export async function actualizarLicencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el chofer." };

  const values = {
    licencia_numero: s(formData.get("licencia_numero")),
    licencia_clase: s(formData.get("licencia_clase")),
    licencia_vencimiento: s(formData.get("licencia_vencimiento")),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("choferes").update(values).eq("id", id);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/choferes");
  revalidatePath("/");
  return { ok: true };
}

// Guarda la URL de la foto de perfil del chofer (subida desde el navegador).
export async function actualizarFotoChofer(formData: FormData) {
  const id = sReq(formData.get("id"));
  const foto_url = s(formData.get("foto_url"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("choferes").update({ foto_url }).eq("id", id);
  revalidatePath(`/choferes/${id}`);
  revalidatePath("/choferes");
}

export type InvitarState = { error?: string; ok?: boolean; link?: string };

// El link se GENERA (generateLink) en vez de mandarse solo por correo
// (inviteUserByEmail): así no depende del envío de emails de Supabase, que
// en el plan gratuito tiene un límite bajo y se agota rápido si se prueba
// varias veces seguidas ("email rate limit exceeded"). El admin copia el
// link y se lo manda al chofer por donde prefiera (WhatsApp, correo, SMS).
async function generarLinkAcceso(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "invite" | "recovery",
  email: string,
  nombre?: string,
): Promise<{ link?: string; userId?: string; error?: string }> {
  const origen = await obtenerOrigen();
  const { data, error } = await admin.auth.admin.generateLink({
    type: tipo,
    email,
    options: {
      redirectTo: `${origen}/set-password`,
      ...(nombre ? { data: { nombre } } : {}),
    },
  });
  if (error || !data.properties?.action_link) {
    return { error: error?.message ?? "No se pudo generar el link." };
  }
  return { link: data.properties.action_link, userId: data.user?.id };
}

// Invita al chofer: genera su cuenta (si el correo no existía) y deja el
// link de acceso listo para copiar. Solo admin: crea credenciales de
// acceso, más sensible que el resto de la ficha (que admin/operador ya
// pueden editar).
export async function invitarChofer(
  _prev: InvitarState,
  formData: FormData,
): Promise<InvitarState> {
  const id = sReq(formData.get("id"));
  const email = sReq(formData.get("email")).toLowerCase();
  if (!id) return { error: "Falta el chofer." };
  if (!email) return { error: "Ingresa un correo." };

  const supabase = await createClient();
  if (!(await esAdmin(supabase))) {
    return { error: "Solo un administrador puede invitar choferes." };
  }

  const { data: chofer } = await supabase
    .from("choferes")
    .select("nombre, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!chofer) return { error: "Chofer no encontrado." };
  if (chofer.user_id) return { error: "Este chofer ya tiene una cuenta vinculada." };

  const admin = createAdminClient();

  // Detecta si ese correo ya tiene cuenta en el sistema ANTES de intentar
  // crear una nueva — evita un error genérico de Supabase y explica qué pasa.
  const { data: existentes } = await admin.auth.admin.listUsers();
  const yaExiste = existentes?.users.find((u) => u.email?.toLowerCase() === email);
  if (yaExiste) {
    const { data: otroChofer } = await supabase
      .from("choferes")
      .select("id, nombre")
      .eq("user_id", yaExiste.id)
      .maybeSingle();
    if (otroChofer) {
      return { error: `Ese correo ya está vinculado al chofer "${otroChofer.nombre}".` };
    }
    return {
      error:
        "Ese correo ya tiene una cuenta en el sistema (no vinculada a ningún chofer). Usa otro correo.",
    };
  }

  const resultado = await generarLinkAcceso(admin, "invite", email, chofer.nombre);
  if (resultado.error || !resultado.userId) {
    return { error: `No se pudo invitar: ${resultado.error}` };
  }

  // handle_new_user() crea el perfil como "operador" por defecto: se corrige a "chofer".
  const { error: errRol } = await admin
    .from("perfiles")
    .update({ rol: "chofer" })
    .eq("id", resultado.userId);
  if (errRol) {
    return { error: `Cuenta creada, pero no se pudo asignar el rol: ${errRol.message}` };
  }

  const { error: errLink } = await supabase
    .from("choferes")
    .update({ email, user_id: resultado.userId })
    .eq("id", id);
  if (errLink) {
    return { error: `Cuenta creada, pero no se pudo vincular al chofer: ${errLink.message}` };
  }

  revalidatePath("/choferes");
  return { ok: true, link: resultado.link };
}

// Regenera el link de acceso de un chofer YA vinculado (link vencido, se
// perdió, o nunca le llegó). Usa "recovery" en vez de "invite" porque la
// cuenta ya existe — "invite" es solo para crearla la primera vez.
export async function reenviarInvitacionChofer(choferId: string): Promise<InvitarState> {
  const supabase = await createClient();
  if (!(await esAdmin(supabase))) {
    return { error: "Solo un administrador puede reenviar el acceso." };
  }

  const { data: chofer } = await supabase
    .from("choferes")
    .select("email, user_id")
    .eq("id", choferId)
    .maybeSingle();
  if (!chofer?.user_id || !chofer.email) {
    return { error: "Este chofer no tiene una cuenta vinculada todavía." };
  }

  const admin = createAdminClient();
  const resultado = await generarLinkAcceso(admin, "recovery", chofer.email);
  if (resultado.error) return { error: `No se pudo generar el link: ${resultado.error}` };

  return { ok: true, link: resultado.link };
}

// NO HAY CATEGORÍAS DE CONDUCTOR. En el sistema del que salió este proyecto cada
// chofer se marcaba con sus líneas de trabajo (operación, taxis, encomiendas) y
// esa marca decidía si aparecía en el selector de liquidación y si podía abrir la
// app. Acá el único negocio es el reparto: la marca no distinguía a nadie y sí
// era un paso que, olvidado, dejaba a un conductor recién contratado fuera de la
// liquidación sin ningún error visible. Quien está en esta tabla, reparte.
