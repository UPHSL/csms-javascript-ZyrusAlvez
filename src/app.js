import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { createResidentController } from "./controllers/residentController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { ResidentRepository } from "./repositories/ResidentRepository.js";
import mainRoutes from "./routes/index.js";
import { createResidentRoutes } from "./routes/residentRoutes.js";
import { ResidentDeactivationService } from "./services/ResidentDeactivationService.js";
import { ResidentQueryService } from "./services/ResidentQueryService.js";
import { ResidentRegistrationService } from "./services/ResidentRegistrationService.js";
import { ResidentUpdateService } from "./services/ResidentUpdateService.js";
import { ResidentValidator } from "./services/ResidentValidator.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/**
 * Create and configure the CSMS Express application.
 *
 * @param {object} [options]
 * @param {ResidentRepository} [options.residentRepository] Repository to use;
 *   defaults to one on the application database. Tests pass one on a temporary database.
 * @returns {import("express").Express} Configured Express application.
 */
export function createApp({ residentRepository = new ResidentRepository() } = {}) {
  const app = express();

  app.disable("x-powered-by");

  app.set("views", path.join(currentDirectory, "views"));
  app.set("view engine", "ejs");

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(currentDirectory, "..", "public")));

  // composition root: the existing T02/T04-T07 services, wired to one repository
  const residentValidator = new ResidentValidator();
  const residentController = createResidentController({
    queryService: new ResidentQueryService(residentRepository),
    registrationService: new ResidentRegistrationService(residentValidator, residentRepository),
    updateService: new ResidentUpdateService(residentValidator, residentRepository),
    deactivationService: new ResidentDeactivationService(residentRepository)
  });

  app.use(mainRoutes);
  app.use(createResidentRoutes(residentController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
