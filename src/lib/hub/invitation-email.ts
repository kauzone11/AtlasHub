type InvitationEmail = {
  to: string;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
  invitationUrl: string;
};

export type HubInvitationDeliveryResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "NOT_CONFIGURED" }
  | { status: "FAILED"; error: string };

export function hubCanonicalApplicationUrl(environment = process.env) {
  const configured = environment.ATLAS_APP_URL || environment.NEXT_PUBLIC_APP_URL;
  if (configured) {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && !(environment.NODE_ENV !== "production" && parsed.protocol === "http:")) {
      throw new Error("ATLAS_APP_URL deve usar HTTPS em produção.");
    }
    return parsed.toString().replace(/\/$/, "");
  }
  return environment.NODE_ENV === "production" ? "https://atlas.ouseagency.com" : "http://localhost:3000";
}

export function isHubInvitationEmailConfigured(environment = process.env) {
  return Boolean(environment.RESEND_API_KEY && environment.HUB_INVITATION_EMAIL_FROM);
}

export function mayExposeHubInvitationLink(environment = process.env) {
  return environment.NODE_ENV !== "production" || !isHubInvitationEmailConfigured(environment);
}

function safeDeliveryError(value: unknown) {
  const message = value instanceof Error ? value.message : "Falha desconhecida no provedor de e-mail.";
  return message.replace(/https?:\/\/\S+/g, "[url removida]").slice(0, 500);
}

export async function sendHubInvitationEmail(input: InvitationEmail, environment = process.env): Promise<HubInvitationDeliveryResult> {
  if (environment.NODE_ENV === "test") return { status: "NOT_CONFIGURED" };
  if (!isHubInvitationEmailConfigured(environment)) return { status: "NOT_CONFIGURED" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: environment.HUB_INVITATION_EMAIL_FROM,
        to: [input.to],
        subject: `Convite para ${input.organizationName} no Atlas Hub`,
        text: `${input.inviterName} convidou você para ${input.organizationName}. O convite expira em ${input.expiresAt.toLocaleString("pt-BR")}. Aceite em: ${input.invitationUrl}`,
      }),
    });
    if (!response.ok) throw new Error(`Provedor de e-mail respondeu ${response.status}.`);
    const payload = await response.json().catch(() => ({})) as { id?: string };
    return { status: "SENT", providerMessageId: payload.id };
  } catch (error) {
    return { status: "FAILED", error: safeDeliveryError(error) };
  }
}
