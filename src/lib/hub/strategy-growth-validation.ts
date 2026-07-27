import { HubApiError } from "./api";
import { zonedLocalDateTimeToUtc } from "./timezone";

export function boundedInteger(value: unknown, name: string, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum)
    throw new HubApiError(`${name} deve ficar entre ${minimum} e ${maximum}.`, 400);
  return number;
}

export function nonNegativeCents(value: unknown, name = "Valor") {
  return boundedInteger(value, name, 0, Number.MAX_SAFE_INTEGER);
}

export function requiredText(value: unknown, name: string, maximum = 240) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new HubApiError(`${name} e obrigatorio e deve ter no maximo ${maximum} caracteres.`, 400);
  return text;
}

export function optionalText(value: unknown, maximum = 4000) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maximum) throw new HubApiError("Texto invalido.", 400);
  return value.trim();
}

export function publicHttpsUrl(value: unknown, name: string) {
  if (value == null || value === "") return null;
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new HubApiError(`${name} invalida.`, 400); }
  if (url.protocol !== "https:" || url.username || url.password) throw new HubApiError(`${name} deve usar HTTPS publico e nao pode conter credenciais.`, 400);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "::1" || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host))
    throw new HubApiError(`${name} deve apontar para um endereco publico.`, 400);
  return url.toString();
}

export function decimalNumber(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HubApiError(`${name} invalido.`, 400);
  return number;
}

export function enumValue<const T extends readonly string[]>(value: unknown, name: string, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new HubApiError(`${name} invalido.`, 400);
  return value as T[number];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
const ABSOLUTE_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function organizationDate(value: unknown, name: string, optional: true): Date | null;
export function organizationDate(value: unknown, name: string, optional?: false): Date;
export function organizationDate(value: unknown, name: string, optional = false): Date | null {
  if (optional && (value == null || value === "")) return null;
  const text = typeof value === "string" ? value : "";
  if (!DATE_ONLY.test(text)) throw new HubApiError(`${name} deve usar AAAA-MM-DD.`, 400);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new HubApiError(`${name} invalida.`, 400);
  return date;
}

export function organizationDateTime(value: unknown, name: string, timezone: string, optional: true): Date | null;
export function organizationDateTime(value: unknown, name: string, timezone: string, optional?: false): Date;
export function organizationDateTime(value: unknown, name: string, timezone: string, optional = false): Date | null {
  if (optional && (value == null || value === "")) return null;
  const text = typeof value === "string" ? value : "";
  if (ABSOLUTE_DATE_TIME.test(text)) { const absolute = new Date(text); if (!Number.isNaN(absolute.getTime())) return absolute; }
  if (DATE_ONLY.test(text)) return zonedLocalDateTimeToUtc(`${text}T00:00`, timezone);
  if (!LOCAL_DATE_TIME.test(text)) throw new HubApiError(`${name} deve usar data e hora locais.`, 400);
  try { return zonedLocalDateTimeToUtc(text.slice(0, 16), timezone); }
  catch { throw new HubApiError(`${name} invalida para o fuso da organizacao.`, 400); }
}

export function dateValue(value: unknown, name: string, optional: true): Date | null;
export function dateValue(value: unknown, name: string, optional?: false): Date;
export function dateValue(value: unknown, name: string, optional = false): Date | null {
  if (optional && (value == null || value === "")) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new HubApiError(`${name} invalida.`, 400);
  return date;
}
