// Qué le pasó a una llamada de Supabase Auth, en palabras del conductor (spec 033,
// login-senal y link-vencido). Pura: recibe el error tal como lo devuelve
// supabase-js (o lo que lanzó el fetch) y no lo muestra nunca en inglés.
//
// Antes cualquier falla del login decía «Correo o contraseña incorrectos», también
// con Supabase pausado o sin señal, y el conductor volvía a escribir la clave buena.

/** Lo mínimo que se mira de un error de Auth (AuthError de supabase-js, o un
 *  TypeError del fetch). Nunca se mira el correo ni nada que escribió la persona. */
export type ErrorAuth =
  | {
      name?: string;
      status?: number;
      code?: string;
      message?: string;
    }
  | null
  | undefined;

export type TipoErrorAuth = "credenciales" | "red" | "limite" | "sesion" | "otro";

const SIN_SENAL = "Sin señal. Intenta de nuevo.";

export function tipoErrorAuth(error: ErrorAuth): TipoErrorAuth {
  if (!error) return "otro";
  const { name = "", status, code = "" } = error;
  if (status === 429 || code.startsWith("over_") || code === "over_request_rate_limit") return "limite";
  // supabase-js marca así un fetch que no llegó (status 0) o un 502/503/504.
  if (name === "AuthRetryableFetchError" || name === "TypeError" || status === 0) return "red";
  if (typeof status === "number" && status >= 500) return "red";
  if (code === "request_timeout" || code === "hook_timeout") return "red";
  if (code === "invalid_credentials" || code === "email_not_confirmed" || code === "user_banned") return "credenciales";
  if (
    code === "session_not_found" ||
    code === "session_expired" ||
    code === "bad_jwt" ||
    code === "otp_expired" ||
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used" ||
    name === "AuthSessionMissingError" ||
    status === 401 ||
    status === 403
  ) {
    return "sesion";
  }
  if (status === 400) return "credenciales";
  return "otro";
}

/** El login (`login` en acciones.ts). Lo que no es red ni límite es la clave. */
export function mensajeLogin(error: ErrorAuth): string {
  switch (tipoErrorAuth(error)) {
    case "red":
      return SIN_SENAL;
    case "limite":
      return "Demasiados intentos. Intenta de nuevo en unos minutos.";
    default:
      return "Correo o contraseña incorrectos.";
  }
}

/** Guardar la contraseña nueva en /set-password (updateUser). */
export function mensajeClave(error: ErrorAuth): string {
  if (error?.code === "same_password") return "Es la misma contraseña de antes.";
  if (error?.code === "weak_password" || error?.name === "AuthWeakPasswordError") {
    return "Contraseña muy débil.";
  }
  switch (tipoErrorAuth(error)) {
    case "red":
      return SIN_SENAL;
    case "limite":
      return "Demasiados intentos. Intenta de nuevo en unos minutos.";
    case "sesion":
      return "El enlace venció.";
    default:
      return "No se pudo guardar la contraseña.";
  }
}

/** «¿Olvidaste tu contraseña?»: la respuesta es la misma exista o no el correo
 *  (no se le dice a nadie qué correos tienen cuenta). Solo la red y el límite
 *  cambian el mensaje, porque ahí el correo de verdad no salió. */
export function mensajeOlvido(error: ErrorAuth): { ok: boolean; texto: string } {
  if (error) {
    const tipo = tipoErrorAuth(error);
    if (tipo === "red") return { ok: false, texto: SIN_SENAL };
    if (tipo === "limite") return { ok: false, texto: "Demasiados intentos. Intenta de nuevo en unos minutos." };
  }
  return { ok: true, texto: "Si el correo está registrado, te llegó un enlace para cambiar la contraseña." };
}

/** ¿El enlace de /set-password no se pudo comprobar por falta de señal (y no
 *  porque venció)? */
export function esSinSenal(error: ErrorAuth): boolean {
  return tipoErrorAuth(error) === "red";
}
