declare global {
  class Go {
    importObject: WebAssembly.Imports;
    run(instance: WebAssembly.Instance): Promise<void>;
  }
  function verifyEnclave(enclaveHostname: string): Promise<{
    certificate: string; // This is incorrectly named now in the WASM binding. This contains the hex public key fingerprint.
    publicKeyFP: string;
    measurement: string;
  }>;
  function verifyCode(repo: string, digest: string): Promise<string>;
}

export {};
