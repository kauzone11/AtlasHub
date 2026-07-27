import { HubApiError } from "./api";

export function assertPositiveCents(value: number, field = "valor") {
  if (!Number.isInteger(value) || value <= 0) throw new HubApiError(`${field} deve ser informado em centavos e ser positivo.`, 400);
}
export function assertCivilDate(value: Date, field = "data") {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) throw new HubApiError(`${field} invalida.`, 400);
  return value;
}

export function normalizeSearch(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function assertSafeHttpsUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new HubApiError("URL invalida.", 400); }
  if (url.protocol !== "https:" || url.username || url.password) throw new HubApiError("A URL deve usar HTTPS e nao pode conter credenciais.", 400);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host))
    throw new HubApiError("URLs locais ou privadas nao sao permitidas.", 400);
  return url.toString();
}

export function csvCell(value: unknown) {
  const raw = String(value ?? "").replace(/\r?\n/g, " ");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
