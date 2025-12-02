import Module from "module";

const testRequire = Module.createRequire(__filename);

export async function withMockedModules(
  mocks: Record<string, unknown>,
  modulesToReload: string[],
  run: () => Promise<void>,
): Promise<void> {
  const moduleAny = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleAny._load;

  moduleAny._load = function (request: string, parent: unknown, isMain: boolean) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    // eslint-disable-next-line prefer-rest-params
    return originalLoad.apply(this, arguments as unknown as [string, unknown, boolean]);
  };

  const restoredCache: Array<{ path: string; cached: NodeModule | undefined }> = [];
  for (const specifier of modulesToReload) {
    try {
      const resolved = testRequire.resolve(specifier);
      restoredCache.push({ path: resolved, cached: require.cache[resolved] });
      delete require.cache[resolved];
    } catch {
      // Module not yet cached; nothing to remove.
    }
  }

  try {
    await run();
  } finally {
    moduleAny._load = originalLoad;
    for (const entry of restoredCache) {
      if (entry.cached) {
        require.cache[entry.path] = entry.cached;
      } else {
        delete require.cache[entry.path];
      }
    }
  }
}
