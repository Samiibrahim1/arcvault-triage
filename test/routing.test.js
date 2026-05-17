import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveQueue } from "../src/routing.js";

test("routes Bug Report to Engineering", () => {
  assert.equal(resolveQueue("Bug Report", 0.9), "Engineering");
});

test("routes Feature Request to Product", () => {
  assert.equal(resolveQueue("Feature Request", 0.9), "Product");
});

test("routes Billing Issue to Billing", () => {
  assert.equal(resolveQueue("Billing Issue", 0.9), "Billing");
});

test("routes Technical Question to Engineering", () => {
  assert.equal(resolveQueue("Technical Question", 0.9), "Engineering");
});

test("routes Incident/Outage to IT/Security", () => {
  assert.equal(resolveQueue("Incident/Outage", 0.9), "IT/Security");
});

test("routes to Review when confidence is below 0.70", () => {
  assert.equal(resolveQueue("Bug Report", 0.69), "Review");
});

test("routes to Review when confidence is 0.0", () => {
  assert.equal(resolveQueue("Incident/Outage", 0.0), "Review");
});

test("routes normally when confidence is exactly 0.70", () => {
  assert.equal(resolveQueue("Bug Report", 0.7), "Engineering");
});

test("routes unknown category to Review", () => {
  assert.equal(resolveQueue("Unknown Category", 0.9), "Review");
});
