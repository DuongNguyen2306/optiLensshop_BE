const express = require("express");
const categoryController = require("../controllers/category.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

// Lấy danh sách category
router.get("/", categoryController.listCategories);
// Tạo category (manager/admin)
router.post(
  "/",
  authenticate,
  authorize(["manager", "admin"]),
  categoryController.createCategory,
);
// Cập nhật category
router.put(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  categoryController.updateCategory,
);
// Xóa category
router.delete(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  categoryController.deleteCategory,
);

module.exports = router;
