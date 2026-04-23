const express = require("express");
const brandController = require("../controllers/brand.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", brandController.listBrands);
router.post(
  "/",
  authenticate,
  authorize(["manager", "admin"]),
  brandController.createBrand,
);
router.put(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  brandController.updateBrand,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  brandController.deleteBrand,
);

module.exports = router;
