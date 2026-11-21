/**
 * Shared CSMS application and server configuration.
 */

import fs from "node:fs";

// T16: package.json is the single source of truth for the release version
// (the npm convention; `npm version` updates it). Everything that reports or
// displays the version (/health, the shared page footer, the home page) reads
// applicationConfig.version, so a release bump changes one value only.
const packageManifest = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);

export const applicationConfig = Object.freeze({
  name: "Community Services Management System",
  shortName: "CSMS",
  version: packageManifest.version,
  currentSprint: "Sprint 0 - Developer Onboarding",
  technology: "JavaScript with Express.js"
});

export const serverConfig = Object.freeze({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000)
});
