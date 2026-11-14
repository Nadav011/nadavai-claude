// node --test server.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { idDigits, maskPhone, normalizePhone } from "./server.mjs";

test("normalizePhone keeps only Israeli numbers in 972 form", () => {
	assert.equal(normalizePhone("050-123-4567"), "972501234567");
	assert.equal(normalizePhone("+972 50 123 4567"), "972501234567");
	assert.equal(normalizePhone("12"), null);
	assert.equal(normalizePhone(""), null);
	assert.equal(normalizePhone("+1 212 555 0100"), null);
});
test("idDigits reads the number of a WhatsApp id in its forms", () => {
	assert.equal(idDigits("972501234567@c.us"), "972501234567");
	assert.equal(idDigits("972501234567:12@s.whatsapp.net"), "972501234567");
	assert.equal(idDigits(null), null);
	assert.equal(idDigits("abc@lid"), null);
});
test("maskPhone shows the last four digits only", () => {
	assert.equal(maskPhone("972501234567"), "…4567");
});
