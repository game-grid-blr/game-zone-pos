import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const withoutAlias = specifier.slice(2);
    for (const extension of [".ts", ".tsx", ".js"]) {
      const candidate = resolvePath(root, "src", `${withoutAlias}${extension}`);
      if (await exists(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error.code === "ERR_MODULE_NOT_FOUND" &&
      context.parentURL &&
      (specifier.startsWith("./") || specifier.startsWith("../"))
    ) {
      const parentDir = dirname(fileURLToPath(context.parentURL));
      for (const extension of [".ts", ".tsx", ".js"]) {
        const candidate = resolvePath(parentDir, `${specifier}${extension}`);
        if (await exists(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    throw error;
  }
}
