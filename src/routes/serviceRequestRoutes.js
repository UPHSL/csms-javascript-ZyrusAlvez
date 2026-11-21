import { Router } from "express";

// GET routes only read; submission and every workflow action use POST.
// There is no generic "set status" route: only the named T10 workflow actions exist.
export function createServiceRequestRoutes(controller) {
  const router = Router();

  router.get("/service-requests", controller.list);
  router.get("/service-requests/new", controller.showSubmissionForm);
  router.post("/service-requests", controller.submit);
  router.get("/service-requests/:id", controller.show);
  router.post("/service-requests/:id/start-processing", controller.startProcessing);
  router.post("/service-requests/:id/complete", controller.complete);
  router.post("/service-requests/:id/cancel", controller.cancel);

  return router;
}
