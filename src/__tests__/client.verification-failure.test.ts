import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

describe("Client verification gating", () => {
  it("blocks client creation and requests when verification fails", async (t: TestContext) => {
    const createEncryptedBodyFetch = t.mock.fn((_baseURL: string, _hpkeKey: string, _enclaveURL?: string) => {
      return (async () => new Response(null)) as typeof fetch;
    });

    await withMockedModules(
      {
        // Prevent ESM import issues by stubbing the OpenAI client
        openai: class OpenAI {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          constructor(_opts?: any) {}
        },
        "./verifier": {
          Verifier: class {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            constructor(_opts?: any) {}
            verify() {
              throw new Error("verify failed");
            }
            getVerificationDocument() {
              return undefined;
            }
          },
        },
        "./encrypted-body-fetch": { createEncryptedBodyFetch },
      },
      ["../client"],
      async () => {
        const { TinfoilAI } = await import("../tinfoilai");
        const client = new TinfoilAI({ apiKey: "test" });

        await assert.rejects(() => client.ready(), /verify/);

        await assert.rejects(
          () =>
            client.chat.completions.create({
              model: "gpt-oss-120b-free",
              messages: [{ role: "user", content: "hi" }],
            } as any),
          /verify/,
        );

        assert.strictEqual(
          createEncryptedBodyFetch.mock.callCount(),
          0,
          "transport should not be created when verification fails",
        );
      },
    );
  });
});