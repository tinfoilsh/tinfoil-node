import { fmt, statusIcon, truncate } from "./ansi";
import type { VerificationDocument, VerificationStepState } from "../../src";

type StepStatus = "pending" | "loading" | "success" | "error";

function mapStepStatus(step: VerificationStepState): StepStatus {
  if (step.status === 'success') return 'success';
  if (step.status === 'failed') return 'error';
  return 'loading';
}

export function displayVerificationSteps(doc: VerificationDocument): void {
  console.log();
  console.log(fmt.bold("Enclave Attestation Verification"));

  const digestLine = doc.releaseDigest ? truncate(doc.releaseDigest, 16) : fmt.dim("resolving…");
  console.log(`${fmt.dim("┌")} ${fmt.bold("Digest")} ${fmt.dim("→")} ${digestLine}`);

  const runtimeIcon = statusIcon(mapStepStatus(doc.steps.verifyEnclave));
  console.log(`${fmt.dim("├")} ${fmt.bold("Runtime")} ${runtimeIcon}`);

  const codeIcon = statusIcon(mapStepStatus(doc.steps.verifyCode));
  console.log(`${fmt.dim("├")} ${fmt.bold("Code")}    ${codeIcon}`);

  const verificationIcon = statusIcon(mapStepStatus(doc.steps.compareMeasurements));
  console.log(`${fmt.dim("└")} ${fmt.bold("Verification")} ${verificationIcon}`);
  console.log();
}

