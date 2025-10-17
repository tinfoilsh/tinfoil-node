import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

function makeHex64(): string {
  return "b".repeat(64);
}

const MOCK_MEASUREMENT_TYPE = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("Verifier verify() failure when code attestation mismatches", () => {
  it("throws if verifyEnclave succeeds but verifyCode mismatches", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(JSON.stringify({ body: `Digest: \`${makeHex64()}\`` }), {
          headers: { "content-type": "application/json" },
        });
      }
      // WASM fetch
      return new Response(new Uint8Array([0x00]), {
        headers: { "content-type": "application/wasm" },
      });
    });

    const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
    const originalInstantiate = WebAssembly.instantiate;
    const originalFetch = globalThis.fetch;
    (WebAssembly as any).instantiateStreaming = async () => ({ module: {}, instance: {} });
    (WebAssembly as any).instantiate = async () => ({ module: {}, instance: {} });
    globalThis.fetch = fetchMock as any;

    try {
      await withMockedModules(
        {
          "./wasm-exec.js": {
            default: undefined,
            __esModule: true,
          },
        },
        ["../verifier"],
        async () => {
          (globalThis as any).Go = class {
            importObject: Record<string, unknown> = {};
            run() {
              return Promise.resolve();
            }
          };
          // Runtime attestation succeeds and returns HPKE key
          (globalThis as any).verifyEnclave = async (_h: string) => ({
            measurement: { type: MOCK_MEASUREMENT_TYPE, registers: ["r1", "r2"] },
            tls_public_key: "tls-fp",
            hpke_public_key: "hpke-key",
          });
          // Code attestation returns a different measurement -> mismatch
          (globalThis as any).verifyCode = async (_r: string, _d: string) => ({
            type: MOCK_MEASUREMENT_TYPE,
            registers: ["r1", "DIFFERENT"],
          });

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({ serverURL: "https://test-enclave.tinfoil.sh" });

          await assert.rejects(
            () => verifier.verify(),
            /Verification failed: measurements did not match/,
          );
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });
});

