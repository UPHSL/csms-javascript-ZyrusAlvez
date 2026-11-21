# Midterm Checkpoint

## Developer Information

- Name: `Zyrus Alvez`
- GitHub Username: `ZyrusAlvez`
- Primary Technology Stack: `JavaScript with Express.js`
- T10 Branch: `feature/t10-service-request-status`


## My T10 Implementation

The status workflow is managed by `ServiceRequestStatusService` in `src/services/ServiceRequestStatusService.js`, through its `changeStatus(id, requestedStatus)` method. It first retrieves the existing Service Request with `ServiceRequestRepository.findById()`, and if nothing is found it returns a not-found result without creating anything. The current status is read from that persisted Service Request, not from anything the caller supplies. The transition rules are kept in an `ALLOWED_TRANSITIONS` map where each status lists the statuses it may move to, and the four keys of that map are also the only supported statuses. The service first rejects a requested status that is not one of the four supported values, then checks whether the requested status is in the allowed list of the current status; if not, it returns an invalid-transition result. All of these checks happen before the database is touched, so an invalid request returns early and the `UPDATE` statement is never executed. Only for a valid transition does the service call `ServiceRequestRepository.updateStatus()`, which runs a parameterized `UPDATE service_requests SET status = ? WHERE id = ?` that changes only the status of that one Service Request. The repository then reads the row back with `findById()`, and the service returns that updated Service Request in a result object with `success`, `serviceRequest`, `notFound`, `unsupportedStatus`, and `invalidTransition`.


## My Transition Rules

| Current Status | Requested Status | Result |
|---|---|---|
| Pending | In Progress | Allowed |
| Pending | Cancelled | Allowed |
| In Progress | Completed | Allowed |
| In Progress | Cancelled | Allowed |
| Any other combination | | Rejected as invalid transition |

- Why Pending to Completed is rejected: a request has to actually be worked on before it can be finished, so `Completed` is only listed as an allowed target of `In Progress`, not of `Pending`.
- Why Completed is terminal: a completed request is a finished workflow, so `Completed` has an empty list of allowed targets in `ALLOWED_TRANSITIONS`.
- Why Cancelled is terminal: T10 does not support reopening cancelled requests, so `Cancelled` also has an empty list of allowed targets.
- How same-status requests are handled: no status lists itself as an allowed target, so a request like `Pending` to `Pending` is rejected as an invalid transition and the database is not changed.
- Unsupported values such as `Approved` are rejected with `unsupportedStatus` before the transition check.


## Files I Changed

File: `src/services/ServiceRequestStatusService.js`
Purpose: New service that retrieves the Service Request, checks the requested status and the transition rules, and only then asks the repository to update the status

File: `src/repositories/ServiceRequestRepository.js`
Purpose: Added `updateStatus(id, status)`, a parameterized `UPDATE ... WHERE id = ?` that changes only the status of the targeted Service Request and returns the updated record

File: `test/serviceRequestStatus.test.js`
Purpose: Contains the thirteen required T10 tests plus one student-designed test, all using a temporary SQLite database

File: `docs/midterm-checkpoint.md`
Purpose: This midterm checkpoint document


## Problem I Encountered

- Problem or error: The codebase had two different code layouts. The code from the starter up to T03 uses a compact style (for example `test/residentRepository.test.js`), while the code from T04 to T05 uses a vertical style where assignments and arguments are broken across many lines (for example `test/residentQuery.test.js`). When continuing to the next tickets, I was unsure which layout I should follow
- Example: both snippets save a Resident and check the result, but they are formatted differently

  T03 compact style (`test/residentRepository.test.js`):

  ```js
  const saved = repository.save(makeValidResident());
  const found = repository.findById(saved.id);

  assert.equal(found.id, saved.id);
  ```

  T05 vertical style (`test/residentQuery.test.js`):

  ```js
  const saved =
    saveResident(
      repository,
      makeResident(
        "Juan",
        "Dela Cruz",
        "09171234567",
        "juan@example.com"
      )
    );

  const results =
    service.searchResidents(
      "Juan"
    );

  assert.equal(
    results.length,
    1
  );
  ```
- Cause: For T04 and T05, I copied the code layout directly from the `T04 GUIDE: JAVASCRIPT WITH EXPRESS.JS` and `T05 GUIDE: JAVASCRIPT WITH EXPRESS.JS`, which use a different formatting style from the code I wrote myself in the earlier tickets
- How I investigated it: I compared the test files from T03 and T05 side by side and saw that both styles do the same thing, and the only difference is how the lines are formatted. I also realized that reformatting the old files inside a feature ticket would mix unrelated changes into the Pull Request
- How I resolved it: I decided to continue the format that already exists in the codebase instead of switching styles. I treated the existing code as the company coding standard, the same way a developer joining a real team follows the conventions already in the project. I realized that the code layout should be based on what is familiar and readable to the rest of the team, not on my own preference


## My Student-Designed Test

- Test Name: `existing Service Request can still be processed after its Resident is deactivated`
- What the Test Verifies: A Service Request submitted while its Resident was Active can still move from `Pending` to `In Progress` to `Completed` after the Resident is deactivated, and processing the request leaves the Resident `Inactive`
- Why I Added This Test: T09 blocks Inactive Residents from submitting new requests, so it would be easy to wrongly apply the same check in T10. The ticket says T10 manages existing transactions and must not be blocked by the Resident's later status, and none of the thirteen required tests cover that rule


## Tools and References Used

- VS Code
- Copilot Inline Suggestions for boilerplate codes
- ChatGPT for general use
