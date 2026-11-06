import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPayfastSignature,
  verifyPayfastNotification,
} from "../server/payfast.js";

test("PayFast signatures encode ordered fields and omit the signature field", () => {
  const fields = {
    merchant_id: "10000100",
    item_name: "Pro subscription",
    custom_str1: "owner id",
  };
  const signature = createPayfastSignature(fields, "pass phrase");
  assert.equal(
    signature,
    createPayfastSignature({ ...fields, signature }, "pass phrase"),
  );
  assert.notEqual(signature, createPayfastSignature({ ...fields, item_name: "Starter" }, "pass phrase"));
});

test("PayFast notification verification rejects wrong merchant and signature", async () => {
  const fields = {
    merchant_id: "10000100",
    amount_gross: "899.00",
    signature: "0".repeat(32),
  };
  assert.equal(
    await verifyPayfastNotification(fields, {
      mode: "sandbox",
      merchantId: "different-merchant",
      passphrase: "secret",
    }),
    false,
  );
  assert.equal(
    await verifyPayfastNotification(fields, {
      mode: "sandbox",
      merchantId: fields.merchant_id,
      passphrase: "secret",
    }),
    false,
  );
});

test("PayFast notification requires the provider's VERIFIED response", async () => {
  const fields = {
    merchant_id: "10000100",
    amount_gross: "899.00",
  };
  fields.signature = createPayfastSignature(fields, "secret");
  const verify = (response) =>
    verifyPayfastNotification(fields, {
      mode: "sandbox",
      merchantId: fields.merchant_id,
      passphrase: "secret",
      fetchImpl: async (url, options) => {
        assert.match(url, /sandbox\.payfast\.co\.za/);
        assert.equal(options.method, "POST");
        return { ok: true, text: async () => response };
      },
    });
  assert.equal(await verify("VERIFIED\n"), true);
  assert.equal(await verify("INVALID"), false);
});