const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const { authenticate } = require("../middlewares/auth.middleware");

router.get("/", authenticate, cartController.getCart);
router.post("/items", authenticate, cartController.addItem);
router.put("/items/:cartLineId", authenticate, cartController.updateItem);
router.delete("/items/:cartLineId", authenticate, cartController.removeItem);
router.put(
  "/combo-items/:combo_id",
  authenticate,
  cartController.updateComboItem,
);
router.delete(
  "/combo-items/:combo_id",
  authenticate,
  cartController.removeComboItem,
);
router.delete("/clear", authenticate, cartController.clearCart);

module.exports = router;
