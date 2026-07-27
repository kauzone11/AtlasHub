import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  handleCreateBoard,
  handleCreateMeeting,
  handleCreateTask,
  handleMoveTask,
  handleRespondMeeting,
} from "./collaboration-handlers";

const noDatabase = {} as PrismaClient;
const actor = {
  memberId: "member",
  organizationId: "organization",
  role: "SUPER_ADMIN" as const,
  directorateId: null,
  organization: { timezone: "America/Fortaleza" },
};

test("actual create-meeting handler rejects malformed local datetime", async () => {
  await assert.rejects(
    () =>
      handleCreateMeeting(noDatabase, actor, {
        title: "Reuniao",
        startLocal: "invalid",
        endLocal: "2026-07-13T10:00",
        timezone: "America/Fortaleza",
        idempotencyKey: "handler-meeting",
      }),
    /local invalida/,
  );
});

test("actual create-meeting handler rejects private IPv6 URL", async () => {
  await assert.rejects(
    () =>
      handleCreateMeeting(noDatabase, actor, {
        title: "Reuniao",
        startLocal: "2026-07-13T09:00",
        endLocal: "2026-07-13T10:00",
        timezone: "America/Fortaleza",
        meetingUrl: "https://[fd00::1]/room",
        idempotencyKey: "handler-url",
      }),
    /HTTPS publico/,
  );
});

test("actual create-meeting handler rejects IPv6 loopback and link-local URLs", async () => {
  for (const meetingUrl of ["https://[::1]/room", "https://[fe80::1]/room"]) {
    await assert.rejects(
      () =>
        handleCreateMeeting(noDatabase, actor, {
          title: "Reuniao",
          startLocal: "2026-07-13T09:00",
          endLocal: "2026-07-13T10:00",
          timezone: "America/Fortaleza",
          meetingUrl,
          idempotencyKey: `handler-url-${meetingUrl}`,
        }),
      /HTTPS publico/,
    );
  }
});

test("actual response handler validates immutable event UUID", () => {
  assert.throws(
    () =>
      handleRespondMeeting(noDatabase, actor, "meeting", {
        status: "ACCEPTED",
        eventId: "reused-final-state",
      }),
    /UUID/,
  );
});

test("actual board handler rejects director organization board", () => {
  assert.throws(
    () =>
      handleCreateBoard(
        noDatabase,
        { ...actor, role: "DIRECTOR", directorateId: "own" },
        { name: "Nao permitido", scope: "ORGANIZATION" },
      ),
    /propria diretoria/,
  );
});

test("actual task handler rejects viewer mutation before database write", async () => {
  await assert.rejects(
    () =>
      handleCreateTask(
        noDatabase,
        { ...actor, role: "VIEWER" },
        {
          boardId: "board",
          columnId: "column",
          title: "Nao permitido",
          idempotencyKey: "viewer-task",
        },
      ),
    /somente leitura/,
  );
});

test("actual move-task handler rejects malformed optimistic version", () => {
  assert.throws(
    () =>
      handleMoveTask(noDatabase, actor, "task", {
        columnId: "column",
        version: "stale",
      }),
    /Movimento invalido/,
  );
});
