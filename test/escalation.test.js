import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEscalationRules } from "../src/escalation.js";

test("does not escalate a clean message with high confidence", () => {
  const result = applyEscalationRules("I would like a new feature please.", 0.9);
  assert.equal(result.escalate, false);
  assert.deepEqual(result.escalation_reasons, []);
});

test("flags low confidence", () => {
  const result = applyEscalationRules("Some ambiguous message.", 0.65);
  assert.equal(result.escalate, true);
  assert.ok(result.escalation_reasons.includes("low_confidence"));
});

test("does not flag confidence exactly at threshold", () => {
  const result = applyEscalationRules("Normal message.", 0.7);
  assert.equal(result.escalate, false);
});

test("flags keyword:outage", () => {
  const result = applyEscalationRules("We are experiencing an outage.", 0.9);
  assert.equal(result.escalate, true);
  assert.ok(result.escalation_reasons.includes("keyword:outage"));
});

test("flags keyword:outage case-insensitively", () => {
  const result = applyEscalationRules("There is an OUTAGE affecting us.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:outage"));
});

test("flags keyword:billing_error", () => {
  const result = applyEscalationRules("We found a billing error on our invoice.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:billing_error"));
});

test("flags keyword:stopped_loading", () => {
  const result = applyEscalationRules("The dashboard stopped loading at 2pm.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:stopped_loading"));
});

test("flags keyword:multiple_users_affected", () => {
  const result = applyEscalationRules("Multiple users affected by this issue.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:multiple_users_affected"));
});

test("flags keyword:completely_down", () => {
  const result = applyEscalationRules("The platform is completely down.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:completely_down"));
});

test("flags keyword:cannot_access", () => {
  const result = applyEscalationRules("Users cannot access the portal.", 0.9);
  assert.ok(result.escalation_reasons.includes("keyword:cannot_access"));
});

test("accumulates multiple reasons when multiple rules fire", () => {
  const result = applyEscalationRules("There is an outage and a billing error.", 0.5);
  assert.ok(result.escalation_reasons.includes("low_confidence"));
  assert.ok(result.escalation_reasons.includes("keyword:outage"));
  assert.ok(result.escalation_reasons.includes("keyword:billing_error"));
  assert.equal(result.escalate, true);
});
