import { ServiceRequest } from "../models/ServiceRequest.js";
import { UnsupportedStatusFilterError } from "../services/ServiceRequestQueryService.js";
import { SUPPORTED_STATUSES } from "../services/ServiceRequestStatusService.js";
import { parseId, renderNotFound as renderNotFoundPage } from "./controllerHelpers.js";

// the only fields a user may submit; id and status are never read from a form
const SUBMISSION_FIELDS = ["residentId", "serviceType", "description", "dateRequested"];

// named workflow actions exposed by the interface. Each maps to a T10 target status;
// T10 alone decides whether the move is allowed from the current persisted status.
const WORKFLOW_ACTIONS = [
  { action: "start-processing", label: "Start Processing", targetStatus: "In Progress", notice: "started" },
  { action: "complete", label: "Complete", targetStatus: "Completed", notice: "completed" },
  { action: "cancel", label: "Cancel", targetStatus: "Cancelled", notice: "cancelled" }
];

// presentation wording for the field names returned by ServiceRequestValidator (T09)
const VALIDATION_MESSAGES = {
  residentId: "Resident ID must be a positive whole number.",
  serviceType: "Service type is required.",
  description: "Description is required.",
  dateRequested: "Date requested must be a valid date (YYYY-MM-DD).",
  id: "A new Service Request must not include an ID.",
  status: "A new Service Request must start as Pending."
};

// success messages shown after a Post/Redirect/Get round trip (fixed codes only)
const NOTICES = {
  submitted: "Service Request submitted successfully.",
  started: "Service Request is now In Progress.",
  completed: "Service Request completed successfully.",
  cancelled: "Service Request cancelled successfully."
};

const STATUS_OPTIONS = [...SUPPORTED_STATUSES];

const EMPTY_FORM = Object.fromEntries(SUBMISSION_FIELDS.map((field) => [field, ""]));

// copies only the submission fields the form actually sent, as strings
function readSubmissionFields(body = {}) {
  const fields = { ...EMPTY_FORM };

  for (const field of SUBMISSION_FIELDS) {
    if (typeof body[field] === "string") {
      fields[field] = body[field];
    }
  }

  return fields;
}

// HTTP form values are strings; convert a whole-number Resident ID to a number.
// Anything else is passed through unchanged so T09 validation rejects it.
function toResidentId(value) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}

function renderNotFound(response) {
  renderNotFoundPage(response, {
    title: "Service Request Not Found",
    message: "The requested Service Request does not exist.",
    backHref: "/service-requests",
    backLabel: "Back to Service Request Management",
    section: "service-requests"
  });
}

// Service Request presentation layer (T13).
// Calls the existing T09 submission, T10 status and T11 query services;
// it holds no SQL, no validation/eligibility rules and no transition rules.
export function createServiceRequestController({ queryService, submissionService, statusService }) {
  // the workflow actions T10 allows from the given status (used only to show buttons)
  function availableActions(status) {
    return WORKFLOW_ACTIONS.filter(({ targetStatus }) =>
      statusService.isAllowedTransition(status, targetStatus)
    );
  }

  function renderDetails(response, serviceRequest, { statusCode = 200, notice = null, error = null } = {}) {
    response.status(statusCode).render("service-requests/show", {
      title: `Service Request #${serviceRequest.id}`,
      serviceRequest,
      actions: availableActions(serviceRequest.status),
      notice,
      error
    });
  }

  // one POST handler per named workflow action
  function createWorkflowHandler({ targetStatus, notice }) {
    return (request, response) => {
      const id = parseId(request.params.id);

      if (id === null) {
        return renderNotFound(response);
      }

      // T10 checks existence, supported status and the allowed transition before writing
      const result = statusService.changeStatus(id, targetStatus);

      if (result.notFound) {
        return renderNotFound(response);
      }

      if (!result.success) {
        // rejected by T10: nothing was written; show the request as it is stored
        const current = queryService.viewServiceRequest(id);

        return renderDetails(response, current, {
          statusCode: 409,
          error: `This action is not allowed for a ${current.status} Service Request.`
        });
      }

      response.redirect(303, `/service-requests/${id}?notice=${notice}`);
    };
  }

  const workflowHandlers = Object.fromEntries(
    WORKFLOW_ACTIONS.map((definition) => [definition.action, createWorkflowHandler(definition)])
  );

  return {
    // GET /service-requests?search=...&status=...  (read-only)
    list(request, response) {
      const search = typeof request.query.search === "string" ? request.query.search : "";
      const status = typeof request.query.status === "string" ? request.query.status : "";

      let serviceRequests = [];
      let error = null;
      let statusCode = 200;

      try {
        // T11 owns trimming, blank handling, partial/case-insensitive matching,
        // status validation, AND-combination and ordering
        serviceRequests = queryService.searchServiceRequests(search, status);
      } catch (caught) {
        if (!(caught instanceof UnsupportedStatusFilterError)) {
          throw caught;
        }

        statusCode = 400;
        error = "Unsupported status filter. Choose one of the listed statuses.";
      }

      response.status(statusCode).render("service-requests/index", {
        title: "Service Request Management",
        serviceRequests: serviceRequests.map((serviceRequest) => ({
          serviceRequest,
          actions: availableActions(serviceRequest.status)
        })),
        search,
        status,
        statusOptions: STATUS_OPTIONS,
        notice: NOTICES[request.query.notice] ?? null,
        error
      });
    },

    // GET /service-requests/new  (read-only)
    showSubmissionForm(request, response) {
      response.render("service-requests/new", {
        title: "Submit Service Request",
        values: EMPTY_FORM,
        errors: []
      });
    },

    // POST /service-requests
    submit(request, response) {
      const values = readSubmissionFields(request.body);

      // status is not taken from the form; the ServiceRequest model defaults it to Pending
      const serviceRequest = new ServiceRequest({
        residentId: toResidentId(values.residentId),
        serviceType: values.serviceType,
        description: values.description,
        dateRequested: values.dateRequested
      });

      // T09 validates, checks the Resident exists and is Active, then persists
      const result = submissionService.submitServiceRequest(serviceRequest);

      if (!result.success) {
        const errors = result.residentNotFound
          ? ["Resident not found. Check the Resident ID."]
          : result.residentInactive
            ? ["Inactive Residents cannot submit new Service Requests."]
            : result.errors.map((field) => VALIDATION_MESSAGES[field] ?? `${field} is invalid.`);

        return response.status(422).render("service-requests/new", {
          title: "Submit Service Request",
          values,
          errors
        });
      }

      response.redirect(303, "/service-requests?notice=submitted");
    },

    // GET /service-requests/:id  (read-only)
    show(request, response) {
      const id = parseId(request.params.id);
      const serviceRequest = id === null ? null : queryService.viewServiceRequest(id);

      if (!serviceRequest) {
        return renderNotFound(response);
      }

      renderDetails(response, serviceRequest, { notice: NOTICES[request.query.notice] ?? null });
    },

    startProcessing: workflowHandlers["start-processing"],
    complete: workflowHandlers.complete,
    cancel: workflowHandlers.cancel
  };
}
