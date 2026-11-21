// controlled wording for malformed requests rejected by Express before any controller runs
// (unparseable JSON body, undecodable URL path segment, oversized body)
const CLIENT_ERROR_PAGES = {
  413: {
    title: "Request Too Large",
    message: "The submitted information is too large to process. Nothing was saved."
  }
};

const DEFAULT_CLIENT_ERROR_PAGE = {
  title: "Invalid Request",
  message: "The request could not be understood. Nothing was saved."
};

/**
 * Last-resort error handler: users never see a stack trace or database message.
 *
 * Client errors (HTTP 4xx raised by Express/body-parser, e.g. malformed JSON or a
 * malformed URL) keep their status code and get a controlled page; they are expected
 * invalid input, so no stack trace is logged. Anything else is an unexpected server
 * error: it is logged on the server and a generic HTTP 500 page is shown.
 *
 * @param {Error} error Unhandled error.
 * @param {import("express").Request} request Express request.
 * @param {import("express").Response} response Express response.
 * @param {import("express").NextFunction} next Express next callback.
 */
export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const status = Number(error?.status ?? error?.statusCode);

  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const page = CLIENT_ERROR_PAGES[status] ?? DEFAULT_CLIENT_ERROR_PAGE;

    return response.status(status).render("errors/client-error", page);
  }

  console.error(error);

  response.status(500).render("errors/server-error", {
    title: "Something Went Wrong"
  });
}
