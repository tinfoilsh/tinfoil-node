import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { createEhbpRequestBuilder } from "../ehbp-request-builder";
import {
  __setEhbpModuleForTests,
  __resetEhbpModuleStateForTests,
} from "../ehbp-module";

type EhbpModuleForTest = Parameters<typeof __setEhbpModuleForTests>[0] & {
  Identity: { generate: () => Promise<any> };
  createTransport: (...args: any[]) => Promise<any>;
};

async function withEhbpModuleMock(module: EhbpModuleForTest, fn: () => Promise<void>) {
  try {
    __setEhbpModuleForTests(module);
    await fn();
  } finally {
    __resetEhbpModuleStateForTests();
  }
}

describe("EHBP request builder", () => {
  it("builds an encrypted Request without sending it", async (t: TestContext) => {
    // Arrange a fake identity that "encrypts" by tagging headers
    const encryptRequest = t.mock.fn(async (req: Request, _serverKey: CryptoKey) => {
      const headers = new Headers(req.headers);
      headers.set("Ehbp-Encapsulated-Key", "deadbeef");
      headers.set("Ehbp-Client-Public-Key", "cafebabe");
      return new Request(req.url, {
        method: req.method,
        headers,
        body: await req.arrayBuffer(),
      });
    });

    const identityGenerate = t.mock.fn(async () => ({
      encryptRequest,
    }));

    const createTransport = t.mock.fn(async (serverURL: string, _id: unknown) => ({
      getServerPublicKey: () => ({}) as unknown as CryptoKey,
    }));

    const moduleStub: EhbpModuleForTest = {
      Identity: { generate: identityGenerate } as any,
      createTransport: createTransport as any,
      // Unused in this test
      Transport: class {} as any,
      PROTOCOL: {} as any,
      HPKE_CONFIG: {} as any,
    };

    await withEhbpModuleMock(moduleStub, async () => {
      const builder = createEhbpRequestBuilder("https://config.example/");
      const input = new Request("https://dest.example/echo", {
        method: "POST",
        headers: { "x-test": "1" },
        body: "hello",
      });

      // Act
      const encrypted = await builder.build(input);

      // Assert: transport used config host
      assert.strictEqual(createTransport.mock.calls[0]?.arguments[0], "https://config.example/");
      // Assert: identity was generated exactly once
      assert.strictEqual(identityGenerate.mock.callCount(), 1);
      // Assert: encryptRequest called with original URL and a server key
      const encCall = encryptRequest.mock.calls[0];
      assert.ok(encCall);
      assert.strictEqual((encCall.arguments[0] as Request).url, "https://dest.example/echo");
      assert.ok(encCall.arguments[1], "serverPublicKey should be passed");

      // Assert: Result is a Request with EHBP headers and same URL
      assert.ok(encrypted instanceof Request);
      assert.strictEqual(encrypted.url, "https://dest.example/echo");
      const headers = new Headers(encrypted.headers);
      assert.strictEqual(headers.get("Ehbp-Encapsulated-Key"), "deadbeef");
      assert.strictEqual(headers.get("Ehbp-Client-Public-Key"), "cafebabe");
    });
  });
});

