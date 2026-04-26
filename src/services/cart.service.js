const Cart = require("../models/cart.schema");
const ProductVariant = require("../models/productVariant.schema");
const Combo = require("../models/combo.schema");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const mongoose = require("mongoose");
const { sanitizeLensParams } = require("../utils/lens-params");

exports.getCartByUser = async (userId) => {
  let cart = await Cart.findOne({ user_id: userId })
    .populate({
      path: "items.variant_id",
      populate: { path: "product_id", select: "-_id name slug type images" },
    })
    .populate({
      path: "items.combo_id",
      populate: [
        {
          path: "frame_variant_id",
          populate: {
            path: "product_id",
            select: "-_id name slug type images",
          },
        },
        {
          path: "lens_variant_id",
          populate: {
            path: "product_id",
            select: "-_id name slug type images",
          },
        },
      ],
    });
  if (!cart) {
    cart = await Cart.create({ user_id: userId, items: [] });
  }
  return cart;
};

exports.addItem = async (userId, variant_id, quantity, lens_params) => {
  try {
    const qty = Number(quantity);
    if (!qty) throw new Error("Số lượng không hợp lệ");

    // 1. Lấy variant
    const variant = await ProductVariant.findOne({
      _id: variant_id,
      is_active: true,
    }).populate("product_id");

    if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm");

    // Chỉ chấp nhận lens_params khi product type là "lens"
    const productType = variant.product_id?.type;
    const safeLensParams =
      productType === "lens" ? sanitizeLensParams(lens_params) : null;

    // 2. Lấy hoặc tạo cart
    let cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      cart = await Cart.create({ user_id: userId, items: [] });
    }

    // 3. Tìm item trong cart
    const item = cart.items.find(
      (i) => i.variant_id?.toString() === variant_id,
    );

    const stock = Number(variant.stock_quantity || 0);
    const reserved = Number(variant.reserved_quantity || 0);
    const currentQty = Number(item?.quantity || 0);
    const totalQty = currentQty + qty;

    // 4. Kiểm tra tồn kho
    const available = stock - reserved;
    if (totalQty > available) {
      throw new Error(`Số lượng vượt quá tồn kho (${available})`);
    }

    // 5. Cập nhật cart item
    if (item) {
      item.quantity = totalQty;
      if (productType === "lens") {
        if (safeLensParams) item.lens_params = safeLensParams;
      } else {
        item.lens_params = null;
      }
      item.price_snapshot = variant.price;
    } else {
      cart.items.push({
        variant_id,
        quantity: qty,
        lens_params: safeLensParams,
        price_snapshot: variant.price,
      });
    }

    // 6. Save cart
    cart.updated_at = new Date();
    await cart.save();

    return {
      message: "Thêm sản phẩm vào giỏ hàng thành công",
      cart,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

exports.addComboItem = async (userId, combo_id, quantity, lens_params) => {
  try {
    const qty = Number(quantity);
    if (!qty) throw new Error("Số lượng không hợp lệ");

    const safeLensParams = sanitizeLensParams(lens_params);

    // 1. Lấy combo và 2 biến thể (gọng + tròng)
    const combo = await Combo.findOne({
      _id: combo_id,
      is_active: true,
      frame_variant_id: { $exists: true },
      lens_variant_id: { $exists: true },
    })
      .populate({ path: "frame_variant_id", populate: { path: "product_id" } })
      .populate({ path: "lens_variant_id", populate: { path: "product_id" } });

    if (!combo) {
      throw new Error("Không tìm thấy combo hoặc combo đã ngừng bán");
    }

    const frame = combo.frame_variant_id;
    const lens = combo.lens_variant_id;
    if (!frame || !lens) {
      throw new Error("Combo thiếu biến thể gọng hoặc tròng");
    }

    // 2. Lấy hoặc tạo cart
    let cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      cart = await Cart.create({ user_id: userId, items: [] });
    }

    // 3. Tìm item combo trong cart
    const item = cart.items.find((i) => i.combo_id?.toString() === combo_id);
    const currentQty = Number(item?.quantity || 0);
    const totalQty = currentQty + qty;

    // 4. Kiểm tra tồn kho cho từng biến thể
    const frameStock = Number(frame.stock_quantity || 0);
    const frameReserved = Number(frame.reserved_quantity || 0);
    const frameAvailable =
      typeof frame.available_quantity === "number"
        ? Number(frame.available_quantity)
        : Math.max(0, frameStock - frameReserved);

    const lensStock = Number(lens.stock_quantity || 0);
    const lensReserved = Number(lens.reserved_quantity || 0);
    const lensAvailable =
      typeof lens.available_quantity === "number"
        ? Number(lens.available_quantity)
        : Math.max(0, lensStock - lensReserved);

    if (totalQty > frameAvailable) {
      throw new Error(`Số lượng vượt tồn kho gọng (${frameAvailable})`);
    }

    if (totalQty > lensAvailable) {
      throw new Error(`Số lượng vượt tồn kho tròng (${lensAvailable})`);
    }

    // 5. Cập nhật combo item trong cart
    if (item) {
      item.quantity = totalQty;
      if (safeLensParams) item.lens_params = safeLensParams;
      item.combo_price_snapshot = combo.combo_price;
    } else {
      cart.items.push({
        combo_id,
        quantity: qty,
        lens_params: safeLensParams,
        combo_price_snapshot: combo.combo_price,
      });
    }

    // 6. Save cart
    cart.updated_at = new Date();
    await cart.save();

    return {
      message: "Thêm combo vào giỏ hàng thành công",
      cart,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

exports.updateItem = async (userId, variant_id, quantity, lens_params) => {
  const newQty = Number(quantity);
  if (newQty < 0) throw new Error("Số lượng không hợp lệ");

  const variant = await ProductVariant.findOne({
    _id: variant_id,
    is_active: true,
  }).populate("product_id");
  if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm");

  const productType = variant.product_id?.type;
  const safeLensParams =
    productType === "lens" ? sanitizeLensParams(lens_params) : null;

  // 2. Lấy cart và tìm item cần update
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;

  const cartItem = cart.items.find(
    (i) => i.variant_id && i.variant_id.toString() === variant_id,
  );
  if (!cartItem) return null;

  // 3. Kiểm tra tồn kho
  const currentStock = Number(variant.stock_quantity || 0);
  const currentReserved = Number(variant.reserved_quantity || 0);
  const available =
    typeof variant.available_quantity === "number"
      ? Number(variant.available_quantity)
      : Math.max(0, currentStock - currentReserved);

  if (newQty > available) {
    throw new Error(`Số lượng vượt quá tồn kho (${available})`);
  }

  cartItem.quantity = newQty;
  if (productType === "lens") {
    if (safeLensParams) cartItem.lens_params = safeLensParams;
  } else {
    cartItem.lens_params = null;
  }
  cartItem.price_snapshot = variant.price;

  cart.updated_at = new Date();
  await cart.save();

  return cart;
};

exports.updateItemByLineId = async (userId, cartLineId, quantity, lens_params) => {
  const newQty = Number(quantity);
  if (newQty < 0) throw new Error("Số lượng không hợp lệ");
  if (!mongoose.Types.ObjectId.isValid(cartLineId)) return null;

  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;

  const cartItem = cart.items.id(cartLineId);
  if (!cartItem) return null;

  // lens_params chỉ áp dụng cho variant là tròng kính (lens) hoặc combo có lens.
  // Cho variant khác (frame/accessory/sunglass) sẽ bị clear ở dưới.
  let allowLensParams = false;

  if (cartItem.variant_id) {
    const variant = await ProductVariant.findOne({
      _id: cartItem.variant_id,
      is_active: true,
    }).populate("product_id");
    if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm");

    const available =
      typeof variant.available_quantity === "number"
        ? Number(variant.available_quantity)
        : Math.max(
            0,
            Number(variant.stock_quantity || 0) -
              Number(variant.reserved_quantity || 0),
          );
    if (newQty > available) {
      throw new Error(`Số lượng vượt quá tồn kho (${available})`);
    }
    cartItem.price_snapshot = variant.price;
    allowLensParams = variant.product_id?.type === "lens";
  } else if (cartItem.combo_id) {
    const combo = await Combo.findOne({
      _id: cartItem.combo_id,
      is_active: true,
      frame_variant_id: { $exists: true },
      lens_variant_id: { $exists: true },
    })
      .populate({ path: "frame_variant_id", populate: { path: "product_id" } })
      .populate({ path: "lens_variant_id", populate: { path: "product_id" } });
    if (!combo) throw new Error("Không tìm thấy combo hoặc combo đã ngừng bán");

    const frame = combo.frame_variant_id;
    const lens = combo.lens_variant_id;
    if (!frame || !lens) {
      throw new Error("Combo thiếu biến thể gọng hoặc tròng");
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
    if (newQty > frameAvailable) {
      throw new Error(`Số lượng vượt tồn kho gọng (${frameAvailable})`);
    }
    if (newQty > lensAvailable) {
      throw new Error(`Số lượng vượt tồn kho tròng (${lensAvailable})`);
    }
    cartItem.combo_price_snapshot = combo.combo_price;
    allowLensParams = true;
  }

  cartItem.quantity = newQty;
  if (allowLensParams) {
    const safeLensParams = sanitizeLensParams(lens_params);
    if (safeLensParams) cartItem.lens_params = safeLensParams;
  } else {
    cartItem.lens_params = null;
  }
  cart.updated_at = new Date();
  await cart.save();

  return cart;
};

exports.updateComboItem = async (userId, combo_id, quantity, lens_params) => {
  const safeLensParams = sanitizeLensParams(lens_params);
  const newQty = Number(quantity);
  if (newQty < 0) throw new Error("Số lượng không hợp lệ");
  if (!mongoose.Types.ObjectId.isValid(combo_id)) {
    throw new Error("combo_id không hợp lệ");
  }

  const combo = await Combo.findOne({
    _id: combo_id,
    is_active: true,
    frame_variant_id: { $exists: true },
    lens_variant_id: { $exists: true },
  })
    .populate({ path: "frame_variant_id", populate: { path: "product_id" } })
    .populate({ path: "lens_variant_id", populate: { path: "product_id" } });
  if (!combo) {
    throw new Error("Không tìm thấy combo hoặc combo đã ngừng bán");
  }
  const frame = combo.frame_variant_id;
  const lens = combo.lens_variant_id;
  if (!frame || !lens) {
    throw new Error("Combo thiếu biến thể gọng hoặc tròng");
  }

  // 2. Lấy cart và tìm combo item cần update
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;

  const item = cart.items.find(
    (i) => i.combo_id && i.combo_id.toString() === combo_id,
  );
  if (!item) return null;

  // 3. Kiểm tra tồn kho của từng biến thể trong combo
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
  if (newQty > frameAvailable) {
    throw new Error(`Số lượng vượt tồn kho gọng (${frameAvailable})`);
  }
  if (newQty > lensAvailable) {
    throw new Error(`Số lượng vượt tồn kho tròng (${lensAvailable})`);
  }

  // 4. Cập nhật combo item trong cart
  item.quantity = newQty;
  if (safeLensParams) item.lens_params = safeLensParams;
  item.combo_price_snapshot = combo.combo_price;

  // 5. Save cart
  cart.updated_at = new Date();
  await cart.save();

  return cart;
};

exports.removeItem = async (userId, variant_id) => {
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;
  cart.items = cart.items.filter(
    (i) => !(i.variant_id && i.variant_id.toString() === variant_id),
  );
  cart.updated_at = new Date();
  await cart.save();
  return cart;
};

exports.removeItemByLineId = async (userId, cartLineId) => {
  if (!mongoose.Types.ObjectId.isValid(cartLineId)) return null;
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;

  const cartItem = cart.items.id(cartLineId);
  if (!cartItem) return null;

  cartItem.deleteOne();
  cart.updated_at = new Date();
  await cart.save();
  return cart;
};

exports.removeComboItem = async (userId, combo_id) => {
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;
  cart.items = cart.items.filter(
    (i) => !(i.combo_id && i.combo_id.toString() === combo_id),
  );
  cart.updated_at = new Date();
  await cart.save();
  return cart;
};

exports.clearCart = async (userId) => {
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) return null;
  cart.items = [];
  cart.updated_at = new Date();
  await cart.save();
  return cart;
};

function refIdString(ref) {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (ref._id) return String(ref._id);
  return String(ref);
}

/**
 * Sau khi thanh toán online thành công: trừ khỏi giỏ đúng các dòng tương ứng OrderItem.
 * Idempotent nếu giỏ đã được trừ trước đó (không âm số lượng).
 */
exports.subtractCartLinesForOrder = async (orderId) => {
  const order = await Order.findById(orderId).select("user_id");
  if (!order) return null;

  const orderItems = await OrderItem.find({ order_id: orderId }).lean();
  const comboGroupSeen = new Set();
  const comboQty = new Map();
  const variantQty = new Map();

  for (const it of orderItems) {
    if (it.combo_id && it.combo_group_id) {
      const gid = String(it.combo_group_id);
      if (comboGroupSeen.has(gid)) continue;
      comboGroupSeen.add(gid);
      const cid = String(it.combo_id);
      comboQty.set(cid, (comboQty.get(cid) || 0) + Number(it.quantity || 0));
    } else {
      const vid = String(it.variant_id);
      variantQty.set(vid, (variantQty.get(vid) || 0) + Number(it.quantity || 0));
    }
  }

  const cart = await Cart.findOne({ user_id: order.user_id });
  if (!cart || !cart.items.length) return cart;

  const nextItems = [];
  for (const item of cart.items) {
    const plain = item.toObject ? item.toObject() : { ...item };
    let qty = Number(plain.quantity || 0);
    if (plain.combo_id) {
      const cid = refIdString(plain.combo_id);
      let take = comboQty.get(cid) || 0;
      if (take > 0) {
        const used = Math.min(qty, take);
        qty -= used;
        comboQty.set(cid, take - used);
      }
    } else if (plain.variant_id) {
      const vid = refIdString(plain.variant_id);
      let take = variantQty.get(vid) || 0;
      if (take > 0) {
        const used = Math.min(qty, take);
        qty -= used;
        variantQty.set(vid, take - used);
      }
    }
    if (qty > 0) {
      nextItems.push({
        variant_id: plain.variant_id,
        combo_id: plain.combo_id,
        quantity: qty,
        lens_params: plain.lens_params,
        price_snapshot: plain.price_snapshot,
        combo_price_snapshot: plain.combo_price_snapshot,
      });
    }
  }

  cart.items = nextItems;
  cart.updated_at = new Date();
  await cart.save();
  return cart;
};
