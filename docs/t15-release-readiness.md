# T15 Release Readiness - System Hardening and Regression Testing

## 1. Developer Information

- Name: `Zyrus Alvez`
- GitHub Username: `ZyrusAlvez`
- Technology Stack: `JavaScript with Express.js`
- T15 Branch: `feature/t15-system-hardening`

## 2. Release Candidate Baseline

The **Before T15** column is the T14 code (commit `407595d`, "feat: build csms dashboard") with no T15 changes. The **After T15** column is this branch.

Each item was checked in two places:
- **Existing workspace:** the developer's own folder, where `data/csms.db` already existed.
- **Fresh clone:** a new `git clone` of the repository, with no `data/` folder.

| Item | Before T15 | After T15 | Notes |
|---|---|---|---|
| Application startup | Workspace: PASS. Fresh clone: **FAIL** | PASS in both | Before T15, `npm start` on a fresh clone crashed with `Error: unable to open database file`. `data/` is not in git (`*.db` is git-ignored), and SQLite does not create missing folders. Fixed in Section 3, row 1. |
| `/health` | PASS | PASS | `200 {"status":"ok", ...}` |
| Dashboard | PASS | PASS | |
| Resident Management | PASS | PASS | |
| Service Request Management | PASS | PASS | |
| Automated tests (`npm test`) | Workspace: 164/164 pass. Fresh clone: **126 pass, 22 fail**, and `test/application.test.js` crashed | 170/170 pass in both | The fresh-clone failures had the same missing-folder cause. 170 = 164 existing + 6 new T15 tests. |

The fresh-clone failure was the only release-blocking defect found. It existed in T14 and is **fixed in T15**.

## 3. Hardening Changes

Rows 1-6 are defects or risks that were fixed. Rows 7-12 were reviewed and needed no change.

| # | Area | Issue or Risk Found | Action Taken | Files Changed | Test/Evidence |
|---|---|---|---|---|---|
| 1 | Fresh-clone startup (release blocker) | **Release blocker (present in T14).** A fresh clone has no `data/` folder, so the app could not start and 22 tests plus the starter test file failed. | `openDatabase()` creates the database's parent folder (`fs.mkdirSync(..., { recursive: true })`) before opening SQLite. No schema or data change. | `src/database/connection.js` | `T15-6`; full suite run in a fresh clone: 170/170 pass; server started from a fresh clone. |
| 2 | Malformed requests | Malformed requests that Express rejects before any controller runs (unparseable JSON body, undecodable URL segment such as `/residents/%E0%A4%A/edit`, body over the size limit) returned **HTTP 500 "Something Went Wrong"** and printed a full stack trace to the server log, even though they are client errors (400/413). | `errorHandler` keeps the 4xx status for client errors and renders a controlled "Invalid Request" / "Request Too Large" page that says nothing was saved, without logging a stack trace. Real server errors still log and show the generic 500 page. | `src/middleware/errorHandler.js`, `src/views/errors/client-error.ejs` (new) | `T15-1` |
| 3 | Search input handling | Resident name search put user input straight into a `LIKE` pattern, so `%` and `_` acted as wildcards (`?search=%` listed every Resident). Service Request search already escaped them, so the two modules handled the same rule differently. The value was always bound as a parameter (no SQL injection), but the user's input changed how the match worked. | Moved the existing `escapeLikePattern` into one shared helper. Both repositories now use it with `LIKE ? ESCAPE '\'`. Trimmed, partial, case-insensitive matching (T05) is unchanged. | `src/repositories/sqlHelpers.js` (new), `src/repositories/ResidentRepository.js`, `src/repositories/ServiceRequestRepository.js` | `T15-5`; all T05/T11 search tests still pass |
| 4 | Test reliability | `test/application.test.js` called `createApp()` with no repositories, and `test/residentInterface.test.js` passed only a Resident repository. Both opened the **permanent `data/csms.db`** (creating tables there, plus one unclosed connection per Resident-interface test) and failed whenever that folder was missing. | Setup only: both files now use a temporary database for every repository and close/remove it afterwards. **No assertion was changed, removed or skipped.** | `test/application.test.js`, `test/residentInterface.test.js` | Both files pass with `data/` absent; no `csms-t04-*` temp files left after a run. |
| 5 | Template output safety | The dashboard metric partial built HTML in a JavaScript string and printed it raw with `<%- %>`. The values come from the server (labels and SQL counts), not from users, so this was a risk rather than an exploitable bug. | Rewrote `_metric.ejs` so the label and value are printed with escaped `<%= %>`. Markup and `data-metric` attributes are unchanged. | `src/views/dashboard/_metric.ejs` | All 17 T14 dashboard tests pass unchanged |
| 6 | Outdated comment | The `Resident.js` header comment still said "placeholder ... future ticket". | Corrected the comment. Comment only, no code change. | `src/models/Resident.js` | - |
| 7 | Persistence integrity | Reviewed: Resident registration, update and deactivation, plus Service Request submission and status changes. All validate before any write. Updates write all fields in one `UPDATE`, so a rejected update cannot be half-saved. | Reviewed - no defect identified. | - | `T15-2`, existing T04/T06/T07/T09/T10 tests |
| 8 | HTTP / mutation safety | Reviewed every route. Only GET routes read data, and every state change is a POST that answers with `303` (Post/Redirect/Get). GET on a mutation URL returns 404. | Reviewed - no defect identified. | - | `T15-3` |
| 9 | SQL query safety | Reviewed all SQL in both repositories. Every value is bound with `?`. The only text joined into SQL is fixed code (`ORDER BY` constant, `WHERE` clauses chosen by code). Dashboard figures use SQL `COUNT(*)`/`GROUP BY` and `LIMIT`. | Reviewed - no other defect identified. | - | Existing T14 aggregate tests |
| 10 | Workflow / lifecycle | Reviewed: Resident Active -> Inactive only (no reactivation, no DELETE). The Service Request transition map has 4 allowed moves. Completed/Cancelled are terminal, and same-state moves and unsupported statuses are rejected in `ServiceRequestStatusService`, not only in the UI. | Reviewed - no defect identified. | - | `T15-4`, existing T07/T10 tests, Section 6 workflow and transition checks |
| 11 | Missing / malformed IDs | Reviewed: `parseId` accepts only positive whole numbers, so `abc`, `0`, `-1` and huge numbers get a controlled 404 page. Unknown IDs never create a record. | Reviewed - no defect identified (the undecodable-path case is covered in row 2). | - | Manual scenario 11 |
| 12 | Interface / navigation | Reviewed: every page shares the header navigation (Dashboard / Residents / Service Requests), and every internal link found on the main pages returns 200. Feedback messages exist for every success and failure. | Reviewed - no defect identified. | - | Manual scenario 12 (automated link crawl) |

