import { describe, it, expect } from 'vitest';
import { Report } from '../src/sev/report.js';
import { bytesToHex } from '../src/sev/utils.js';

describe('Pipeline Tests', () => {
  it('parses base64 decoded report correctly', () => {
    const testData = 'AgAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAAHAAAAAAAOSAEAAAAAAAAAAAAAAAAAAAA2NTA4M2U1OTA0YzAyNzNiNjQ0YWQ5MGU1MWUxMmE4ZDc2ZmUwN2YyYWI4YWIxNGQ3NjAxMWIzZTljN2RjYWE3/xjwoozRULthI6omat8HtO2sit6UIIXxtSg9N3UO6SSsFhmcK/7H1Cpqs5ZDVGhfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdBxIi99geB/i1RZESMaqxQ16ZvxamaRZFtfTvS1Lxyv//////////////////////////////////////////BwAAAAAADkgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADyerBPBb0BVIg1GpCjfyjOa7GVEfbmBlI2UlOv2mBy2PUlhAoxzCPRyGlUox+FWyw/5T1fgVISjEAzuoWzsKeXBwAAAAAADkgVNwEAFTcBAAcAAAAAAA5IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhZYloXhwZZb828qeGleqZN4eGkiOvEyJUM482aIEIgityc5bRqJSr6aRTOBRL4AuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMXv4mBcfDUnlLzSpArjSFiBY/exLh+FuPJ5LI5ieVp6eGvUCXEZ5maXMpMck33YMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

    const binaryString = atob(testData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const report = new Report(bytes);

    expect(report.version).toBe(2);

    const measurementHex = bytesToHex(report.measurement);
    expect(measurementHex).toBe('ff18f0a28cd150bb6123aa266adf07b4edac8ade942085f1b5283d37750ee924ac16199c2bfec7d42a6ab3964354685f');

    const reportDataText = new TextDecoder().decode(report.reportData);
    expect(reportDataText).toBe('65083e5904c0273b644ad90e51e12a8d76fe07f2ab8ab14d76011b3e9c7dcaa7');
  });

  it('decompresses gzip data correctly', async () => {
    const compressedData = 'H4sIAAAAAAAA/2JmgAEEixBgZGBg4AKzxEPU0eQETrU6V/UVB3t6X/nzPHnDqkuB7Ge7tj5ZEHio29Wfkc1uX9Sclq9brfxurj5f8/1vsLnEKWGd+VvbrZlW1uopNP7g1X277qF1y53Evj/F31o35j7JULPg0r0S+zF28d3utXtmKJ26X/2ndOpEHVfxXfmrpYMOEO1oGgGNBec2/VR6lX2Gl0OiQHRZX6rfLIn+iuYbKf+jFB4bqZ34TwDAwlFSkBGr+VIfV+XIhzFXsbbMitzRGPOTM8J+9sr3+qxGEkfMP1svbH7yRHSD5eb6JlZVrovx3R0LFq+9+eVA44HyWR5vlUTM+1xg5muYMzKAMIxPxyCiCHQ6e7XWK8xY82mR/JozTx04Vy5l8FSb5PHojvm2wD2bL32f4PhFweCczqKfEgb9gr/XG+Iy57HDxR1FBzhUzT5FZUW/TOHzX/fB7uei0kcHzO5v62TjbzG4Zxh1YsrdgwmpTrsN8vatoq8vRwEuAAgAAP//tiY3daAEAAA=';

    const binaryString = atob(compressedData);
    const compressedBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedBytes[i] = binaryString.charCodeAt(i);
    }

    // Use browser's DecompressionStream API
    const stream = new Response(compressedBytes).body!;
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const decompressedBytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer());

    const report = new Report(decompressedBytes);

    expect(report.version).toBeGreaterThanOrEqual(2);
    expect(report.version).toBeLessThanOrEqual(3);

    const measurementHex = bytesToHex(report.measurement);
    expect(measurementHex).toBe('2dedaee13b84dc618efc73f685b16de46826380a2dd45df15da3dd8badbc9822cadf7bfc7595912c4517ba6fab1b52c0');
  });
});
