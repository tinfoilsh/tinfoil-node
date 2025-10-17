import { describe, it } from "node:test";
import assert from "node:assert";
import { compareMeasurements, compareMeasurementsDetailed } from "../verifier";

// Predicate strings mirrored from the reference implementations
const SNP_TDX_MULTI_PLATFORM_V1 = "https://tinfoil.sh/predicate/snp-tdx-multiplatform/v1";
const TDX_GUEST_V1 = "https://tinfoil.sh/predicate/tdx-guest/v1";
const TDX_GUEST_V2 = "https://tinfoil.sh/predicate/tdx-guest/v2";
const SEV_GUEST_V1 = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("compareMeasurements parity with reference Equals()", () => {
  it("multi vs multi: equal registers → pass; different → fail", () => {
    const m1 = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "rtmr1", "rtmr2"] };
    const m2 = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "rtmr1", "rtmr2"] };
    const m3 = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "DIFF", "rtmr2"] };

    assert.strictEqual(compareMeasurements(m1, m2), true, "multi==multi should pass");
    const res = compareMeasurementsDetailed(m1, m3);
    assert.strictEqual(res.match, false);
    assert.match(res.error?.message || "", /multi-platform measurement mismatch/);
  });

  it("runtime multi (flip): multi vs tdx-v1 mapped indices", () => {
    // This uses the flip branch: runtime is multi → swapped internally
    const runtimeMulti = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "EXPECTED_RTMR1", "EXPECTED_RTMR2"] };
    const codeTdx = { type: TDX_GUEST_V1, registers: ["mrtd", "rtmr0", "EXPECTED_RTMR1", "EXPECTED_RTMR2"] };
    assert.strictEqual(compareMeasurements(codeTdx, runtimeMulti), true, "flip path should pass");

    const codeTdxBad1 = { type: TDX_GUEST_V1, registers: ["mrtd", "rtmr0", "WRONG", "EXPECTED_RTMR2"] };
    const bad1 = compareMeasurementsDetailed(codeTdxBad1, runtimeMulti);
    assert.strictEqual(bad1.match, false);
    assert.match(bad1.error?.message || "", /RTMR1 mismatch/);

    const codeTdxBad2 = { type: TDX_GUEST_V1, registers: ["mrtd", "rtmr0", "EXPECTED_RTMR1", "WRONG"] };
    const bad2 = compareMeasurementsDetailed(codeTdxBad2, runtimeMulti);
    assert.strictEqual(bad2.match, false);
    assert.match(bad2.error?.message || "", /RTMR2 mismatch/);
  });

  it("code multi → tdx-v1 mapping: lengths, rtmr1, rtmr2", () => {
    const codeMulti = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "A", "B"] };
    const rtGood = { type: TDX_GUEST_V1, registers: ["mrtd", "rtmr0", "A", "B"] };
    const rtShort = { type: TDX_GUEST_V1, registers: ["mrtd", "rtmr0", "A"] };
    const codeShort = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "A"] };

    assert.strictEqual(compareMeasurements(codeMulti, rtGood), true);

    const few1 = compareMeasurementsDetailed(codeMulti, rtShort);
    assert.strictEqual(few1.match, false);
    assert.match(few1.error?.message || "", /fewer registers than expected/);

    const few2 = compareMeasurementsDetailed(codeShort, rtGood);
    assert.strictEqual(few2.match, false);
    assert.match(few2.error?.message || "", /fewer registers than expected/);
  });

  it("code multi → sev-v1 mapping: snp index", () => {
    const codeMulti = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["SNP_MEAS", "x", "y"] };
    const rtSevPass = { type: SEV_GUEST_V1, registers: ["SNP_MEAS"] };
    const rtSevFail = { type: SEV_GUEST_V1, registers: ["DIFF"] };

    assert.strictEqual(compareMeasurements(codeMulti, rtSevPass), true);

    const fail = compareMeasurementsDetailed(codeMulti, rtSevFail);
    assert.strictEqual(fail.match, false);
    assert.match(fail.error?.message || "", /multi-platform SEV-SNP measurement mismatch/);
  });

  it("code multi → tdx-v2 mapping: rtmr1, rtmr2", () => {
    const codeMulti = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "RTMR1_VAL", "RTMR2_VAL"] };
    const rtTdxV2Pass = { type: TDX_GUEST_V2, registers: ["x", "y", "RTMR1_VAL", "RTMR2_VAL"] };
    const rtTdxV2Fail = { type: TDX_GUEST_V2, registers: ["x", "y", "DIFF", "RTMR2_VAL"] };

    assert.strictEqual(compareMeasurements(codeMulti, rtTdxV2Pass), true);

    const fail = compareMeasurementsDetailed(codeMulti, rtTdxV2Fail);
    assert.strictEqual(fail.match, false);
    assert.match(fail.error?.message || "", /RTMR1 mismatch/);
  });

  it("code multi → unsupported runtime type", () => {
    const codeMulti = { type: SNP_TDX_MULTI_PLATFORM_V1, registers: ["snp", "A", "B"] };
    const rtUnsupported = { type: "https://tinfoil.sh/predicate/unsupported-platform/v1", registers: ["X", "Y"] };
    const res = compareMeasurementsDetailed(codeMulti, rtUnsupported);
    assert.strictEqual(res.match, false);
    assert.match(
      res.error?.message || "",
      /unsupported enclave platform for multi-platform code measurements: https:\/\/tinfoil\.sh\/predicate\/unsupported-platform\/v1/,
    );
  });

  it("same-type comparisons: equal → pass; different → measurement mismatch", () => {
    const tdx1a = { type: TDX_GUEST_V1, registers: ["a", "b", "c", "d"] };
    const tdx1b = { type: TDX_GUEST_V1, registers: ["a", "b", "c", "d"] };
    const tdx1c = { type: TDX_GUEST_V1, registers: ["a", "b", "X", "d"] };
    assert.strictEqual(compareMeasurements(tdx1a, tdx1b), true);
    const mm1 = compareMeasurementsDetailed(tdx1a, tdx1c);
    assert.strictEqual(mm1.match, false);
    assert.match(mm1.error?.message || "", /measurement mismatch/);

    const tdx2a = { type: TDX_GUEST_V2, registers: ["1", "2"] };
    const tdx2b = { type: TDX_GUEST_V2, registers: ["1", "2"] };
    const tdx2c = { type: TDX_GUEST_V2, registers: ["DIFF", "2"] };
    assert.strictEqual(compareMeasurements(tdx2a, tdx2b), true);
    const mm2 = compareMeasurementsDetailed(tdx2a, tdx2c);
    assert.strictEqual(mm2.match, false);
    assert.match(mm2.error?.message || "", /measurement mismatch/);
  });

  it("format mismatch when types differ without multi mapping", () => {
    const sev = { type: SEV_GUEST_V1, registers: ["x"] };
    const tdx = { type: TDX_GUEST_V1, registers: ["a", "b", "c", "d"] };
    const res = compareMeasurementsDetailed(sev, tdx);
    assert.strictEqual(res.match, false);
    assert.match(res.error?.message || "", /attestation format mismatch/);
  });
});
