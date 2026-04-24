const financeService = require("../services/finance.service");

exports.getSummary = async (req, res) => {
  try {
    const data = await financeService.getSummary(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getRevenueBreakdown = async (req, res) => {
  try {
    const data = await financeService.getRevenueBreakdown(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getCashflow = async (req, res) => {
  try {
    const data = await financeService.getCashflow(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getRevenueOrders = async (req, res) => {
  try {
    const data = await financeService.getRevenueOrders(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getRefundsList = async (req, res) => {
  try {
    const data = await financeService.getRefundsList(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getExpenseSummaryByCategory = async (req, res) => {
  try {
    const data = await financeService.getExpenseSummaryByCategory(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const doc = await financeService.createExpense(req.user._id ?? req.user.id, req.body);
    res.status(201).json({ message: "Đã tạo phiếu chi", expense: doc });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listExpenses = async (req, res) => {
  try {
    const data = await financeService.listExpenses(req.query || {});
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getExpenseById = async (req, res) => {
  try {
    const expense = await financeService.getExpenseById(req.params.id);
    res.json({ expense });
  } catch (err) {
    res.status(err.message.includes("Không tìm thấy") ? 404 : 400).json({
      message: err.message,
    });
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const expense = await financeService.updateExpense(
      req.params.id,
      req.user._id ?? req.user.id,
      req.body,
    );
    res.json({ message: "Đã cập nhật phiếu chi", expense });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.voidExpense = async (req, res) => {
  try {
    const { void_reason } = req.body || {};
    const expense = await financeService.voidExpense(
      req.params.id,
      req.user._id ?? req.user.id,
      void_reason,
    );
    res.json({ message: "Đã hủy phiếu chi", expense });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
