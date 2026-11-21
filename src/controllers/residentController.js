import { Resident } from "../models/Resident.js";
import { parseId, renderNotFound as renderNotFoundPage } from "./controllerHelpers.js";

// the only fields a user may submit; id and status are never read from a form
const EDITABLE_FIELDS = ["firstName", "lastName", "address", "contactNumber", "email"];

// presentation wording for the field names returned by ResidentValidator (T02).
// The rules themselves stay in ResidentValidator; this only turns its result into text.
const VALIDATION_MESSAGES = {
  firstName: "First name is required.",
  lastName: "Last name is required.",
  address: "Address is required.",
  contactNumber: "Contact number must follow the format 09XXXXXXXXX (11 digits).",
  email: "Email must be a valid email address, such as name@example.com.",
  status: "Resident status is invalid."
};

// success messages shown after a Post/Redirect/Get round trip.
// Only these fixed codes are recognized, so no user-supplied text is echoed back.
const NOTICES = {
  registered: "Resident registered successfully.",
  updated: "Resident information updated successfully.",
  deactivated: "Resident deactivated successfully.",
  "already-inactive": "Resident is already inactive."
};

const EMPTY_FORM = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, ""]));

// copies only the editable fields the form actually sent, as strings
function readEditableFields(body = {}) {
  const fields = {};

  for (const field of EDITABLE_FIELDS) {
    if (typeof body[field] === "string") {
      fields[field] = body[field];
    }
  }

  return fields;
}

function toErrorMessages(errors) {
  return errors.map((field) => VALIDATION_MESSAGES[field] ?? `${field} is invalid.`);
}

function renderNotFound(response) {
  renderNotFoundPage(response, {
    title: "Resident Not Found",
    message: "The requested Resident does not exist.",
    backHref: "/residents",
    backLabel: "Back to Resident Management",
    section: "residents"
  });
}

// Resident presentation layer (T12).
// Receives HTTP requests, calls the existing T04-T07 application services,
// and renders or redirects. It holds no SQL and no Resident business rules.
export function createResidentController({
  queryService,
  registrationService,
  updateService,
  deactivationService
}) {
  return {
    // GET /residents?search=...  (read-only)
    list(request, response) {
      const search = typeof request.query.search === "string" ? request.query.search : "";

      // T05 handles trimming, blank-means-list, partial and case-insensitive matching
      const residents = queryService.searchResidents(search);

      response.render("residents/index", {
        title: "Resident Management",
        residents,
        search,
        notice: NOTICES[request.query.notice] ?? null
      });
    },

    // GET /residents/new  (read-only)
    showRegistrationForm(request, response) {
      response.render("residents/new", {
        title: "Register Resident",
        values: EMPTY_FORM,
        errors: []
      });
    },

    // POST /residents
    register(request, response) {
      // status is not taken from the form; the Resident model defaults it to Active
      const resident = new Resident(readEditableFields(request.body));

      // T04 validates (T02) and persists
      const result = registrationService.registerResident(resident);

      if (!result.success) {
        return response.status(422).render("residents/new", {
          title: "Register Resident",
          values: { ...EMPTY_FORM, ...readEditableFields(request.body) },
          errors: toErrorMessages(result.errors)
        });
      }

      response.redirect(303, "/residents?notice=registered");
    },

    // GET /residents/:id/edit  (read-only)
    showEditForm(request, response) {
      const id = parseId(request.params.id);
      const resident = id === null ? null : queryService.findResident(id);

      if (!resident) {
        return renderNotFound(response);
      }

      response.render("residents/edit", {
        title: "Edit Resident",
        resident,
        values: resident,
        errors: []
      });
    },

    // POST /residents/:id
    update(request, response) {
      const id = parseId(request.params.id);

      if (id === null) {
        return renderNotFound(response);
      }

      const proposed = readEditableFields(request.body);

      // T06 validates (T02), preserves id and status, and persists
      const result = updateService.updateResident(id, proposed);

      if (result.notFound) {
        return renderNotFound(response);
      }

      if (!result.success) {
        // nothing was written; show the stored id/status beside the user's entered values
        const resident = queryService.findResident(id);

        return response.status(422).render("residents/edit", {
          title: "Edit Resident",
          resident,
          values: { ...resident, ...proposed },
          errors: toErrorMessages(result.errors)
        });
      }

      response.redirect(303, "/residents?notice=updated");
    },

    // POST /residents/:id/deactivate
    deactivate(request, response) {
      const id = parseId(request.params.id);

      if (id === null) {
        return renderNotFound(response);
      }

      // T07 performs soft, idempotent deactivation
      const result = deactivationService.deactivateResident(id);

      if (result.notFound) {
        return renderNotFound(response);
      }

      const notice = result.alreadyInactive ? "already-inactive" : "deactivated";
      response.redirect(303, `/residents?notice=${notice}`);
    }
  };
}
