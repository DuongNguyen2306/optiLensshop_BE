const express = require("express");
const inventoryController = require("../controllers/inventory.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/receipts",
  authenticate,
  authorize(["manager", "admin"]),
  inventoryController.listReceipts,
);
router.post(
  "/receipts",
  authenticate,
  authorize(["manager", "admin"]),
  inventoryController.createReceipt,
);
router.patch(
  "/receipts/:id/confirm",
  authenticate,
  authorize(["manager", "admin"]),
  inventoryController.confirmReceipt,
);

router.get(
  "/ledger",
  authenticate,
  authorize(["manager", "admin"]),
  inventoryController.listLedger,
);

module.exports = router;
