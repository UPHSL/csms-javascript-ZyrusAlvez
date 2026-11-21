// shared presentation helpers for the Resident and Service Request controllers

// route ids must be positive whole numbers; anything else is treated as not found
export function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

// controlled 404 page (no stack trace, nothing created)
export function renderNotFound(response, { title, message, backHref, backLabel, section }) {
  response.status(404).render("errors/not-found", {
    title,
    message,
    backHref,
    backLabel,
    section
  });
}
