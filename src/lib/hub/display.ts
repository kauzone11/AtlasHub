import { DEFAULT_HUB_LOCALE, DEFAULT_HUB_TIMEZONE, normalizeHubCurrency, normalizeHubLocale } from "./organization";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Superadministrador", ADMIN: "Administrador", FINANCE: "Financeiro",
  DIRECTOR: "Diretor", MEMBER: "Membro", VIEWER: "Visualizador",
};
const MEMBER_STATUS_LABELS: Record<string, string> = { INVITED: "Convidado", ACTIVE: "Ativo", DISABLED: "Desativado", DELETED: "Excluído" };
const PROJECT_STATUS_LABELS: Record<string, string> = { DRAFT: "Rascunho", APPROVED: "Aprovado", CANCELLED: "Cancelado" };
const AUDIT_ACTION_LABELS: Record<string, string> = {
  BACKFILL: "Migração de dados",
  DIRECTORATE_CREATED: "Diretoria criada",
  DIRECTORATE_UPDATED: "Diretoria atualizada",
  FINANCIAL_RULE_UPDATED: "Regra financeira atualizada",
  MEMBER_CREATED: "Membro criado",
  MEMBER_UPDATED: "Membro atualizado",
  MEMBER_DELETED: "Membro excluído",
  MEMBER_RESTORED: "Membro restaurado",
  MEMBER_PASSWORD_RESET: "Senha de membro redefinida",
  PROJECT_CREATED: "Projeto criado",
  PROJECT_UPDATED: "Projeto atualizado",
  PROJECT_APPROVED: "Projeto aprovado",
  PROJECT_CANCELLED: "Projeto cancelado",
  REQUEST_CREATED: "Solicitação criada",
  REQUEST_APPROVED: "Solicitação aprovada",
  REQUEST_REJECTED: "Solicitação recusada",
  REQUEST_CANCELLED: "Solicitação cancelada",
  WALLET_ADJUSTED: "Carteira ajustada",
  WALLET_TRANSACTION_REVERSED: "Movimentação financeira estornada",
};
const AUDIT_ENTITY_LABELS: Record<string, string> = {
  WORKSPACE: "Organização",
  ORGANIZATION: "Organização",
  DIRECTORATE: "Diretoria",
  FINANCIAL_RULE: "Regra financeira",
  MEMBER: "Membro",
  PROJECT: "Projeto",
  WALLET_REQUEST: "Solicitação financeira",
  WALLET_TRANSACTION: "Movimentação financeira",
};
const WALLET_SOURCE_TYPE_LABELS: Record<string, string> = {
  PROJECT_PAYOUT: "Participação em projeto",
  PROJECT_REVERSAL: "Estorno de projeto",
  REQUEST_APPROVAL: "Solicitação aprovada",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  TRANSACTION_REVERSAL: "Estorno de movimentação",
  SYSTEM: "Operação do sistema",
};
const WALLET_TRANSACTION_TYPE_LABELS: Record<string, string> = { CREDIT: "Entrada", DEBIT: "Gasto", ADJUSTMENT: "Ajuste" };
const WALLET_TRANSACTION_STATUS_LABELS: Record<string, string> = { PENDING: "Pendente", COMPLETED: "Confirmada", CANCELLED: "Cancelada" };
const WALLET_REQUEST_STATUS_LABELS: Record<string, string> = { PENDING: "Pendente", APPROVED: "Aprovada", REJECTED: "Recusada", CANCELLED: "Cancelada" };

function label(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return labels[value || ""] || fallback;
}

export function hubRoleLabel(value: string | null | undefined) { return label(ROLE_LABELS, value, "Papel do sistema"); }
export function hubMemberStatusLabel(value: string | null | undefined) { return label(MEMBER_STATUS_LABELS, value, "Status do sistema"); }
export function hubProjectStatusLabel(value: string | null | undefined) { return label(PROJECT_STATUS_LABELS, value, "Status do sistema"); }
export function hubAuditActionLabel(value: string | null | undefined) { return label(AUDIT_ACTION_LABELS, value, "Evento do sistema"); }
export function hubAuditEntityLabel(value: string | null | undefined) { return label(AUDIT_ENTITY_LABELS, value, "Registro do sistema"); }
export function hubWalletSourceTypeLabel(value: string | null | undefined) { return label(WALLET_SOURCE_TYPE_LABELS, value, "Origem do sistema"); }
export function hubWalletTransactionTypeLabel(value: string | null | undefined) { return label(WALLET_TRANSACTION_TYPE_LABELS, value, "Movimentação"); }
export function hubWalletTransactionStatusLabel(value: string | null | undefined) { return label(WALLET_TRANSACTION_STATUS_LABELS, value, "Status do sistema"); }
export function hubWalletRequestStatusLabel(value: string | null | undefined) { return label(WALLET_REQUEST_STATUS_LABELS, value, "Status do sistema"); }

export type HubDisplayPreferences = { locale?: string | null; currency?: string | null; timezone?: string | null };

export function formatHubMoney(cents: number, preferences: HubDisplayPreferences = {}) {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  return new Intl.NumberFormat(normalizeHubLocale(preferences.locale), { style: "currency", currency: normalizeHubCurrency(preferences.currency) }).format(Object.is(safe, -0) ? 0 : safe / 100);
}

export function formatHubMaskedMoney(preferences: HubDisplayPreferences = {}) {
  const formatter = new Intl.NumberFormat(normalizeHubLocale(preferences.locale), { style: "currency", currency: normalizeHubCurrency(preferences.currency) });
  const prefix = formatter.formatToParts(0).filter((part) => part.type === "currency" || part.type === "literal").map((part) => part.value).join("").trim();
  return `${prefix || normalizeHubCurrency(preferences.currency)} ••••••`;
}

function safeHubDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHubDate(value: string | number | Date, preferences: HubDisplayPreferences = {}) {
  const date = safeHubDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(normalizeHubLocale(preferences.locale), { timeZone: preferences.timezone || DEFAULT_HUB_TIMEZONE }).format(date);
}

export function formatHubDateTime(value: string | number | Date, preferences: HubDisplayPreferences = {}) {
  const date = safeHubDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(normalizeHubLocale(preferences.locale || DEFAULT_HUB_LOCALE), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: preferences.timezone || DEFAULT_HUB_TIMEZONE,
  }).format(date);
}
