const returnService = require("../services/return.service");

// ─── Customer endpoints ────────────────────────────────────────────────────────

exports.requestReturn = async (req, res) => {
  try {
    const { order_id, return_reason, reason_category, items } = req.body;
    const returnRequest = await returnService.requestReturn(req.user._id, {
      order_id,
      return_reason,
      reason_category,
      items,
    });
    res.status(201).json({
      message: "Yêu cầu trả hàng đã được gửi thành công",
      returnRequest,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listMyReturns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.page) filter.page = req.query.page;
    if (req.query.pageSize) filter.pageSize = req.query.pageSize;

    const result = await returnService.listMyReturns(req.user._id, filter);
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── Admin / Ops endpoints ─────────────────────────────────────────────────────

exports.listReturns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.order_id) filter.order_id = req.query.order_id;
    if (req.query.condition) filter.condition = req.query.condition;
    if (req.query.page) filter.page = req.query.page;
    if (req.query.pageSize) filter.pageSize = req.query.pageSize;

    const result = await returnService.listReturns(filter);
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getReturnDetail = async (req, res) => {
  try {
    const returnRequest = await returnService.getReturnDetail(req.params.id);
    res.json({ returnRequest });
  } catch (err) {
    const code = err.message.includes("Không tìm thấy") ? 404 : 400;
    res.status(code).json({ message: err.message });
  }
};

exports.approveReturn = async (req, res) => {
  try {
    const { note } = req.body || {};
    const returnRequest = await returnService.approveReturn(
      req.params.id,
      { note },
      req.user._id,
    );
    res.json({
      message: "Đã chấp nhận yêu cầu trả hàng — khách có thể gửi hàng về",
      returnRequest,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.receiveReturn = async (req, res) => {
  try {
    const { condition_at_receipt, note } = req.body;
    const returnRequest = await returnService.receiveReturn(
      req.params.id,
      { condition_at_receipt, note },
      req.user._id,
    );
    res.json({
      message: "Đã nhận hàng & ghi nhận kết quả kiểm tra",
      returnRequest,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.completeReturn = async (req, res) => {
  try {
    const { returnRequest, restockLog, finalOrderStatus } =
      await returnService.completeReturn(req.params.id, req.user._id);
    res.json({
      message: "Đã hoàn tiền và hoàn tất xử lý trả hàng",
      returnRequest,
      restockLog,
      finalOrderStatus,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.rejectReturn = async (req, res) => {
  try {
    const { rejected_reason } = req.body;
    const returnRequest = await returnService.rejectReturn(
      req.params.id,
      { rejected_reason },
      req.user._id,
    );
    res.json({
      message: "Đã từ chối yêu cầu trả hàng",
      returnRequest,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
