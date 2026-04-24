var express = require("express");
var router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

router.use("/users", require("./users"));
router.use("/management", require("./management"));
router.use("/auth", require("./auth"));
router.use("/products", require("./products"));
router.use("/variants", require("./variants"));
router.use("/combos", require("./combos"));
router.use("/categories", require("./categories"));
router.use("/brands", require("./brands"));
router.use("/models", require("./models"));
router.use("/cart", require("./cart"));
router.use("/orders", require("./order"));
router.use("/momo", require("./momo"));
router.use("/vnpay", require("./vnpay"));
router.use("/payment", require("./payment"));
router.use("/statistics", require("./statistics"));
router.use("/finance", require("./finance"));
router.use("/inventory", require("./inventory"));
router.use("/api/ops/orders", require("./ops-order"));
router.use("/returns", require("./returns"));
router.use("/api/admin/returns", require("./admin-returns"));

module.exports = router;
