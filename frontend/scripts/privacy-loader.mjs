import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export default {};",
    };
  }

  if (specifier === "next/server") {
    const nextServerPath = path.join(process.cwd(), "node_modules/next/server.js");
    if (fs.existsSync(nextServerPath)) {
      return {
        shortCircuit: true,
        url: pathToFileURL(nextServerPath).href,
      };
    }
  }

  let candidatePath = null;

  if (specifier.startsWith("@/")) {
    candidatePath = path.join(process.cwd(), ".dist/src", specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (context.parentURL) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname);
      candidatePath = path.resolve(parentDir, specifier);
    }
  }

  if (candidatePath) {
    let target = candidatePath;
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, "index.js");
    } else if (!target.endsWith(".js") && !target.endsWith(".json") && !target.endsWith(".mjs")) {
      if (fs.existsSync(`${target}.js`)) {
        target = `${target}.js`;
      } else if (fs.existsSync(path.join(target, "index.js"))) {
        target = path.join(target, "index.js");
      } else {
        target = `${target}.js`;
      }
    }

    if (fs.existsSync(target)) {
      return {
        shortCircuit: true,
        url: pathToFileURL(target).href,
      };
    }
  }

  return nextResolve(specifier, context);
}
