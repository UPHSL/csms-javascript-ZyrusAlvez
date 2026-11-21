# T16 Final Development Checkpoint

## 1. Developer Information

- **Name:** Zyrus Alvez
- **GitHub Username:** ZyrusAlvez
- **Technology Stack:** JavaScript with Express.js
- **T16 Branch:** `feature/t16-final-release`
- **Final Release Version:** 1.0.0

## 2. My Final Release Implementation

The release version is defined in one place: the `version` field of `package.json`, which is now `1.0.0`. In a Node.js project, `package.json` is already the standard place for the version, and `npm version` updates it there, so a second copy would only create a value that could drift. `src/config/application.js`, which already held the application's name and other settings, now reads the version from `package.json` once at startup instead of hardcoding `"0.1.0"`. The `/health` controller already built its response from `applicationConfig`, so it reports `1.0.0` with no change of its own. For the browser interface, `createApp()` copies the short name and version from the same config into `app.locals`. Express makes `app.locals` available to every template, so the shared `footer.ejs` partial can show `CSMS v1.0.0` without any controller passing it in. Every page that uses the shared layout, including the 404 and error pages, gets the footer automatically. The home page already displayed `applicationConfig.version`, so it shows the same value. A future `1.0.1` release only needs `package.json` changed. No controller, route or template contains a version number.

## 3. Files I Changed

| File | Purpose of the change |
|---|---|
| `package.json` | Release version changed from `0.1.0` to `1.0.0`. This is the single source of truth. |
| `package-lock.json` | Root package version updated to `1.0.0` to match `package.json`, as `npm version` would do. No dependency changed. |
| `src/config/application.js` | Reads `version` from `package.json` instead of a hardcoded copy, and adds `shortName: "CSMS"`. |
| `src/app.js` | Puts `applicationShortName` and `applicationVersion` into `app.locals`, so every template can use them. |
| `src/views/partials/footer.ejs` | Adds the shared footer `CSMS v1.0.0`, marked with `data-release-version`. |
| `test/application.test.js` | The starter test's expected version changed from `0.1.0` to `1.0.0` in two places. This is the requirement changing, not a weakened test: the same assertions remain. |
| `test/finalRelease.test.js` (new) | The Final Examination integration test and the release-version test. |
| `docs/release-v1.0.0.md` (new) | Official v1.0.0 release notes. |
| `docs/final-checkpoint.md` (new) | This document. |

## 4. My Final Examination Test

- **Test Name:** `registered Resident's Service Request workflow outcomes survive an application restart and drive search, details and Dashboard` (in `test/finalRelease.test.js`)
- **Modules/Responsibilities Covered:**
  - Resident registration (T04/T12)
  - Service Request submission and Resident eligibility (T09/T13)
  - Status workflow and terminal protection (T10/T13)
  - SQLite persistence (T03/T08)
  - Search, status filter and details (T11/T13)
  - Dashboard aggregation (T14)
- **Starting State:** a new temporary SQLite database with no Residents and no Service Requests. The test asserts both counts are 0.
- **Operations Performed:**
  1. Register a Resident through `POST /residents`.
  2. Submit two Service Requests for that Resident through `POST /service-requests`.
  3. Move the first request Pending -> In Progress -> Completed, and cancel the second.
  4. Try to cancel the Completed request; it must be rejected with 409.
  5. **Restart:** close both repositories, then build a completely new application on the same database file.
  6. Using only the new instance, read back the stored records, the Completed and Cancelled filters, the details page and the Dashboard.
- **Expected Final State:**
  - The Resident is stored as Active.
  - Exactly 2 Service Requests exist: the first Completed, the second Cancelled.
  - Each status filter lists exactly its one request.
  - The Completed request's details page says it is final and shows no action buttons.
  - The Dashboard shows 1 Resident (1 Active), 2 requests, 1 Completed, 1 Cancelled and 0 Open, with the newest request first in the Recent list.