## 4. Five New T15 Hardening Tests

All tests are in `test/systemHardening.test.js`. Each one runs the real application (HTTP -> controller -> service -> SQLite) on its own temporary database.

### Test 1 - `T15-1 malformed requests are rejected with a controlled 4xx page and persist nothing`

- **Category:** 1 - Invalid or Malformed Input
- **What it verifies:** It sends three malformed requests: a broken JSON body to `POST /residents`, an undecodable ID segment to `POST /service-requests/%E0%A4%A/complete`, and a 200 KB form body. They return 400, 400 and 413 with a controlled page, and no page shows a stack trace, error class name or SQL. Both tables are unchanged afterwards and `/health` still responds.
- **Why it adds value:** Earlier tests only sent well-formed requests that reached a controller. These requests fail inside Express before any CSMS code runs, which is where the real 500-plus-stack-trace defect was. The test fails on the T14 code.

### Test 2 - `T15-2 rejected Resident update with smuggled id/status and one invalid field changes nothing`

- **Category:** 2 - Rejected Mutation Protects Persistence
- **What it verifies:** It posts an update to Maria with valid new names, address and contact number, one invalid email, and extra `id` (Pedro's ID) and `status=Inactive` fields that the form never offers. The response is 422 with the email message. Maria and Pedro are then read again and must be exactly as before (`deepEqual`), and the Resident count is still 2.
- **Why it adds value:** It combines two attack paths in one request: a partial update (most fields valid) and fields that should never be accepted from a form (`id`/`status`). It checks that the whole update is rejected and that a *different* Resident is not affected.

### Test 3 - `T15-3 every browser GET page, and GET on mutation-only URLs, leaves persistence unchanged`

- **Category:** 3 - Read-Only Request Safety
- **What it verifies:** It loads 16 read-only pages twice each (home, health, dashboard, Resident list/search/blank search/new/edit for Active and Inactive, and Service Request list/search/filter/combined/new/details). It also sends GET to four mutation-only URLs (`/deactivate`, `/start-processing`, `/cancel`, `/complete`), which must return 404. Every row of both tables is then compared with the snapshot taken first.
- **Why it adds value:** The existing read-only tests each cover one module. This one covers every GET page in the application, including refresh, and shows that a link or prefetch to an action URL cannot change a record.

### Test 4 - `T15-4 Resident deactivation blocks new requests, keeps existing ones workable, and syncs the Dashboard`

- **Category:** 4 - Cross-Feature Regression
- **What it verifies:** Every step goes through HTTP. It deactivates Maria (T12/T07). A new Service Request for her is then rejected with the Inactive message and nothing is saved (T13/T09). Her existing In Progress request can still be completed (T13/T10). She is still found by name search and shown as Inactive (T05/T12). The Completed request appears under the Completed filter (T11/T13). The Dashboard shows 1 Active, 1 Inactive, 1 Completed and 0 Open (T14).
- **Why it adds value:** Six tickets are checked in one end-to-end flow. Earlier tests covered each pair at the service level. This test would catch, for example, deactivation blocking the workflow of requests that already exist, or Dashboard figures drifting from the saved data.

### Test 5 - `T15-5 Resident search treats % and _ literally (no-match boundary) while partial search still works`

- **Category:** 5 - Repeatability / Boundary Behavior
- **What it verifies:** `?search=%` returns no rows and shows "No Residents found." `?search=_` returns only the Resident whose name contains `_`. A repeated repository search for `%` returns `[]` both times. The T05 behavior still works: `"  SANT "` finds Santos, and a blank search lists all three Residents.
- **Why it adds value:** It covers the boundary between "no match" and "match everything" for special characters, and keeps the Resident and Service Request search rules consistent. It fails on the T14 code, where `%` listed every Resident.

### Additional regression test - `T15-6 the database folder is created when missing (fresh clone has no data/ directory)`

This is a guard for the release-blocking defect, added on top of the five required tests. It opens a database inside a folder that does not exist and asserts that the file is created. The test fails on the T14 code.

Before relying on them, all six tests were run against the unmodified T14 code. Tests 1, 5 and 6 **failed** there, which confirms they detect the defects that were fixed. Tests 2, 3 and 4 **passed** there, because they protect behavior that was already correct.

## 5. Full Regression Test Results

- **Test command:** `npm test` (runs `node --test`, which picks up every `test/*.test.js`: starter, T01-T14 including the T10 student-designed midterm test, and T15)
- **Runtime used:** Node.js v22.22.1
- **Run 1:** PASS - `# tests 170`, `# pass 170`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`
- **Run 2:** PASS (run immediately after Run 1) - `# tests 170`, `# pass 170`, `# fail 0`, `# skipped 0`
- **Total passing tests reported:** **170** (164 starter-T14 + 6 T15)
- **Extra check:** the same suite in a fresh `git clone` with no `data/` folder: 170/170 pass.
- **Leftover check:** the number of temporary `csms-t04-*` database files was the same before and after a full run, so no test leaves files behind.

## 6. Manual Release Verification

Performed on 2026-11-17. The server ran from a fresh clone of the hardened code (`PORT=3115 node src/server.js`) starting with an empty database, so the developer's local data was not touched. Actions were made over real HTTP (curl), and the SQLite tables were queried directly after each action.

| Verification | Result | Notes |
|---|---|---|
| Application starts | PASS | Started from a fresh clone with no `data/` folder; the folder and database were created automatically. |
| /health works | PASS | `200 {"status":"ok","application":"Community Services Management System","version":"0.1.0"}` |
| Dashboard loads | PASS | Shows all metric cards and Recent Service Requests (empty state shown at first). |
| Resident listing/search works | PASS | Listing, partial case-insensitive search, blank search lists all, and Inactive Residents are listed. |
| Valid Resident registration works | PASS | 303 redirect to the list. The new row has a generated id and status `Active`, and appears on the list. |
| Invalid Resident registration is rejected | PASS | 422 with messages; the row count stayed at 2. |
| Resident update works | PASS | Name, address and email changed. The id stayed the same, and status stayed `Active` even though `status=Inactive` and `id=9` were in the body. |
| Resident deactivation works and record remains visible | PASS | Status became `Inactive`, the row was kept, and it is found by name search. Deactivating again gives "Resident is already inactive." with no change. |
| Valid Service Request submission for Active Resident works | PASS | Generated id, correct `resident_id`, status `Pending` (a `status=Completed` field in the body was ignored), and the details page returns 200. |
| Missing/Inactive Resident submission is rejected | PASS | "Resident not found. Check the Resident ID." / "Inactive Residents cannot submit new Service Requests." The Service Request count did not change. |
| Service Request search/filter/details work | PASS | Listing ordered by date then id descending, text search, status filter, combined search + status, details page. An unsupported filter (`Archived`) gives a controlled 400. |
| Valid Service Request workflow works | PASS | Pending -> In Progress -> Completed, each step a 303 redirect with a notice. Pending -> Cancelled also works. |
| Invalid/terminal transition is rejected | PASS | Pending -> Completed gives 409 and the status stays Pending. All three actions on Completed and on Cancelled give 409 with no change. Terminal requests are still viewable and appear under their status filter. |
| Dashboard reflects Resident/Service Request changes | PASS | Before: 3 Pending / 3 Open. After the workflow: 1 Pending, 1 Completed, 1 Cancelled, 1 Open. Resident deactivation showed as 1 Active / 1 Inactive. |
| Read-only GET operations do not modify persistence | PASS | 8 pages loaded 3 times each, and GET on 3 action URLs returned 404. Both tables were identical before and after. |

Additional scenarios:
- **Scenario 11 - missing/malformed records:** `/residents/999999/edit`, `/service-requests/999999`, `/residents/abc/edit` and `/service-requests/not-a-number` give a controlled 404 page. POST update/deactivate/complete on ID 999999 gives 404. An undecodable path or malformed JSON gives a controlled 400. Nothing was created, and the server log has no stack traces.
- **Scenario 12 - navigation:** every page has Dashboard / Residents / Service Requests in the header, and the home page links to all three. Every internal link collected from the main pages returned 200.

## 7. Repository Hygiene Review

| Check | Checked | Result / Cleanup |
|---|---|---|
| Debug output | Yes | No `console.log`/`debugger` left. The only `console.log` is the server startup message, and `console.error` is kept in the error handler for real 500 errors. Expected 4xx client errors no longer print stack traces. |
| Temporary files | Yes | None tracked. Tests write their databases to the OS temp folder and delete them; removed some stray files left by pre-fix runs. |
| Generated build/runtime artifacts | Yes | None tracked. `node_modules/`, coverage and build folders are git-ignored. |
| Accidental local database files | Yes | `data/csms.db` exists only locally and is ignored by `*.db`; not tracked. Tests no longer open it. |
| Commented-out abandoned code | Yes | None found. Corrected one outdated comment in `Resident.js`. |
| Secrets/credentials | Yes | None. No `.env`, passwords, tokens or keys in tracked files. Host/port come from `HOST`/`PORT` environment variables with local defaults. |
| Broken navigation/links | Yes | None. Crawled the internal links and all returned 200. |
| Direct SQL parameter binding | Yes | Every value is bound with `?`. `LIKE` input is now also escaped in both repositories. |

Starter files `src/services/RequestService.js`, `src/services/ResidentService.js` and `src/utils/validators.js` are empty starter placeholders that nothing imports. They were **kept on purpose** because the starter repository provides them.

## 8. Known Limitations

These remain but are outside the T01-T15 requirements, so they were not implemented under feature freeze:

- **No authentication, authorization or CSRF tokens.** Any local user can perform every action. Login and roles are explicitly out of scope.
- **Concurrent edits:** a status change reads and then writes in two statements, so two people acting on the same Service Request at the same instant could race. This does not matter for the single-user local use the course targets.
- **Unknown non-CSMS URLs** (e.g. `/does-not-exist`) return the starter's JSON 404 instead of an HTML page. This JSON contract is asserted by the starter test, so it was kept.
- **Starter home page** (`/`) still shows "Current Sprint: Sprint 0 - Developer Onboarding", because the starter test asserts that text. Navigation from it works.
- **Styling uses the Tailwind CDN script.** Without internet access pages still work but lose their styles.
- **Runtime version:** `package.json`/`.nvmrc` target Node 24. This verification ran on Node 22.22.1, where `node:sqlite` works but prints an `ExperimentalWarning` at startup.

No known release-blocking limitations identified within the defined CSMS scope. This does not claim the software is free of defects.

## 9. Release Candidate Statement

**READY FOR T16 FINAL EXAM**

- The T14 code had one release-blocking defect: a fresh clone could not start or pass its tests (Section 2). T15 fixes it (Section 3, row 1), and test `T15-6` guards against it coming back.
- After the fix, the full suite passed twice in the existing workspace and once in a fresh clone, 170/170 each time (Section 5).
- Every manual verification item passed. The server for those checks also ran from a fresh clone (Section 6).
