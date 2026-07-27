import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { HubAccessError } from "@/lib/hub/auth";
import { HubMemberPolicyError } from "@/lib/hub/permissions";
import { HubObjectForbiddenError, HubObjectNotFoundError } from "@/lib/hub/collaboration-policy";

export class HubApiError extends Error {
  constructor(message: string, readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 = 400, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "HubApiError";
  }
}

export function hubJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

export function withHubApi<TContext = unknown>(
  handler: (request: Request, context: TContext) => Promise<Response>,
) {
  return async (request: Request, context: TContext) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HubAccessError || error instanceof HubApiError || error instanceof HubMemberPolicyError || error instanceof HubObjectForbiddenError || error instanceof HubObjectNotFoundError) {
        return hubJson({ error: error.message, ...(error instanceof HubApiError && error.details ? error.details : {}) }, { status: error.status });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
        if (target.includes("normalizedEmail")) {
          return hubJson({ error: "E-mail já cadastrado." }, { status: 409 });
        }
        return hubJson({ error: "Esta operação já foi registrada." }, { status: 409 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return hubJson({ error: "Os dados foram alterados por outra operação. Atualize e tente novamente." }, { status: 409 });
      }
      console.error("[hub-api] Falha interna", error instanceof Error ? error.name : "UnknownError");
      return hubJson({ error: "Não foi possível concluir a operação." }, { status: 500 });
    }
  };
}
