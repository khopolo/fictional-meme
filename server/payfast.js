import crypto from "node:crypto";

function encodeValue(value) {
  return encodeURIComponent(String(value).trim())
    .replace(/[!'()*~]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%20/g, "+");
}

export function createPayfastSignature(fields, passphrase = "") {
  const values = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .map(([key, value]) => `${key}=${encodeValue(value)}`);
  if (passphrase) values.push(`passphrase=${encodeValue(passphrase)}`);
  return crypto.createHash("md5").update(values.join("&")).digest("hex");
}

export async function verifyPayfastNotification(
  fields,
  { mode, merchantId, passphrase, fetchImpl = fetch },
) {
  if (!merchantId || !passphrase)
    throw new Error("PayFast verification is not configured");
  if (fields.merchant_id !== merchantId || !fields.signature) return false;
  const expected = createPayfastSignature(fields, passphrase);
  const supplied = String(fields.signature).toLowerCase();
  if (
    !/^[a-f0-9]{32}$/.test(supplied) ||
    !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return false;

  const validationUrl =
    mode === "live"
      ? "https://www.payfast.co.za/eng/query/validate"
      : "https://sandbox.payfast.co.za/eng/query/validate";
  const response = await fetchImpl(validationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok && (await response.text()).trim() === "VERIFIED";
}