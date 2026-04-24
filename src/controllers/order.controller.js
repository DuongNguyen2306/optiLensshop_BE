const orderService = require("../services/order.service");
const opsOrderService = require("../services/ops-order.service");

exports.getOrderListCustomer = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.order_type) filter.order_type = req.query.order_type;
    if (req.query.payment_method) filter.payment_method = req.query.payment_method;
    if (req.query.payment_status) filter.payment_status = req.query.payment_status;
    if (req.query.page) filter.page = req.query.page;
    if (req.query.pageSize) filter.pageSize = req.query.pageSize;
    const result = await orderService.getOrderListCustomer(req.user.id, filter);
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getOrderListShop = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.order_type) filter.order_type = req.query.order_type;
    if (req.query.payment_method) filter.payment_method = req.query.payment_method;
    if (req.query.payment_status) filter.payment_status = req.query.payment_status;
    if (req.query.page) filter.page = req.query.page;
    if (req.query.pageSize) filter.pageSize = req.query.pageSize;
    const result = await orderService.getOrderListShop(filter);
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getOrderDetail = async (req, res) => {
  try {
    const order = await orderService.getOrderDetail(
      req.params.id,
      req.user._id ?? req.user.id,
      req.user.role,
    );
    res.json({ order });
  } catch (err) {
    const statusCode =
      err.message === "Bạn không có quyền xem đơn hàng này" ? 403 : 404;
    res.status(statusCode).json({ message: err.message });
  }
};

exports.updateShippingInfo = async (req, res) => {
  try {
    const { shipping_carrier, tracking_code } = req.body;
    const order = await orderService.updateShippingInfo(
      req.params.id,
      { shipping_carrier, tracking_code },
      req.user._id ?? req.user.id,
    );
    res.json({ message: "Đã lưu thông tin vận chuyển", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.checkout = async (req, res) => {
  try {
    const {
      shipping_address,
      phone,
      order_type,
      payment_method,
      shipping_method,
      items,
      deposit_rate,
      prescription_image,
      optometrist_name,
      clinic_name,
    } = req.body;
    const { order, payUrl } = await orderService.checkoutWithPayment(
      req.user.id,
      {
        shipping_address,
        phone,
        order_type,
        payment_method,
        shipping_method,
        items,
        deposit_rate,
        prescription_image,
        optometrist_name,
        clinic_name,
      },
    );
    res.status(201).json({ message: "Đặt hàng thành công", order, payUrl });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.preorderNow = async (req, res) => {
  try {
    const {
      shipping_address,
      phone,
      payment_method,
      shipping_method,
      items,
      deposit_rate,
    } = req.body;
    const { order, payUrl } =
      await orderService.createPreorderDirectWithPayment(req.user.id, {
        shipping_address,
        phone,
        payment_method,
        shipping_method,
        items,
        deposit_rate,
      });
    res
      .status(201)
      .json({ message: "Tạo đơn preorder thành công", order, payUrl });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.confirmOrder = async (req, res) => {
  try {
    const order = await orderService.confirmOrder(req.params.id, req.user.id);
    res.json({ message: "Đã xác nhận đơn hàng", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;
    const order = await orderService.updateOrderStatus(
      id,
      status,
      userRole,
      req.user.id,
    );
    res.json({ message: "Cập nhật trạng thái thành công", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const order = await orderService.cancelOrder(id, req.user.id, reason);
    res.json({ message: "Đã hủy đơn hàng", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.confirmReceived = async (req, res) => {
  try {
    const order = await orderService.confirmReceivedByCustomer(
      req.params.id,
      req.user.id,
    );
    res.json({ message: "Đã xác nhận đã nhận hàng", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.reportNotReceived = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const order = await orderService.reportNotReceivedByCustomer(
      req.params.id,
      req.user.id,
      reason,
    );
    res.json({ message: "Đã ghi nhận báo cáo chưa nhận được hàng", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getOpsOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.page) filter.page = req.query.page;
    if (req.query.pageSize) filter.pageSize = req.query.pageSize;
    const result = await opsOrderService.getOpsOrders(filter);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.startProcessing = async (req, res) => {
  try {
    const order = await opsOrderService.startProcessing(req.params.id, req.user.id);
    res.status(200).json({ message: "Ops bắt đầu gia công", order });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

exports.fulfillOrder = async (req, res) => {
  try {
    const order = await opsOrderService.fulfillOrder(req.params.id, req.user.id);
    res.status(200).json({ message: "Ops hoàn tất gia công", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.startShipping = async (req, res) => {
  try {
    const order = await opsOrderService.startShipping(req.params.id, req.user.id);
    res.status(200).json({ message: "Bàn giao đơn cho shipper", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const order = await opsOrderService.markDelivered(req.params.id, req.user.id);
    res.status(200).json({ message: "Đã giao thành công", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.resolveNotReceived = async (req, res) => {
  try {
    const { action, note } = req.body || {};
    const order = await opsOrderService.resolveNotReceived(
      req.params.id,
      req.user.id,
      action,
      note,
    );
    res.status(200).json({ message: "Đã xử lý báo cáo chưa nhận được hàng", order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
