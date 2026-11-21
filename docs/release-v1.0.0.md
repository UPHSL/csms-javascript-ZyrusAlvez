# CSMS v1.0.0 Release Notes

## 1. Release

- **Application:** Community Services Management System
- **Release:** v1.0.0
- **Release Type:** Final Course Release

## 2. Release Summary

CSMS v1.0.0 is a browser-based system for managing a community's Residents and the Service Requests they submit. Staff can register, search, update and deactivate Residents. They can also submit Service Requests for Active Residents and move each request through a controlled workflow, from Pending to Completed or Cancelled. A Dashboard summarizes the current state of both. Every record is stored in SQLite, and every rule (validation, eligibility, allowed status changes) is enforced on the server, not only in the pages. The running application reports its release identity as version `1.0.0` at `/health` and in the footer of every managed page.

Built with JavaScript (Node.js, ES modules), Express 5, EJS templates, Node's built-in `node:sqlite`, and the Node test runner with Supertest.

## 3. Resident Management Capabilities

- **Register** a Resident with first name, last name, address, contact number and email. All five are validated (required fields, digits-only contact number, valid email format). The database generates the ID, and new Residents always start as `Active`.
- **List and search** Residents by name. The search is trimmed, partial and case-insensitive, and a blank search lists everyone. `%` and `_` are treated as ordinary characters.
- **Update** a Resident's details. The whole update is validated first, so a rejected update changes nothing. The ID and status can never be changed through the form.
- **Deactivate** a Resident (Active -> Inactive). This is a soft deactivation: the record stays stored, searchable and visible, and an Inactive Resident cannot submit new Service Requests. There is no reactivation and no physical deletion.

## 4. Service Request Management Capabilities

- **Submit** a Service Request (service type, description, date requested) for a Resident. The Resident must exist and be `Active`. Every new request starts as `Pending`, and nothing is saved if any check fails.
- **List** all Service Requests, newest date first.
- **Search** by service type or description (partial, case-insensitive), **filter** by status, or combine both. An unsupported status filter is rejected with a controlled message.
- **View details** of a single request, including only the actions its current status allows.
- **Controlled workflow** (enforced by `ServiceRequestStatusService`):

  | From | Allowed moves |
  |---|---|
  | Pending | In Progress, Cancelled |
  | In Progress | Completed, Cancelled |
  | Completed | none (final) |
  | Cancelled | none (final) |

  Any other move, including a move to the same status, is rejected with HTTP 409 and nothing is changed. Completed and Cancelled requests stay on record and remain viewable.

## 5. Dashboard Capabilities

The read-only Dashboard (`/dashboard`) shows, from live data:

- **Residents:** total, Active, Inactive.
- **Service Requests:** total, plus counts for Pending, In Progress, Completed and Cancelled.
- **Open Service Requests:** Pending + In Progress, the work still to be done.
- **Recent Service Requests:** the five most recent requests, in the same order as the Service Request list.

All counts are computed by SQLite (`COUNT`/`GROUP BY`). Loading the Dashboard never changes data.

## 6. Quality and Hardening

**T15 (system hardening):**
- Fixed a release blocker: a fresh clone could not start because the `data/` folder did not exist.
- Malformed requests now get a controlled 400/413 page instead of a 500 error.
- `%`/`_` in Resident search are now escaped.
- Two test files were moved off the permanent database.
- The Dashboard metric partial now escapes its output.
- Reviewed the system for persistence integrity, read-only GET safety, SQL parameter binding, workflow rules, invalid IDs and navigation.

**T16 (final release):**
- Established one authoritative release version (`package.json`, read by `src/config/application.js`).
- `/health` reports it, and the shared footer shows `v1.0.0` on every managed page.
- Added a Final Examination integration test that runs a workflow across an application restart, and an automated release-version test.
- Repeated the full regression and manual acceptance checks.

## 7. Final Verification

Results from `feature/t16-final-release`. They are re-confirmed on merged `main` before the `v1.0.0` tag is created.

| Item | Result |
|---|---|
| Final Regression Run 1 | **PASS** – 172 tests, 172 pass, 0 fail |
| Final Regression Run 2 | **PASS** – 172 tests, 172 pass, 0 fail |
| Application Startup | **PASS** – started with no existing `data/` folder; the database was created automatically |
| /health | **PASS** – `200 {"status":"ok","application":"Community Services Management System","version":"1.0.0"}`; no secrets, paths or internals |
| Dashboard | **PASS** – all Resident and Service Request metrics, Open count and Recent list match the stored data |
| Resident Management | **PASS** – listing, search, valid and invalid registration, update, deactivation |
| Service Request Management | **PASS** – submission, Inactive/missing Resident rejection, listing, search, status filter, details, Pending -> In Progress -> Completed, Pending -> Cancelled, invalid and terminal moves rejected (409) |
| Read-only safety | **PASS** – repeated page loads and GET on action URLs (404) left both tables unchanged |
| Navigation | **PASS** – every internal link on the main pages returns 200 |
| Final Release Version | **PASS** – `1.0.0` at `/health`, `v1.0.0` in the footer of every managed page |

## 8. Known Limitations

Carried forward from T15. These are outside the defined CSMS scope:

- No authentication, authorization or CSRF protection. Login and user roles are out of scope.
- A status change reads and then writes in two steps, so two people acting on the same Service Request at the same moment could race. This does not affect single-user local use.
- Unknown non-CSMS URLs (e.g. `/does-not-exist`) return the starter's JSON 404, which the starter test asserts.
- The starter home page (`/`) still shows "Current Sprint: Sprint 0 - Developer Onboarding", which the starter test asserts. It does show version `1.0.0`.
- Styling loads the Tailwind CSS browser build from a CDN. Without internet access, pages still work but lose their styles.
- The project targets Node 24 (`package.json`, `.nvmrc`). This release was verified on Node 22.22.1, where `node:sqlite` works but prints an `ExperimentalWarning` at startup.

No known release-blocking limitations remain within the defined CSMS v1.0.0 scope.
