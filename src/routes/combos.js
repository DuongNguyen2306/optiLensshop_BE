const express = require("express");
const comboController = require("../controllers/combo.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", comboController.listCombos);
router.get("/:slug", comboController.getComboBySlug);

router.post(
  "/",
  authenticate,
  authorize(["manager", "admin"]),
  comboController.createCombo,
);
router.put(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  comboController.updateCombo,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  comboController.deleteCombo,
);

module.exports = router;
