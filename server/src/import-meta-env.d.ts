// server/src imports server/../src/lib/config, which reads import.meta.env (a Vite-only
// feature). The frontend gets this typing from "vite/client"; the server workspace has no
// DOM lib and no vite dependency, so tsc doesn't know ImportMeta.env exists. This minimal
// ambient declaration satisfies that one property access without pulling in vite/client's
// full (DOM-dependent) type surface.
interface ImportMetaEnv {
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
