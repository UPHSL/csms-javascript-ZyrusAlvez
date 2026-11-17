import { Router } from "express";

// the dashboard is only ever read: GET, no mutation routes
export function createDashboardRoutes(controller) {
  const router = Router();

  router.get("/dashboard", controller.show);

  return router;
}
