const express = require("express");
const productController = require("../controllers/product.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();
// Multer cấu hình memoryStorage để upload file lên Cloudinary
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
});

router.get("/", productController.listProducts);
router.get("/:slug", productController.getProductDetailBySlug);
router.get("/:id/variants", productController.getProductVariants);

// Thêm sản phẩm mới (chỉ manager/admin, hỗ trợ form-data có file ảnh)
router.post(
  "/",
  authenticate,
  authorize(["manager", "admin"]),
  upload.array("images"),
  productController.createProduct,
);

// Thêm biến thể cho product (manager/admin)
router.post(
  "/:id/variants",
  authenticate,
  authorize(["manager", "admin"]),
  productController.addVariant,
);

// Cập nhật sản phẩm (manager/admin, hỗ trợ form-data có file ảnh)

router.put(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  upload.array("images"),
  productController.updateProduct,
);

// Xóa sản phẩm (manager/admin)
router.delete(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  productController.deleteProduct,
);

// Xóa biến thể sản phẩm (manager/admin)
router.delete(
  "/:productId/variants/:variantId",
  authenticate,
  authorize(["manager", "admin"]),
  productController.deleteVariant,
);

// Cập nhật biến thể sản phẩm (manager/admin)
router.put(
  "/:productId/variants/:variantId",
  authenticate,
  authorize(["manager", "admin"]),
  productController.updateVariant,
);

// Ẩn/hiện sản phẩm (manager/admin)
router.patch(
  "/:id/active",
  authenticate,
  authorize(["manager", "admin"]),
  productController.toggleActiveProduct,
);

module.exports = router;
