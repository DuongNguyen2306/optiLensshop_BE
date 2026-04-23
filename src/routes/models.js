const express = require("express");
const modelController = require("../controllers/model.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", modelController.listModels);
router.post(
  "/",
  authenticate,
  authorize(["manager", "admin"]),
  modelController.createModel,
);
router.put(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  modelController.updateModel,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  modelController.deleteModel,
);

module.exports = router;
