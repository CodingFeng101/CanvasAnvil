import { register } from "node:module";

/** Installed via `node --import` so the hooks are in place before any test loads. */
register("./raw-md-loader.mjs", import.meta.url);
