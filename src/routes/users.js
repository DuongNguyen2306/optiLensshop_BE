const express = require("express");
const userController = require("../controllers/user.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const multer = require("multer");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Profile (authenticated user)
router.get("/me/profile", authenticate, userController.getMyProfile);
router.put(
  "/me/profile",
  authenticate,
  upload.single("avatar"),
  userController.updateMyProfile,
);
router.get("/me/addresses", authenticate, userController.getMyAddresses);
router.post("/me/addresses", authenticate, userController.addMyAddress);

module.exports = router;
