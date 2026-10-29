import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding } from "../../../../src/kit/findings.ts";
import type { ChangeRequest } from "../state.ts";
import { fixRequests } from "../web/fixes.ts";

const finding = (id: string, title: string): Finding => ({
  id,
  title,
  severity: "High",
  confidence: "High",
  category: "c",
  summary: "s",
  primary: { path: "a.ts", rev: "work", startLine: 1, endLine: 1 },
  related: [],
  visuals: [],
  dismissed: false,
  thread: [],
});

const request = (id: string, findingId: string, findingTitle: string, status: ChangeRequest["status"]): ChangeRequest => ({
  id,
  origin: { kind: "finding", findingId, findingTitle },
  status,
  messages: [],
  createdAt: "t",
  updatedAt: "t",
});

test("a finding's fix is its latest change request, matched by id and title", () => {
  const findings = [finding("F1", "Loose compare"), finding("F2", "Missing import"), finding("F3", "Unrequested")];
  const requests = [
    request("R1", "F1", "Loose compare", "declined"),
    request("R2", "F1", "Loose compare", "done"),
    // A rerun renumbered findings: this F2 request was for a different finding.
    request("R3", "F2", "Old title", "done"),
    { ...request("R4", "F3", "Unrequested", "done"), origin: { kind: "manual" as const } },
  ];
  const fixes = fixRequests(findings, requests);
  assert.deepEqual([...fixes].map(([id, r]) => [id, r.id, r.status]), [["F1", "R2", "done"]]);
});
