// FILE: tests/pairing/address.test.ts
//
// The manual fallback: somebody reading an address off one screen and typing it
// into another. These are the shapes that actually turn up.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SERVER_PORT,
  parseAddress,
} from "../../mobile/src/pairing/address.ts";

describe("typed addresses", () => {
  it("takes the plain form the pairing screen prints", () => {
    assert.deepEqual(parseAddress("192.168.1.42:3000"), { host: "192.168.1.42", port: 3000 });
  });

  it("assumes the usual port when none is given", () => {
    assert.deepEqual(parseAddress("192.168.1.42"), {
      host: "192.168.1.42",
      port: DEFAULT_SERVER_PORT,
    });
  });

  it("forgives a pasted scheme, a trailing slash and stray spaces", () => {
    for (const written of [
      "http://192.168.1.42:3000",
      "HTTP://192.168.1.42:3000",
      "https://192.168.1.42:3000",
      "192.168.1.42:3000/",
      "  192.168.1.42:3000  ",
      "http://192.168.1.42:3000///",
    ]) {
      assert.deepEqual(parseAddress(written), { host: "192.168.1.42", port: 3000 }, written);
    }
  });

  it("takes a .local name", () => {
    assert.deepEqual(parseAddress("pavels-macbook-pro.local"), {
      host: "pavels-macbook-pro.local",
      port: DEFAULT_SERVER_PORT,
    });
    assert.deepEqual(parseAddress("pavels-macbook-pro.local:3130"), {
      host: "pavels-macbook-pro.local",
      port: 3130,
    });
  });

  it("takes a bracketed IPv6 literal", () => {
    assert.deepEqual(parseAddress("[fe80::1]:3000"), { host: "fe80::1", port: 3000 });
    assert.deepEqual(parseAddress("[fe80::1]"), {
      host: "fe80::1",
      port: DEFAULT_SERVER_PORT,
    });
  });

  it("refuses what cannot be dialled", () => {
    for (const bad of [
      "",
      "   ",
      "http://",
      "192.168.1.42:0",
      "192.168.1.42:70000",
      "192.168.1.42:-1",
      "192.168.1.42:abc",
      "192.168.1.42:3000:9",
      "my computer",
      "192.168.1.42/pair",
      "192.168.1.42?x=1",
    ]) {
      assert.equal(parseAddress(bad), null, `accepted "${bad}"`);
    }
  });

  it("refuses an unbracketed IPv6 literal rather than guessing", () => {
    // "fe80::1" would otherwise be read as host "fe80" on a nonsense port.
    assert.equal(parseAddress("fe80::1"), null);
  });
});
