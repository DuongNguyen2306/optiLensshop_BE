const express = require("express");
const userController = require("../controllers/user.controller");
const systemSettingController = require("../controllers/systemSetting.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

// Staff management (manager + admin)
router.get(
  "/staff",
  authenticate,
  authorize(["manager", "admin"]),
  userController.listStaff,
);
router.post(
  "/staff",
  authenticate,
  authorize(["manager", "admin"]),
  userController.createStaff,
);
router.put(
  "/staff/:id",
  authenticate,
  authorize(["manager", "admin"]),
  userController.updateStaff,
);
router.delete(
  "/staff/:id",
  authenticate,
  authorize(["manager", "admin"]),
  userController.deleteStaff,
);

// Manager management (admin only)
router.get(
  "/managers",
  authenticate,
  authorize(["admin"]),
  userController.listManagers,
);
router.post(
  "/managers",
  authenticate,
  authorize(["admin"]),
  userController.createManager,
);
router.put(
  "/managers/:id",
  authenticate,
  authorize(["admin"]),
  userController.updateManager,
);
router.delete(
  "/managers/:id",
  authenticate,
  authorize(["admin"]),
  userController.deleteManager,
);

router.get(
  "/settings/preorder-deposit-rate",
  authenticate,
  authorize(["manager", "admin"]),
  systemSettingController.getPreorderDepositRate,
);
router.put(
  "/settings/preorder-deposit-rate",
  authenticate,
  authorize(["manager", "admin"]),
  systemSettingController.updatePreorderDepositRate,
);

module.exports = router;
