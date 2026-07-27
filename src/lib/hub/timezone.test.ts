import assert from "node:assert/strict";
import test from "node:test";
import { organizationDayUtcRange, zonedLocalDateTimeToUtc } from "./timezone";

test("converte horario local da organizacao sem usar o fuso do processo", () => {
  assert.equal(
    zonedLocalDateTimeToUtc("2026-07-13T09:30", "America/Fortaleza").toISOString(),
    "2026-07-13T12:30:00.000Z",
  );
});

test("rejeita horario inexistente na transicao DST", () => {
  assert.throws(
    () => zonedLocalDateTimeToUtc("2026-03-08T02:30", "America/New_York"),
    /nao existe/,
  );
});

test("escolhe deterministicamente a primeira ocorrencia no horario ambiguo", () => {
  assert.equal(
    zonedLocalDateTimeToUtc("2026-11-01T01:30", "America/New_York").toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
});

test("limites do dia respeitam o fuso da organizacao", () => {
  const range = organizationDayUtcRange("2026-07-13", "America/Fortaleza");
  assert.equal(range.startAt.toISOString(), "2026-07-13T03:00:00.000Z");
  assert.equal(range.endAt.toISOString(), "2026-07-14T03:00:00.000Z");
});
