// Dashboard presentation layer (T14): read-only.
// Asks DashboardService for the summary and renders it; no SQL and no counting here.
export function createDashboardController({ dashboardService }) {
  return {
    // GET /dashboard
    show(request, response) {
      const summary = dashboardService.getSummary();

      response.render("dashboard/index", {
        title: "CSMS Dashboard",
        section: "dashboard",
        ...summary
      });
    }
  };
}