- **Why This Test Is Meaningful:** A unit test of `ServiceRequestStatusService` proves the transition table is correct, but not that the browser actions call it, that the result is written to SQLite, or that the other pages read it back. This test starts from nothing and goes through the same HTTP routes a user would. The restart step is what T15-4 and earlier tests don't do: every assertion after it is answered by a new application reading the database file. A result that existed only in memory, or a write that never reached SQLite, would fail here. It also checks that four separate read paths agree with what was written: the repository, the status filter, the details page and the Dashboard aggregates.

The release version has its own test in the same file, `CSMS identifies itself as release 1.0.0 in /health and on every managed page`. It checks:
- `package.json` holds `1.0.0`.
- `/health` returns exactly `{status: "ok", application, version: "1.0.0"}` with nothing sensitive in it.
- `v1.0.0` appears in the footer of the Dashboard, Resident and Service Request pages, and of a 404 page.

I confirmed that this test **fails** when `package.json` is set back to `0.1.0`.

## 5. My Final Technical Decision

- **Decision:** `package.json` is the authoritative release version, and `src/config/application.js` reads it from there.
- **Alternative Considered:** Keep the version as a hardcoded string in `src/config/application.js`, which is where the starter put `"0.1.0"`, and only edit `package.json` by hand to match.
- **Reason for My Decision:** Before T16 the project already had two independent copies of the version, `package.json` and the config file, which happened to agree at `0.1.0`. Keeping both would mean two places to update for every release, and nothing would stop them from drifting apart. `package.json` is what npm, `npm version` and other Node tools read, so it was the right one to keep. The config module stays the single place where the rest of the application gets the version, so controllers and templates did not change. I used `fs.readFileSync` with `JSON.parse` instead of a JSON `import`. It is plain, synchronous, and works the same on Node 22 and Node 24 without relying on JSON module support.

## 6. Problem or Verification Issue Encountered

- **Problem:** Raising the version to `1.0.0` conflicts with the starter test file `test/application.test.js`. Its test `health endpoint returns the expected payload` deep-compares `/health` to a body containing `version: "0.1.0"`, and `home page displays the CSMS starter details` matches `/0\.1\.0/`. The T16 rules also forbid changing established tests to accept an incorrect implementation.
- **Cause or Investigation:** I checked whether this was a regression or a changed requirement. The starter `0.1.0` was the pre-release version, and T16 explicitly requires the running application to report `1.0.0`. So the expected value itself changed; the behavior being checked did not. I also checked whether to add new fields (such as a `shortName`) to `/health`. The existing payload already gives the application's identity, version and status, and keeping its exact shape means the starter's `deepEqual` still checks that no extra or unsafe data is exposed.
- **Resolution:** I changed only the two expected version values in the starter test, from `0.1.0` to `1.0.0`. No assertion was removed, loosened or skipped. The `/health` payload keeps its original three keys. The new release-version test guards the version on its own and fails if it is changed back to `0.1.0`.

## 7. Final Regression Results

- **Test Command:** `npm test` (runs `node --test` over every `test/*.test.js`: starter, T01–T14 including the T10 midterm test, T15 hardening and T16 final release)
- **Runtime:** Node.js v22.22.1
- **Final Regression Run 1:** PASS – `# tests 172`, `# pass 172`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`
- **Final Regression Run 2:** PASS (run immediately after Run 1) – `# tests 172`, `# pass 172`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`
- **Total Passing Tests Reported:** 172 (170 from T15 + 2 new T16 tests)
- **Leftover check:** no temporary `csms-t04-*` database files remained after the runs.

## 8. Tools and References Used

- Node.js documentation: `node:test`, `node:sqlite`, `fs`, ES modules and `import.meta.url`
- Express 5 documentation: `app.locals` and `res.render`
- EJS documentation: includes and escaped output
- npm documentation: the `version` field in `package.json` and `npm version`
- Existing CSMS documentation: `docs/architecture.md`, `docs/release-workflow.md`, `docs/t15-release-readiness.md`
- Git and GitHub documentation: annotated tags and GitHub Releases
- VS Code
- Claude and ChatGPT

## 9. Final Release Declaration

CSMS v1.0.0 - READY FOR RELEASE
