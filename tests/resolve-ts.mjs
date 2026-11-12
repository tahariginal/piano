// Lets Node's built-in TypeScript support run src/ modules, which import
// siblings without an extension (the bundler resolves those in the app).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});
