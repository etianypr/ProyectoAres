// Helpers para leer y normalizar datos de FormData en Server Actions.

export function s(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

export function sReq(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export function num(v: FormDataEntryValue | null): number {
  const raw = String(v ?? "").replace(/\./g, "").replace(",", ".");
  const cleaned = raw.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function numNull(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").trim();
  if (t === "") return null;
  return num(v);
}

export function intNull(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").trim();
  if (t === "") return null;
  return Math.round(num(v));
}

export function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}
