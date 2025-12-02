import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

function makeHex64(): string {
  return "a".repeat(64);
}

const MOCK_MEASUREMENT_TYPE = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("Verifier", () => {
  it("verify() success flow with verification document", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(JSON.stringify({ body: `Digest: \`${makeHex64()}\`` }), {
          headers: { "content-type": "application/json" },
        });
      }
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
          (globalThis as any).verify = async (_host: string, _repo: string) =>
            JSON.stringify({
              tls_public_key: "tls-fp",
              hpke_public_key: "hpke-key",
              digest: makeHex64(),
              code_measurement: { type: MOCK_MEASUREMENT_TYPE, registers: ["r1", "r2"] },
              enclave_measurement: { type: MOCK_MEASUREMENT_TYPE, registers: ["r1", "r2"] },
              code_fingerprint: "code-fp",
              enclave_fingerprint: "enclave-fp",
            });

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://host/v1",
            configRepo: "owner/repo"
          });

          await verifier.verify();
          const doc = verifier.getVerificationDocument();

          assert.ok(doc, "verification document should exist");
          assert.strictEqual(fetchMock.mock.callCount() > 0, true);
          assert.strictEqual(doc!.securityVerified, true);
          assert.strictEqual(doc!.steps.verifyEnclave.status, "success");
          assert.strictEqual(doc!.steps.verifyCode.status, "success");
          assert.strictEqual(doc!.steps.compareMeasurements.status, "success");
          assert.deepStrictEqual(doc!.enclaveMeasurement.measurement, { type: MOCK_MEASUREMENT_TYPE, registers: ["r1", "r2"] });
          assert.strictEqual(doc!.enclaveMeasurement.tlsPublicKeyFingerprint, "tls-fp");
          assert.strictEqual(doc!.enclaveMeasurement.hpkePublicKey, "hpke-key");
          assert.strictEqual(typeof doc!.releaseDigest, "string");
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() handles errors with appropriate step states", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(null, { status: 500, statusText: "Bad" });
      }
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("fetchDigest: GitHub API request failed");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /fetchDigest: GitHub API request failed/);

          // Check that the verification document shows the correct failed step
          const doc = verifier.getVerificationDocument();
          assert.ok(doc, "verification document should exist even on failure");
          assert.strictEqual(doc!.securityVerified, false);
          assert.strictEqual(doc!.steps.fetchDigest.status, "failed");
          assert.ok(doc!.steps.fetchDigest.error?.includes("GitHub API request failed"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() categorizes verifyCode errors correctly", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("verifyCode: provenance validation failed");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /verifyCode: provenance validation failed/);

          const doc = verifier.getVerificationDocument();
          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, false);
          assert.strictEqual(doc!.steps.fetchDigest.status, "success");
          assert.strictEqual(doc!.steps.verifyCode.status, "failed");
          assert.ok(doc!.steps.verifyCode.error?.includes("provenance validation failed"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() categorizes verifyEnclave errors correctly", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("verifyEnclave: attestation failed");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /verifyEnclave: attestation failed/);

          const doc = verifier.getVerificationDocument();
          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, false);
          assert.strictEqual(doc!.steps.fetchDigest.status, "success");
          assert.strictEqual(doc!.steps.verifyCode.status, "success");
          assert.strictEqual(doc!.steps.verifyEnclave.status, "failed");
          assert.ok(doc!.steps.verifyEnclave.error?.includes("attestation failed"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() categorizes verifyHardware errors correctly", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("verifyHardware: TDX platform mismatch");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /verifyHardware: TDX platform mismatch/);

          const doc = verifier.getVerificationDocument();
          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, false);
          // verifyHardware errors are mapped to otherError in the current implementation
          assert.strictEqual(doc!.steps.otherError?.status, "failed");
          assert.ok(doc!.steps.otherError?.error?.includes("TDX platform mismatch"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() categorizes measurements errors correctly", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("measurements: mismatch detected");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /measurements: mismatch detected/);

          const doc = verifier.getVerificationDocument();
          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, false);
          assert.strictEqual(doc!.steps.fetchDigest.status, "success");
          assert.strictEqual(doc!.steps.verifyCode.status, "success");
          assert.strictEqual(doc!.steps.verifyEnclave.status, "success");
          assert.strictEqual(doc!.steps.compareMeasurements.status, "failed");
          assert.ok(doc!.steps.compareMeasurements.error?.includes("mismatch detected"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() categorizes validateTLS errors correctly", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("validateTLS: fingerprint mismatch");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://h/v1",
            configRepo: "o/r"
          });

          await assert.rejects(() => verifier.verify(), /validateTLS: fingerprint mismatch/);

          const doc = verifier.getVerificationDocument();
          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, false);
          // validateTLS errors are mapped to otherError in the current implementation
          assert.strictEqual(doc!.steps.otherError?.status, "failed");
          assert.ok(doc!.steps.otherError?.error?.includes("fingerprint mismatch"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() includes hardware measurement for TDX platforms", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(JSON.stringify({ body: `Digest: \`${makeHex64()}\`` }), {
          headers: { "content-type": "application/json" },
        });
      }
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
          (globalThis as any).verify = async (_host: string, _repo: string) =>
            JSON.stringify({
              tls_public_key: "tls-fp",
              hpke_public_key: "hpke-key",
              digest: makeHex64(),
              code_measurement: { type: "https://tinfoil.sh/predicate/tdx-guest/v2", registers: ["r1", "r2"] },
              enclave_measurement: { type: "https://tinfoil.sh/predicate/tdx-guest/v2", registers: ["r1", "r2"] },
              hardware_measurement: {
                ID: "tdx-id-123",
                MRTD: makeHex64(),
                RTMR0: makeHex64(),
              },
              code_fingerprint: "code-fp",
              enclave_fingerprint: "enclave-fp",
            });

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://host/v1",
            configRepo: "owner/repo"
          });

          await verifier.verify();
          const doc = verifier.getVerificationDocument();

          assert.ok(doc);
          assert.strictEqual(doc!.securityVerified, true);
          assert.ok(doc!.hardwareMeasurement);
          assert.strictEqual(doc!.hardwareMeasurement!.ID, "tdx-id-123");
          assert.strictEqual(doc!.hardwareMeasurement!.MRTD.length, 64);
          assert.strictEqual(doc!.hardwareMeasurement!.RTMR0.length, 64);
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("verify() populates all verification document fields on success", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(JSON.stringify({ body: `Digest: \`${makeHex64()}\`` }), {
          headers: { "content-type": "application/json" },
        });
      }
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
          const testDigest = makeHex64();
          (globalThis as any).verify = async (_host: string, _repo: string) =>
            JSON.stringify({
              tls_public_key: "test-tls-public-key",
              hpke_public_key: "test-hpke-public-key",
              digest: testDigest,
              code_measurement: { type: MOCK_MEASUREMENT_TYPE, registers: ["code-r1", "code-r2"] },
              enclave_measurement: { type: MOCK_MEASUREMENT_TYPE, registers: ["enclave-r1", "enclave-r2"] },
              code_fingerprint: "test-code-fingerprint",
              enclave_fingerprint: "test-enclave-fingerprint",
            });

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://test-host.com/v1",
            configRepo: "test-owner/test-repo"
          });

          await verifier.verify();
          const doc = verifier.getVerificationDocument();

          assert.ok(doc);

          // Verify all required fields are populated
          assert.strictEqual(doc!.configRepo, "test-owner/test-repo");
          assert.strictEqual(doc!.enclaveHost, "test-host.com");
          assert.strictEqual(doc!.releaseDigest, testDigest);
          assert.deepStrictEqual(doc!.codeMeasurement, { type: MOCK_MEASUREMENT_TYPE, registers: ["code-r1", "code-r2"] });
          assert.ok(doc!.enclaveMeasurement);
          assert.strictEqual(doc!.enclaveMeasurement.tlsPublicKeyFingerprint, "test-tls-public-key");
          assert.strictEqual(doc!.enclaveMeasurement.hpkePublicKey, "test-hpke-public-key");
          assert.deepStrictEqual(doc!.enclaveMeasurement.measurement, { type: MOCK_MEASUREMENT_TYPE, registers: ["enclave-r1", "enclave-r2"] });
          assert.strictEqual(doc!.tlsPublicKey, "test-tls-public-key");
          assert.strictEqual(doc!.hpkePublicKey, "test-hpke-public-key");
          assert.strictEqual(doc!.codeFingerprint, "test-code-fingerprint");
          assert.strictEqual(doc!.enclaveFingerprint, "test-enclave-fingerprint");
          assert.strictEqual(doc!.selectedRouterEndpoint, "test-host.com");
          assert.strictEqual(doc!.securityVerified, true);

          // Verify all steps are successful
          assert.strictEqual(doc!.steps.fetchDigest.status, "success");
          assert.strictEqual(doc!.steps.verifyCode.status, "success");
          assert.strictEqual(doc!.steps.verifyEnclave.status, "success");
          assert.strictEqual(doc!.steps.compareMeasurements.status, "success");
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });

  it("getVerificationDocument() returns document even after verification failure", async (t: TestContext) => {
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const url = String(input);
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
          (globalThis as any).verify = async (_host: string, _repo: string) => {
            throw new Error("verifyCode: signature verification failed");
          };

          const { Verifier } = await import("../verifier");
          const verifier = new Verifier({
            serverURL: "https://failed-host.com/v1",
            configRepo: "owner/failed-repo"
          });

          await assert.rejects(() => verifier.verify());

          const doc = verifier.getVerificationDocument();
          assert.ok(doc, "verification document should exist even after failure");
          assert.strictEqual(doc!.securityVerified, false);
          assert.strictEqual(doc!.configRepo, "owner/failed-repo");
          assert.strictEqual(doc!.enclaveHost, "failed-host.com");
          assert.strictEqual(doc!.steps.verifyCode.status, "failed");
          assert.ok(doc!.steps.verifyCode.error?.includes("signature verification failed"));
        },
      );
    } finally {
      (WebAssembly as any).instantiateStreaming = originalInstantiateStreaming;
      (WebAssembly as any).instantiate = originalInstantiate;
      globalThis.fetch = originalFetch;
    }
  });
});
