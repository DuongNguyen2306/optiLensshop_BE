const mongoose = require("mongoose");
const Combo = require("../models/combo.schema");
const ProductVariant = require("../models/productVariant.schema");
const Product = require("../models/product.schema");
const { createHttpError } = require("../utils/create-http-error");

async function assertFrameLensPair(frameVariantId, lensVariantId) {
  if (
    !mongoose.Types.ObjectId.isValid(frameVariantId) ||
    !mongoose.Types.ObjectId.isValid(lensVariantId)
  ) {
    throw createHttpError(
      "frame_variant_id hoặc lens_variant_id không hợp lệ",
      400,
    );
  }
  const [frameVar, lensVar] = await Promise.all([
    ProductVariant.findById(frameVariantId).populate("product_id"),
    ProductVariant.findById(lensVariantId).populate("product_id"),
  ]);
  if (!frameVar || !frameVar.product_id) {
    throw createHttpError("Không tìm thấy biến thể gọng", 404);
  }
  if (!lensVar || !lensVar.product_id) {
    throw createHttpError("Không tìm thấy biến thể tròng", 404);
  }
  if (frameVar.product_id.type !== "frame") {
    throw createHttpError(
      "Biến thể đầu tiên phải thuộc sản phẩm loại gọng (frame)",
      400,
    );
  }
  if (lensVar.product_id.type !== "lens") {
    throw createHttpError(
      "Biến thể thứ hai phải thuộc sản phẩm loại tròng (lens)",
      400,
    );
  }
  return { frameVar, lensVar };
}

async function listCombos(query = {}) {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filters = { is_active: true };
  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { slug: { $regex: query.search, $options: "i" } },
    ];
  }
  const [items, total] = await Promise.all([
    Combo.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "frame_variant_id",
        populate: { path: "product_id", select: "name slug type images" },
      })
      .populate({
        path: "lens_variant_id",
        populate: { path: "product_id", select: "name slug type images" },
      }),
    Combo.countDocuments(filters),
  ]);
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getComboBySlug(slug) {
  if (!slug) throw createHttpError("Thiếu slug combo", 400);
  const combo = await Combo.findOne({ slug, is_active: true })
    .populate({
      path: "frame_variant_id",
      populate: { path: "product_id", select: "name slug type images" },
    })
    .populate({
      path: "lens_variant_id",
      populate: { path: "product_id", select: "name slug type images" },
    });
  if (!combo) throw createHttpError("Không tìm thấy combo", 404);
  return combo;
}

async function getComboById(id, { allowInactive = false } = {}) {
  const q = Combo.findById(id)
    .populate({
      path: "frame_variant_id",
      populate: { path: "product_id", select: "name slug type" },
    })
    .populate({
      path: "lens_variant_id",
      populate: { path: "product_id", select: "name slug type" },
    });
  const combo = await q;
  if (!combo) throw createHttpError("Không tìm thấy combo", 404);
  if (!allowInactive && !combo.is_active) {
    throw createHttpError("Combo không còn hiệu lực", 404);
  }
  return combo;
}

async function createCombo(payload) {
  const {
    name,
    slug,
    description,
    frame_variant_id,
    lens_variant_id,
    combo_price,
    is_active,
  } = payload;
  if (!name) {
    throw createHttpError("Thiếu name", 400);
  }
  if (
    combo_price === undefined ||
    combo_price === null ||
    Number(combo_price) < 0
  ) {
    throw createHttpError("combo_price không hợp lệ", 400);
  }
  await assertFrameLensPair(frame_variant_id, lens_variant_id);
  const existsSlug = await Combo.findOne({ slug });
  if (existsSlug) throw createHttpError("Slug combo đã tồn tại", 409);
  if (!slug) {
    const baseSlug =
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") || "combo";
    let uniqueSlug = baseSlug;
    let counter = 1;
    while (await Combo.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }
    payload.slug = uniqueSlug;
  } else {
    const slugExists = await Combo.findOne({ slug });
    if (slugExists) {
      throw createHttpError("Slug combo đã tồn tại", 409);
    }
  }
  const combo = await Combo.create({
    name,
    slug: payload.slug,
    description,
    frame_variant_id,
    lens_variant_id,
    combo_price: Number(combo_price),
    is_active: is_active !== false,
  });
  return combo;
}

async function updateCombo(id, payload) {
  const combo = await Combo.findById(id);
  if (!combo) throw createHttpError("Không tìm thấy combo", 404);

  const nextFrame = payload.frame_variant_id || combo.frame_variant_id;
  const nextLens = payload.lens_variant_id || combo.lens_variant_id;
  if (payload.frame_variant_id || payload.lens_variant_id) {
    await assertFrameLensPair(nextFrame, nextLens);
  }

  if (payload.slug && payload.slug !== combo.slug) {
    const dup = await Combo.findOne({ slug: payload.slug });
    if (dup) throw createHttpError("Slug combo đã tồn tại", 409);
    combo.slug = payload.slug;
  }
  if (payload.name !== undefined) combo.name = payload.name;
  if (payload.description !== undefined)
    combo.description = payload.description;
  if (payload.frame_variant_id !== undefined) {
    combo.frame_variant_id = payload.frame_variant_id;
  }
  if (payload.lens_variant_id !== undefined) {
    combo.lens_variant_id = payload.lens_variant_id;
  }
  if (payload.combo_price !== undefined) {
    if (Number(payload.combo_price) < 0) {
      throw createHttpError("combo_price không hợp lệ", 400);
    }
    combo.combo_price = Number(payload.combo_price);
  }
  if (payload.is_active !== undefined)
    combo.is_active = Boolean(payload.is_active);
  await combo.save();
  return combo;
}

async function deleteCombo(id) {
  const combo = await Combo.findById(id);
  if (!combo) throw createHttpError("Không tìm thấy combo", 404);
  combo.is_active = false;
  await combo.save();
  return { message: "Đã ẩn combo" };
}

module.exports = {
  listCombos,
  getComboBySlug,
  getComboById,
  createCombo,
  updateCombo,
  deleteCombo,
  assertFrameLensPair,
};
