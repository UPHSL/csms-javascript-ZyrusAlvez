import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { createResidentController } from "./controllers/residentController.js";
import { createServiceRequestController } from "./controllers/serviceRequestController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { ResidentRepository } from "./repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "./repositories/ServiceRequestRepository.js";
import mainRoutes from "./routes/index.js";
import { createResidentRoutes } from "./routes/residentRoutes.js";
import { createServiceRequestRoutes } from "./routes/serviceRequestRoutes.js";
import { ResidentDeactivationService } from "./services/ResidentDeactivationService.js";
import { ResidentQueryService } from "./services/ResidentQueryService.js";
import { ResidentRegistrationService } from "./services/ResidentRegistrationService.js";
import { ResidentUpdateService } from "./services/ResidentUpdateService.js";
import { ResidentValidator } from "./services/ResidentValidator.js";
import { ServiceRequestQueryService } from "./services/ServiceRequestQueryService.js";
import { ServiceRequestStatusService } from "./services/ServiceRequestStatusService.js";
import { ServiceRequestSubmissionService } from "./services/ServiceRequestSubmissionService.js";
import { ServiceRequestValidator } from "./services/ServiceRequestValidator.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/**
 * Create and configure the CSMS Express application.
 *
 * @param {object} [options]
 * @param {ResidentRepository} [options.residentRepository] Resident repository to use.
 * @param {ServiceRequestRepository} [options.serviceRequestRepository] Service Request repository to use.
 *   Both default to the application database; tests pass repositories on a temporary database.
 * @returns {import("express").Express} Configured Express application.
 */
export function createApp({
  residentRepository = new ResidentRepository(),
  serviceRequestRepository = new ServiceRequestRepository()
} = {}) {
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

  // the existing T09-T11 Service Request services
  const serviceRequestController = createServiceRequestController({
    queryService: new ServiceRequestQueryService(serviceRequestRepository),
    submissionService: new ServiceRequestSubmissionService(
      new ServiceRequestValidator(),
      serviceRequestRepository,
      residentRepository
    ),
    statusService: new ServiceRequestStatusService(serviceRequestRepository)
  });

  app.use(mainRoutes);
  app.use(createResidentRoutes(residentController));
  app.use(createServiceRequestRoutes(serviceRequestController));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
