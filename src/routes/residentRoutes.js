import { Router } from "express";

// GET routes only read; every state change uses POST (HTML forms support GET/POST only)
export function createResidentRoutes(controller) {
  const router = Router();

  router.get("/residents", controller.list);
  router.get("/residents/new", controller.showRegistrationForm);
  router.post("/residents", controller.register);
  router.get("/residents/:id/edit", controller.showEditForm);
  router.post("/residents/:id", controller.update);
  router.post("/residents/:id/deactivate", controller.deactivate);

  return router;
}
