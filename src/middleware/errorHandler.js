/**
 * Last-resort error handler: logs the error on the server and shows a generic page,
 * so users never see a stack trace or database message.
 *
 * @param {Error} error Unhandled error.
 * @param {import("express").Request} request Express request.
 * @param {import("express").Response} response Express response.
 * @param {import("express").NextFunction} next Express next callback.
 */
export function errorHandler(error, request, response, next) {
  console.error(error);

  if (response.headersSent) {
    return next(error);
  }

  response.status(500).render("errors/server-error", {
    title: "Something Went Wrong"
  });
}
