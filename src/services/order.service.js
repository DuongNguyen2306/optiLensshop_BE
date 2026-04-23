const mongoose = require("mongoose");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const Cart = require("../models/cart.schema");
const Payment = require("../models/payment.schema");
const Combo = require("../models/combo.schema");
const ProductVariant = require("../models/productVariant.schema");
const PrescriptionOrder = require("../models/prescriptionOrder.schema");
const momoService = require("./momo.service");
const vnpayService = require("./vnpay.service");
const { addressToString } = require("../utils/address");
const { sanitizeLensParams } = require("../utils/lens-params");

function normalizePhone(phone) {
  return String(phone || "").trim();
}

exports.getOrderListCustomer = async (userId, filter = {}) => {
  const match = { user_id: userId };
  if (filter.status) match.status = filter.status;
  const page = filter.page ? parseInt(filter.page) : 1;
  const pageSize = filter.pageSize ? parseInt(filter.pageSize) : 10;
  const skip = (page - 1) * pageSize;
  const total = await Order.countDocuments(match);
  const orders = await Order.find(match)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(pageSize);
  const orderIds = orders.map((o) => o._id);
  let paymentQuery = { order_id: { $in: orderIds } };
  if (filter.payment_method) paymentQuery.method = filter.payment_method;
  if (filter.payment_status) paymentQuery.status = filter.payment_status;
  const payments = await Payment.find(paymentQuery);
  const paymentMap = {};
  payments.forEach((p) => {
    if (p.status !== "pending-payment") {
      paymentMap[p.order_id] = p;
    }
  });
  const filteredOrders = orders.filter(
    (o) =>
      !paymentMap[o._id] ||
      (paymentMap[o._id] && paymentMap[o._id].status !== "pending-payment"),
  );
  return {
    data: filteredOrders.map((o) => ({
      ...o.toObject(),
      payment: paymentMap[o._id] || null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

exports.getOrderListShop = async (filter = {}) => {
  const match = {};
  if (filter.status) match.status = filter.status;
  const page = filter.page ? parseInt(filter.page) : 1;
  const pageSize = filter.pageSize ? parseInt(filter.pageSize) : 10;
  const skip = (page - 1) * pageSize;
  const total = await Order.countDocuments(match);
  const orders = await Order.find(match)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(pageSize);
  const orderIds = orders.map((o) => o._id);
  let paymentQuery = { order_id: { $in: orderIds } };
  if (filter.payment_method) paymentQuery.method = filter.payment_method;
  if (filter.payment_status) paymentQuery.status = filter.payment_status;
  const payments = await Payment.find(paymentQuery);
  const paymentMap = {};
  payments.forEach((p) => {
    paymentMap[p.order_id] = p;
  });
  let filteredOrders = orders;
  if (filter.payment_method || filter.payment_status) {
    filteredOrders = orders.filter((o) => paymentMap[o._id]);
  }
  return {
    data: filteredOrders.map((o) => ({
      ...o.toObject(),
      payment: paymentMap[o._id] || null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

exports.getOrderDetail = async (orderId, userId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);

  if (order.user_id.toString() !== userId.toString()) {
    throw new AppError("Bạn không có quyền xem đơn hàng này", 403);
  }

  const [items, payment, prescriptions] = await Promise.all([
    OrderItem.find({ order_id: orderId }),
    Payment.findOne({ order_id: orderId }),
    order.order_type === "prescription"
      ? PrescriptionOrder.find({ order_id: orderId })
      : Promise.resolve(null),
  ]);

  return {
    ...order.toObject(),
    items,
    payment,
    prescriptions,
  };
};

exports.checkoutWithPayment = async (userId, orderData) => {
  const order = await exports.createOrderFromCart(userId, orderData);
  let payUrl = null;
  try {
    if (
      orderData.payment_method === "momo" &&
      Number(order.payment_due_now) > 0
    ) {
      const momoRes = await momoService.createMomoPayment({
        amount: order.payment_due_now ?? order.final_amount,
        orderId: order._id.toString(),
        orderInfo: `Thanh toán đơn hàng #${order._id}`,
        redirectUrl: process.env.MOMO_REDIRECT_URL,
        ipnUrl: process.env.MOMO_IPN_URL,
      });
      payUrl = momoRes.payUrl || momoRes.deeplink || null;
      if (!payUrl) {
        throw new Error("MoMo không trả về đường dẫn thanh toán");
      }
    } else if (orderData.payment_method === "vnpay") {
      payUrl = await vnpayService.createPaymentUrl(
        order._id.toString(),
        order.payment_due_now ?? order.final_amount,
      );
      if (!payUrl) {
        throw new Error("VNPay không trả về đường dẫn thanh toán");
      }
    }
  } catch (error) {
    if (["momo", "vnpay"].includes(orderData.payment_method)) {
      await Payment.updateOne(
        { order_id: order._id, status: "pending-payment" },
        { $set: { status: "failed" } },
      );
      try {
        await exports.cancelOrder(
          order._id,
          userId,
          "Khởi tạo thanh toán online thất bại",
        );
      } catch (_) {
        // no-op: ưu tiên trả lỗi gốc khởi tạo thanh toán
      }
    }
    throw error;
  }
  return { order, payUrl };
};

exports.createPreorderDirectWithPayment = async (userId, orderData) => {
  const order = await exports.createPreorderDirect(userId, orderData);
  let payUrl = null;
  try {
    if (
      orderData.payment_method === "momo" &&
      Number(order.payment_due_now) > 0
    ) {
      const momoRes = await momoService.createMomoPayment({
        amount: order.payment_due_now ?? order.final_amount,
        orderId: order._id.toString(),
        orderInfo: `Thanh toán đơn hàng #${order._id}`,
        redirectUrl: process.env.MOMO_REDIRECT_URL,
        ipnUrl: process.env.MOMO_IPN_URL,
      });
      payUrl = momoRes.payUrl || momoRes.deeplink || null;
      if (!payUrl) {
        throw new Error("MoMo không trả về đường dẫn thanh toán");
      }
    } else if (orderData.payment_method === "vnpay") {
      payUrl = await vnpayService.createPaymentUrl(
        order._id.toString(),
        order.payment_due_now ?? order.final_amount,
      );
      if (!payUrl) {
        throw new Error("VNPay không trả về đường dẫn thanh toán");
      }
    }
  } catch (error) {
    if (["momo", "vnpay"].includes(orderData.payment_method)) {
      await Payment.updateOne(
        { order_id: order._id, status: "pending-payment" },
        { $set: { status: "failed" } },
      );
      try {
        await exports.cancelOrder(
          order._id,
          userId,
          "Khởi tạo thanh toán online thất bại",
        );
      } catch (error) {
        console.log("Error canceling order", error);
        throw error;
      }
    }
    throw error;
  }
  return { order, payUrl };
};

exports.createPreorderDirect = async (userId, orderData) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1. Validate input
    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new Error("Thiếu danh sách sản phẩm preorder");
    }

    const normalizedItems = orderData.items.map((item) => ({
      ...item,
      lens_params: sanitizeLensParams(item.lens_params),
    }));

    const itemsToOrder = [];
    let total = 0;

    // 2. Validate item preorder và build itemsToOrder
    for (const item of normalizedItems) {
      if (item.combo_id) {
        const orderQty = Number(item.quantity);
        if (!Number.isFinite(orderQty) || orderQty <= 0) {
          throw new Error("Số lượng đặt combo không hợp lệ");
        }

        const combo = await Combo.findOne({
          _id: item.combo_id,
          is_active: true,
        }).session(session);
        if (!combo) throw new Error("Combo không còn hiệu lực");

        const [frame, lens] = await Promise.all([
          ProductVariant.findById(combo.frame_variant_id)
            .session(session)
            .populate("product_id", "is_active"),
          ProductVariant.findById(combo.lens_variant_id)
            .session(session)
            .populate("product_id", "is_active"),
        ]);
        if (!frame || !lens) {
          throw new Error("Không tìm thấy biến thể trong combo");
        }

        const frameAvailable =
          typeof frame.available_quantity === "number"
            ? Number(frame.available_quantity)
            : Math.max(
                0,
                Number(frame.stock_quantity || 0) -
                  Number(frame.reserved_quantity || 0),
              );
        const lensAvailable =
          typeof lens.available_quantity === "number"
            ? Number(lens.available_quantity)
            : Math.max(
                0,
                Number(lens.stock_quantity || 0) -
                  Number(lens.reserved_quantity || 0),
              );

        const frameIsPreorder =
          frameAvailable <= 0 &&
          Boolean(frame.product_id?.is_active) &&
          frame.is_active !== false;
        const lensIsPreorder =
          lensAvailable <= 0 &&
          Boolean(lens.product_id?.is_active) &&
          lens.is_active !== false;

        if (!frameIsPreorder && !lensIsPreorder) {
          throw new Error("Combo chưa thuộc trạng thái preorder");
        }

        frame.reserved_quantity =
          Number(frame.reserved_quantity || 0) + orderQty;
        lens.reserved_quantity = Number(lens.reserved_quantity || 0) + orderQty;
        await Promise.all([frame.save({ session }), lens.save({ session })]);

        const effectiveComboPrice = Number(combo.combo_price || 0);
        const frameRetail = Number(frame.price) || 0;
        const lensRetail = Number(lens.price) || 0;
        const retailSum = frameRetail + lensRetail;
        const frameUnit =
          retailSum > 0
            ? Math.round((frameRetail / retailSum) * effectiveComboPrice)
            : Math.round(effectiveComboPrice / 2);
        const lensUnit = effectiveComboPrice - frameUnit;
        const combo_group_id = new mongoose.Types.ObjectId();

        itemsToOrder.push({
          kind: "combo",
          quantity: orderQty,
          frame_variant_id: frame._id,
          lens_variant_id: lens._id,
          frame_unit_price: frameUnit,
          lens_unit_price: lensUnit,
          lens_params: item.lens_params || null,
          combo_id: combo._id,
          combo_group_id,
        });
        total += effectiveComboPrice * orderQty;
        continue;
      }

      if (!item.variant_id) {
        throw new Error("Thiếu variant_id hoặc combo_id");
      }

      const orderQty = Number(item.quantity);
      if (!Number.isFinite(orderQty) || orderQty <= 0) {
        throw new Error("Số lượng đặt không hợp lệ");
      }

      const variant = await ProductVariant.findById(item.variant_id)
        .session(session)
        .populate("product_id", "is_active type");
      if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm");

      const available =
        typeof variant.available_quantity === "number"
          ? Number(variant.available_quantity)
          : Math.max(
              0,
              Number(variant.stock_quantity || 0) -
                Number(variant.reserved_quantity || 0),
            );
      const isPreorderVariant =
        available <= 0 &&
        Boolean(variant.product_id?.is_active) &&
        variant.is_active !== false;

      if (!isPreorderVariant) {
        throw new Error("Sản phẩm chưa thuộc trạng thái preorder");
      }

      variant.reserved_quantity =
        Number(variant.reserved_quantity || 0) + orderQty;
      await variant.save({ session });

      const effectivePrice = Number(variant.price || 0);
      itemsToOrder.push({
        kind: "variant",
        variant_id: variant._id,
        quantity: orderQty,
        price: effectivePrice,
        lens_params: item.lens_params || null,
      });
      total += effectivePrice * orderQty;
    }

    // 3. Chuẩn hóa địa chỉ giao hàng
    let shippingAddressStr = "";
    if (
      orderData.shipping_address &&
      typeof orderData.shipping_address === "object"
    ) {
      shippingAddressStr = addressToString(orderData.shipping_address);
    } else {
      shippingAddressStr = orderData.shipping_address || "";
    }

    if (!shippingAddressStr || shippingAddressStr.trim() === "") {
      throw new Error("Thiếu địa chỉ giao hàng");
    }
    const phone = normalizePhone(orderData.phone);
    if (!phone) {
      throw new Error("Thiếu số điện thoại");
    }

    // 4. Tính phí ship và công nợ thanh toán cho preorder
    let shipping_fee = 0;
    if (orderData.shipping_method === "ship") {
      const freeShippingMin = Number(process.env.FREE_SHIPPING_MIN || 0);
      const defaultShippingFee = Number(
        process.env.DEFAULT_SHIPPING_FEE || 30000,
      );
      const preorderShippingFee = Number(
        process.env.PREORDER_SHIPPING_FEE || defaultShippingFee,
      );

      if (!(freeShippingMin > 0 && Number(total || 0) >= freeShippingMin)) {
        shipping_fee = Math.max(0, preorderShippingFee);
      }
    }

    const final_amount = total + shipping_fee;
    const envDepositRate = Number(process.env.PREORDER_DEPOSIT_RATE || 0.3);
    const depositRate = Math.min(
      1,
      Math.max(0, Number(orderData.deposit_rate ?? envDepositRate) || 0),
    );

    let deposit_amount = 0;
    let remaining_amount = 0;
    let payment_due_now = 0;
    let payment_phase = "full";

    if (orderData.payment_method === "cod") {
      deposit_amount = 0;
      remaining_amount = final_amount;
      payment_due_now = 0;
      payment_phase = "remaining";
    } else {
      deposit_amount = Math.round(final_amount * depositRate);
      remaining_amount = final_amount - deposit_amount;
      payment_due_now = deposit_amount;
      payment_phase = "deposit";
    }

    // 5. Tạo order
    const order = new Order({
      user_id: userId,
      order_type: "pre_order",
      status: "pending",
      total_amount: total,
      shipping_fee,
      final_amount,
      deposit_rate: orderData.payment_method === "cod" ? 0 : depositRate,
      deposit_amount,
      remaining_amount,
      payment_phase,
      phone,
      shipping_address: shippingAddressStr,
    });
    await order.save({ session });

    // 6. Tạo order items
    for (const item of itemsToOrder) {
      if (item.kind === "combo") {
        await new OrderItem({
          order_id: order._id,
          variant_id: item.frame_variant_id,
          quantity: item.quantity,
          unit_price: item.frame_unit_price,
          lens_params: item.lens_params,
          combo_id: item.combo_id,
          combo_group_id: item.combo_group_id,
          item_type: "frame",
        }).save({ session });
        await new OrderItem({
          order_id: order._id,
          variant_id: item.lens_variant_id,
          quantity: item.quantity,
          unit_price: item.lens_unit_price,
          lens_params: item.lens_params,
          combo_id: item.combo_id,
          combo_group_id: item.combo_group_id,
          item_type: "lens",
        }).save({ session });
      } else {
        let item_type = null;
        const pv = await ProductVariant.findById(item.variant_id)
          .session(session)
          .populate("product_id");
        if (pv?.product_id) {
          item_type = pv.product_id.type;
        }
        await new OrderItem({
          order_id: order._id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.price || 0,
          lens_params: item.lens_params,
          item_type,
        }).save({ session });
      }
    }

    // 7. Tạo payment record
    let paymentStatus = "pending";
    if (orderData.payment_method === "cod") {
      paymentStatus =
        payment_phase === "remaining" ? "remaining-due" : "pending";
    } else if (payment_due_now > 0) {
      paymentStatus = "pending-payment";
    } else if (remaining_amount > 0) {
      paymentStatus = "remaining-due";
    }

    await new Payment({
      order_id: order._id,
      amount: payment_due_now,
      method: orderData.payment_method,
      status: paymentStatus,
    }).save({ session });

    await session.commitTransaction();
    return {
      ...order.toObject(),
      payment_due_now,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

exports.createOrderFromCart = async (userId, orderData) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1) Lấy cart
    const cart = await Cart.findOne({ user_id: userId })
      .session(session)
      .populate({
        path: "items.variant_id",
        populate: { path: "product_id", select: "-_id name slug type images" },
      })
      .populate({
        path: "items.combo_id",
        populate: [
          {
            path: "frame_variant_id",
            select: "stock_quantity reserved_quantity product_id is_active",
            populate: {
              path: "product_id",
              select: "-_id name slug type images",
            },
          },
          {
            path: "lens_variant_id",
            select: "stock_quantity reserved_quantity product_id is_active",
            populate: {
              path: "product_id",
              select: "-_id name slug type images",
            },
          },
        ],
      });

    if (!cart || !cart.items.length) throw new Error("Giỏ hàng trống");

    // 2) Chọn items checkout + normalize
    const selectedItems =
      Array.isArray(orderData.items) && orderData.items.length
        ? orderData.items
        : cart.items.map((i) => ({
            combo_id: i.combo_id ? i.combo_id.toString() : null,
            variant_id: i.variant_id ? i.variant_id.toString() : null,
            quantity: i.quantity,
            lens_params: i.lens_params || null,
          }));

    const normalizedSelectedItems = selectedItems.map((item) => ({
      ...item,
      lens_params: sanitizeLensParams(item.lens_params),
    }));

    // 3) Detect order_type: prescription > pre_order > stock
    let order_type = "stock";

    for (const sel of normalizedSelectedItems) {
      if (sel.lens_params && Object.keys(sel.lens_params).length > 0) {
        order_type = "prescription";
        break;
      }
    }

    if (order_type === "stock") {
      for (const sel of normalizedSelectedItems) {
        if (sel.combo_id) {
          const found = cart.items.find(
            (i) => i.combo_id && i.combo_id.toString() === sel.combo_id,
          );
          const combo = found?.combo_id || null;
          const frame = combo?.frame_variant_id || null;
          const lens = combo?.lens_variant_id || null;

          const frameAvailable = frame
            ? typeof frame.available_quantity === "number"
              ? Number(frame.available_quantity)
              : Math.max(
                  0,
                  Number(frame.stock_quantity || 0) -
                    Number(frame.reserved_quantity || 0),
                )
            : 0;
          const lensAvailable = lens
            ? typeof lens.available_quantity === "number"
              ? Number(lens.available_quantity)
              : Math.max(
                  0,
                  Number(lens.stock_quantity || 0) -
                    Number(lens.reserved_quantity || 0),
                )
            : 0;

          const frameIsPreorder =
            frameAvailable <= 0 &&
            Boolean(frame?.product_id?.is_active) &&
            frame?.is_active !== false;
          const lensIsPreorder =
            lensAvailable <= 0 &&
            Boolean(lens?.product_id?.is_active) &&
            lens?.is_active !== false;

          if (frameIsPreorder || lensIsPreorder) {
            order_type = "pre_order";
            break;
          }
        }

        if (sel.variant_id) {
          const variant = await ProductVariant.findById(sel.variant_id)
            .session(session)
            .select("stock_quantity reserved_quantity product_id is_active")
            .populate("product_id", "is_active");

          const available = variant
            ? typeof variant.available_quantity === "number"
              ? Number(variant.available_quantity)
              : Math.max(
                  0,
                  Number(variant.stock_quantity || 0) -
                    Number(variant.reserved_quantity || 0),
                )
            : 0;
          const isPreorderVariant =
            available <= 0 &&
            Boolean(variant?.product_id?.is_active) &&
            variant?.is_active !== false;

          if (isPreorderVariant) {
            order_type = "pre_order";
            break;
          }
        }
      }
    }

    // 4) Validate stock và build itemsToOrder
    const itemsToOrder = [];
    let total = 0;

    for (const sel of normalizedSelectedItems) {
      if (sel.combo_id) {
        const found = cart.items.find(
          (i) => i.combo_id && i.combo_id.toString() === sel.combo_id,
        );
        if (!found) throw new Error("Item combo trong cart không hợp lệ");

        const combo = await Combo.findOne({
          _id: found.combo_id,
          is_active: true,
        }).session(session);
        if (!combo) throw new Error("Combo không còn hiệu lực");

        const [frame, lens] = await Promise.all([
          ProductVariant.findById(combo.frame_variant_id).session(session),
          ProductVariant.findById(combo.lens_variant_id).session(session),
        ]);
        if (!frame || !lens)
          throw new Error("Không tìm thấy biến thể trong combo");

        const orderQty = Number(sel.quantity ?? found.quantity);
        if (orderQty <= 0) throw new Error("Số lượng đặt combo không hợp lệ");

        if (order_type !== "pre_order") {
          const fAvail =
            typeof frame.available_quantity === "number"
              ? Number(frame.available_quantity)
              : Number(frame.stock_quantity || 0);
          const lAvail =
            typeof lens.available_quantity === "number"
              ? Number(lens.available_quantity)
              : Number(lens.stock_quantity || 0);

          if (orderQty > fAvail || orderQty > lAvail) {
            throw new Error("Số lượng combo vượt tồn kho");
          }
        }

        const effectiveComboPrice =
          found.combo_price_snapshot ?? combo.combo_price;
        const frameRetail = Number(frame.price) || 0;
        const lensRetail = Number(lens.price) || 0;
        const retailSum = frameRetail + lensRetail;
        const frameUnit =
          retailSum > 0
            ? Math.round(
                (frameRetail / retailSum) * Number(effectiveComboPrice || 0),
              )
            : Math.round(Number(effectiveComboPrice || 0) / 2);
        const lensUnit = Number(effectiveComboPrice || 0) - frameUnit;
        const combo_group_id = new mongoose.Types.ObjectId();

        itemsToOrder.push({
          kind: "combo",
          quantity: orderQty,
          frame_variant_id: frame._id,
          lens_variant_id: lens._id,
          frame_unit_price: frameUnit,
          lens_unit_price: lensUnit,
          lens_params: sel.lens_params || found.lens_params,
          combo_id: combo._id,
          combo_group_id,
        });
        total += (effectiveComboPrice || 0) * orderQty;
      } else {
        const found = cart.items.find(
          (i) => i.variant_id && i.variant_id.toString() === sel.variant_id,
        );
        if (!found) throw new Error("Item trong cart không hợp lệ");

        const variant = await ProductVariant.findById(found.variant_id).session(
          session,
        );
        if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm");

        const orderQty = Number(sel.quantity ?? found.quantity);
        if (orderQty <= 0) throw new Error("Số lượng đặt không hợp lệ");

        if (order_type !== "pre_order") {
          const available =
            typeof variant.available_quantity === "number"
              ? Number(variant.available_quantity)
              : Number(variant.stock_quantity || 0);
          if (orderQty > available) {
            throw new Error("Số lượng vượt tồn kho");
          }
        }

        const effectivePrice = found.price_snapshot ?? variant.price;

        itemsToOrder.push({
          kind: "variant",
          variant_id: variant._id,
          quantity: orderQty,
          price: effectivePrice,
          lens_params: sel.lens_params || found.lens_params,
        });
        total += (effectivePrice || 0) * orderQty;
      }
    }

    // 5) Chuẩn hóa địa chỉ giao hàng
    let shippingAddressStr = "";
    if (
      orderData.shipping_address &&
      typeof orderData.shipping_address === "object"
    ) {
      shippingAddressStr = addressToString(orderData.shipping_address);
    } else {
      shippingAddressStr = orderData.shipping_address || "";
    }
    const phone = normalizePhone(orderData.phone);
    if (!phone) {
      throw new Error("Thiếu số điện thoại");
    }

    const hasShippingAddress =
      String(shippingAddressStr || "").trim().length > 0;
    if (
      !hasShippingAddress &&
      (order_type === "pre_order" || orderData.shipping_method === "ship")
    ) {
      throw new Error("Thiếu địa chỉ giao hàng");
    }

    // 6) Tính phí ship và payment breakdown
    let shipping_fee = 0;
    if (orderData.shipping_method === "ship") {
      const freeShippingMin = Number(process.env.FREE_SHIPPING_MIN || 0);
      const defaultShippingFee = Number(
        process.env.DEFAULT_SHIPPING_FEE || 30000,
      );
      const preorderShippingFee = Number(
        process.env.PREORDER_SHIPPING_FEE || defaultShippingFee,
      );
      const baseFee =
        order_type === "pre_order" ? preorderShippingFee : defaultShippingFee;

      if (!(freeShippingMin > 0 && Number(total || 0) >= freeShippingMin)) {
        shipping_fee = Math.max(0, baseFee);
      }
    }

    const final_amount = total + shipping_fee;
    const envDepositRate = Number(process.env.PREORDER_DEPOSIT_RATE || 0.3);
    const depositRate = Math.min(
      1,
      Math.max(0, Number(orderData.deposit_rate ?? envDepositRate) || 0),
    );

    let deposit_amount = 0;
    let remaining_amount = 0;
    let payment_due_now = 0;
    let payment_phase = "full";

    switch (order_type) {
      case "pre_order":
        if (orderData.payment_method === "cod") {
          deposit_amount = 0;
          remaining_amount = final_amount;
          payment_due_now = 0;
          payment_phase = "remaining";
        } else {
          deposit_amount = Math.round(final_amount * depositRate);
          remaining_amount = final_amount - deposit_amount;
          payment_due_now = deposit_amount;
          payment_phase = "deposit";
        }
        break;
      default:
        deposit_amount = final_amount;
        remaining_amount = 0;
        payment_due_now = final_amount;
        payment_phase = "full";
        break;
    }

    // 7) Tạo order
    const order = new Order({
      user_id: userId,
      order_type,
      status: "pending",
      total_amount: total,
      shipping_fee,
      final_amount,
      deposit_rate:
        order_type === "pre_order" && orderData.payment_method !== "cod"
          ? depositRate
          : 0,
      deposit_amount,
      remaining_amount,
      payment_phase,
      phone,
      shipping_address: shippingAddressStr,
    });
    await order.save({ session });

    // 8) Tạo order items
    for (const item of itemsToOrder) {
      if (item.kind === "combo") {
        await new OrderItem({
          order_id: order._id,
          variant_id: item.frame_variant_id,
          quantity: item.quantity,
          unit_price: item.frame_unit_price,
          lens_params: item.lens_params,
          combo_id: item.combo_id,
          combo_group_id: item.combo_group_id,
          item_type: "frame",
        }).save({ session });
        await new OrderItem({
          order_id: order._id,
          variant_id: item.lens_variant_id,
          quantity: item.quantity,
          unit_price: item.lens_unit_price,
          lens_params: item.lens_params,
          combo_id: item.combo_id,
          combo_group_id: item.combo_group_id,
          item_type: "lens",
        }).save({ session });
      } else {
        let item_type = null;
        if (item.variant_id) {
          const pv = await ProductVariant.findById(item.variant_id)
            .session(session)
            .populate("product_id");
          if (pv?.product_id) {
            item_type = pv.product_id.type; // "frame" | "lens" | "accessory"
          }
        }
        await new OrderItem({
          order_id: order._id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.price || 0,
          lens_params: item.lens_params,
          item_type,
        }).save({ session });
      }
    }

    // 9) Tạo prescription records nếu cần
    if (order_type === "prescription") {
      const prescriptionItems = itemsToOrder.filter(
        (i) => i.lens_params && Object.keys(i.lens_params).length > 0,
      );
      for (const item of prescriptionItems) {
        const lp = item.lens_params || {};
        await PrescriptionOrder.create(
          [
            {
              order_id: order._id,
              sph_right: lp.sph_right,
              sph_left: lp.sph_left,
              cyl_right: lp.cyl_right,
              cyl_left: lp.cyl_left,
              axis_right: lp.axis_right,
              axis_left: lp.axis_left,
              add_right: lp.add_right,
              add_left: lp.add_left,
              pd: lp.pd,
              pupillary_distance: lp.pupillary_distance,
              prescription_image: orderData.prescription_image,
              optometrist_name: orderData.optometrist_name,
              clinic_name: orderData.clinic_name,
            },
          ],
          { session },
        );
      }
    }

    // 10) Tạo payment record
    let paymentStatus = "pending";
    switch (orderData.payment_method) {
      case "cod":
        paymentStatus =
          payment_phase === "remaining" ? "remaining-due" : "pending";
        break;
      default:
        if (payment_due_now > 0) {
          paymentStatus = "pending-payment";
        } else if (remaining_amount > 0) {
          paymentStatus = "remaining-due";
        }
        break;
    }

    await new Payment({
      order_id: order._id,
      amount: payment_due_now,
      method: orderData.payment_method,
      status: paymentStatus,
    }).save({ session });

    // 11) Trừ item đã checkout khỏi cart
    const nextCartItems = [];
    for (const item of cart.items) {
      const plain = item.toObject ? item.toObject() : { ...item };
      const selected = normalizedSelectedItems.find((s) => {
        if (s.combo_id && plain.combo_id) {
          return String(s.combo_id) === String(plain.combo_id);
        }
        if (s.variant_id && plain.variant_id) {
          return String(s.variant_id) === String(plain.variant_id);
        }
        return false;
      });

      if (!selected) {
        nextCartItems.push({
          variant_id: plain.variant_id,
          combo_id: plain.combo_id,
          quantity: plain.quantity,
          lens_params: plain.lens_params,
        });
        continue;
      }

      const requestedQty =
        selected.quantity !== undefined
          ? Number(selected.quantity)
          : Number(plain.quantity);
      const remain = Number(plain.quantity) - requestedQty;

      if (remain > 0) {
        nextCartItems.push({
          variant_id: plain.variant_id,
          combo_id: plain.combo_id,
          quantity: remain,
          lens_params: plain.lens_params,
        });
      }
    }
    cart.items = nextCartItems;
    cart.updated_at = new Date();
    await cart.save({ session });

    await session.commitTransaction();
    return {
      ...order.toObject(),
      payment_due_now,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const STATE_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["manufacturing", "packed", "received", "shipped"],
  manufacturing: ["packed"],
  packed: ["shipped"],
  shipped: ["delivered"],
  delivered: ["completed", "return_requested"],
  completed: [],
  cancelled: [],
  return_requested: ["returned", "refunded", "return_rejected"],
  returned: [],
  refunded: [],
  return_rejected: [],
  // Pre-order: hàng về kho
  received: ["packed"],
};

exports.updateOrderStatus = async (orderId, newStatus, userRole, reason) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng");
  const previousStatus = order.status;

  const baseTransitions = STATE_TRANSITIONS[order.status] || [];
  let allowedTransitions = [];

  if (order.order_type === "prescription") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("manufacturing")
          ? ["manufacturing"]
          : []
        : baseTransitions;
  } else if (order.order_type === "pre_order") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("received")
          ? ["received"]
          : []
        : baseTransitions.filter((s) => s !== "manufacturing");
  } else {
    allowedTransitions = baseTransitions.filter(
      (s) => s !== "manufacturing" && s !== "received",
    );
  }

  if (!allowedTransitions.includes(newStatus)) {
    const msg = allowedTransitions.length
      ? `Không thể chuyển từ "${order.status}" sang "${newStatus}". Các trạng thái hợp lệ: ${allowedTransitions.join(", ")}`
      : `Không thể chuyển từ "${order.status}" — đơn hàng đã ở trạng thái cuối`;
    throw new Error(msg);
  }

  // 🔒 Role-based: chỉ operations được cập nhật các trạng thái vận hành
  const OPS_ONLY_STATUSES = [
    "processing",
    "manufacturing",
    "received",
    "packed",
    "shipped",
    "delivered",
  ];
  if (OPS_ONLY_STATUSES.includes(newStatus) && userRole !== "operations") {
    throw new Error("Chỉ nhân viên operations được cập nhật trạng thái này");
  }

  // ✅ Transition hợp lệ → cập nhật
  order.status = newStatus;
  if (newStatus === "return_rejected") {
    const rejectReason = String(reason || "").trim();
    if (!rejectReason) {
      throw new Error("Vui lòng nhập lý do từ chối trả hàng");
    }
    order.return_reject_reason = rejectReason;
  }

  const ProductVariant = require("../models/productVariant.schema");

  if (newStatus === "received") {
    if (order.order_type === "pre_order") {
      const items = await OrderItem.find({ order_id: orderId });
      const qtyMap = new Map();

      for (const item of items) {
        const key = item.variant_id.toString();
        qtyMap.set(key, (qtyMap.get(key) || 0) + Number(item.quantity || 0));
      }

      for (const [variantId, qty] of qtyMap.entries()) {
        const reservedResult = await ProductVariant.updateOne(
          { _id: variantId, reserved_quantity: { $gte: qty } },
          { $inc: { reserved_quantity: -qty } },
        );
        if (reservedResult.modifiedCount === 0) {
          throw new Error(
            `Không đủ reserved_quantity để trừ cho biến thể ${variantId}`,
          );
        }
        await ProductVariant.updateOne(
          { _id: variantId },
          { $inc: { stock_quantity: qty } },
        );
      }
    }
  }

  if (newStatus === "packed") {
    const isPreOrderNotReceived =
      order.order_type === "pre_order" && previousStatus !== "received";

    if (!isPreOrderNotReceived) {
      const items = await OrderItem.find({ order_id: orderId });

      for (const item of items) {
        if (order.order_type === "prescription") {
          if (item.item_type !== "lens") {
            const quantity = Number(item.quantity);
            const reservedResult = await ProductVariant.updateOne(
              { _id: item.variant_id, reserved_quantity: { $gte: quantity } },
              { $inc: { reserved_quantity: -quantity } },
            );
            if (reservedResult.modifiedCount === 0) {
              throw new Error(
                `Không đủ reserved_quantity để trừ cho biến thể ${item.variant_id}`,
              );
            }

            const stockResult = await ProductVariant.updateOne(
              { _id: item.variant_id, stock_quantity: { $gte: quantity } },
              { $inc: { stock_quantity: -quantity } },
            );
            if (stockResult.modifiedCount === 0) {
              throw new Error(
                `Không đủ stock_quantity để trừ cho biến thể ${item.variant_id}`,
              );
            }
          }
        } else {
          if (order.order_type !== "pre_order") {
            const quantity = Number(item.quantity);
            const reservedResult = await ProductVariant.updateOne(
              { _id: item.variant_id, reserved_quantity: { $gte: quantity } },
              { $inc: { reserved_quantity: -quantity } },
            );
            if (reservedResult.modifiedCount === 0) {
              throw new Error(
                `Không đủ reserved_quantity để trừ cho biến thể ${item.variant_id}`,
              );
            }
          }
          const quantity = Number(item.quantity);
          const stockResult = await ProductVariant.updateOne(
            { _id: item.variant_id, stock_quantity: { $gte: quantity } },
            { $inc: { stock_quantity: -quantity } },
          );
          if (stockResult.modifiedCount === 0) {
            throw new Error(
              `Không đủ stock_quantity để trừ cho biến thể ${item.variant_id}`,
            );
          }
        }
      }
    }
  }

  if (newStatus === "manufacturing") {
    if (order.order_type === "prescription") {
      const items = await OrderItem.find({ order_id: orderId });

      for (const item of items) {
        if (item.item_type === "lens") {
          const quantity = Number(item.quantity);
          const reservedResult = await ProductVariant.updateOne(
            { _id: item.variant_id, reserved_quantity: { $gte: quantity } },
            { $inc: { reserved_quantity: -quantity } },
          );
          if (reservedResult.modifiedCount === 0) {
            throw new Error(
              `Không đủ reserved_quantity để trừ cho biến thể ${item.variant_id}`,
            );
          }

          const stockResult = await ProductVariant.updateOne(
            { _id: item.variant_id, stock_quantity: { $gte: quantity } },
            { $inc: { stock_quantity: -quantity } },
          );
          if (stockResult.modifiedCount === 0) {
            throw new Error(
              `Không đủ stock_quantity để trừ cho biến thể ${item.variant_id}`,
            );
          }
        }
      }
    }
  }

  if (newStatus === "delivered") {
    const payment = await Payment.findOne({ order_id: orderId, method: "cod" });
    if (payment && payment.status !== "paid") {
      payment.status = "paid";
      payment.paid_at = new Date();
      await payment.save();
    }
  }

  if (newStatus === "returned" || newStatus === "cancelled") {
    const items = await OrderItem.find({ order_id: orderId });
    const qtyMap = new Map();

    for (const item of items) {
      const key = item.variant_id.toString();
      qtyMap.set(key, (qtyMap.get(key) || 0) + Number(item.quantity || 0));
    }

    if (newStatus === "cancelled") {
      for (const [variantId, qty] of qtyMap.entries()) {
        const reservedResult = await ProductVariant.updateOne(
          { _id: variantId, reserved_quantity: { $gte: qty } },
          { $inc: { reserved_quantity: -qty } },
        );
        if (reservedResult.modifiedCount === 0) {
          throw new Error(
            `Không đủ reserved_quantity để trừ cho biến thể ${variantId}`,
          );
        }
      }
    } else if (newStatus === "returned") {
      for (const [variantId, qty] of qtyMap.entries()) {
        await ProductVariant.updateOne(
          { _id: variantId },
          { $inc: { stock_quantity: qty } },
        );
      }

      const payment = await Payment.findOne({
        order_id: orderId,
        method: "cod",
      });
      if (payment && payment.status !== "failed") {
        payment.status = "failed";
        await payment.save();
      }
    }
  }

  await order.save();
  return order;
};

exports.confirmOrder = async (orderId, user) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng");

  const baseTransitions = STATE_TRANSITIONS[order.status] || [];
  let allowedTransitions = [];

  if (order.order_type === "prescription") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("manufacturing")
          ? ["manufacturing"]
          : []
        : baseTransitions;
  } else if (order.order_type === "pre_order") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("received")
          ? ["received"]
          : []
        : baseTransitions.filter((s) => s !== "manufacturing");
  } else {
    allowedTransitions = baseTransitions.filter(
      (s) => s !== "manufacturing" && s !== "received",
    );
  }

  if (
    !allowedTransitions.includes("confirmed") &&
    !allowedTransitions.includes("cancelled")
  ) {
    throw new Error("Trạng thái hiện tại không cho phép xác nhận hoặc hủy đơn");
  }
  if (user.role !== "sales")
    throw new Error("Chỉ nhân viên sale được xác nhận đơn");

  if (user.reject === true || user.reject === "true") {
    order.status = "cancelled";
    if (user.reject_reason) order.reject_reason = user.reject_reason;
    await order.save();
    return order;
  }

  order.status = "confirmed";
  await order.save();
  return order;
};

exports.cancelOrder = async (orderId, userId, reason) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng");

  // Chỉ chủ đơn mới được hủy
  if (order.user_id.toString() !== userId.toString()) {
    throw new Error("Bạn không có quyền hủy đơn hàng này");
  }

  const baseTransitions = STATE_TRANSITIONS[order.status] || [];
  let allowedTransitions = [];

  if (order.order_type === "prescription") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("manufacturing")
          ? ["manufacturing"]
          : []
        : baseTransitions;
  } else if (order.order_type === "pre_order") {
    allowedTransitions =
      order.status === "processing"
        ? baseTransitions.includes("received")
          ? ["received"]
          : []
        : baseTransitions.filter((s) => s !== "manufacturing");
  } else {
    allowedTransitions = baseTransitions.filter(
      (s) => s !== "manufacturing" && s !== "received",
    );
  }

  if (!allowedTransitions.includes("cancelled")) {
    throw new Error(`Không thể hủy đơn ở trạng thái "${order.status}"`);
  }

  order.status = "cancelled";
  if (reason) order.cancel_reason = reason;

  if (["stock", "pre_order", "prescription"].includes(order.order_type)) {
    const ProductVariant = require("../models/productVariant.schema");
    const items = await OrderItem.find({ order_id: orderId });
    const qtyMap = new Map();

    for (const item of items) {
      const key = item.variant_id.toString();
      qtyMap.set(key, (qtyMap.get(key) || 0) + Number(item.quantity || 0));
    }

    for (const [variantId, qty] of qtyMap.entries()) {
      const reservedResult = await ProductVariant.updateOne(
        { _id: variantId, reserved_quantity: { $gte: qty } },
        { $inc: { reserved_quantity: -qty } },
      );
      if (reservedResult.modifiedCount === 0) {
        throw new Error(
          `Không đủ reserved_quantity để trừ cho biến thể ${variantId}`,
        );
      }
    }
  }

  await order.save();
  return order;
};
