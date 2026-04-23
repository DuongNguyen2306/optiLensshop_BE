const Product = require("../models/product.schema");
const ProductVariant = require("../models/productVariant.schema");
const Category = require("../models/category.schema");
const Brand = require("../models/brand.schema");
const Model = require("../models/model.schema");
const mongoose = require("mongoose");
const { createHttpError } = require("../utils/create-http-error");

function normalizeVariantFields(input = {}) {
  const normalized = {
    color: input.color,
    size: input.size,
    bridge_fit: input.bridge_fit,
    diameter: input.diameter,
    base_curve: input.base_curve,
    power: input.power,
  };

  // Backward compatibility: hỗ trợ payload cũ dạng attributes object
  if (input.attributes && typeof input.attributes === "object") {
    normalized.color = normalized.color ?? input.attributes.color;
    normalized.size = normalized.size ?? input.attributes.size;
    normalized.bridge_fit =
      normalized.bridge_fit ?? input.attributes.bridge_fit;
    normalized.diameter = normalized.diameter ?? input.attributes.diameter;
    normalized.base_curve =
      normalized.base_curve ?? input.attributes.base_curve;
    normalized.power = normalized.power ?? input.attributes.power;
  }

  return normalized;
}

async function addVariant(productId, payload, user) {
  if (!productId) throw createHttpError("Thiếu productId", 400);
  const product = await Product.findById(productId);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);

  let { sku, price, stock_quantity, images } = payload;
  if (!price) {
    throw createHttpError("Thiếu giá cho biến thể", 400);
  }
  if (!sku) {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    sku = `VAR-${Date.now()}-${random}`;
  }
  const exists = await ProductVariant.findOne({ sku });
  if (exists) {
    throw createHttpError("SKU biến thể đã tồn tại", 409);
  }
  const normalizedVariant = normalizeVariantFields(payload);
  const variant = await ProductVariant.create({
    product_id: productId,
    sku,
    price,
    stock_quantity: stock_quantity || 0,
    images: images || [],
    ...normalizedVariant,
  });
  return { message: "Thêm biến thể thành công", variant };
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function listProducts(query = {}) {
  const page = toPositiveInt(query.page, 1);
  const limit = toPositiveInt(query.limit, 12);
  if (query.type) {
    if (!["frame", "lens", "accessory"].includes(query.type)) {
      throw createHttpError("type không hợp lệ", 400);
    }
  }
  const skip = (page - 1) * limit;

  const filters = { is_active: true };

  if (query.search) {
    const keyword = String(query.search).trim();
    if (keyword) {
      filters.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { slug: { $regex: keyword, $options: "i" } },
      ];
    }
  }

  if (query.category || query.category_id) {
    filters.category = query.category || query.category_id;
  }

  const [products, total] = await Promise.all([
    Product.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filters),
  ]);

  // Lấy variants cho từng product
  const productIds = products.map((p) => p._id);
  const variantsArr = await ProductVariant.find({
    product_id: { $in: productIds },
  });
  const variantsMap = {};
  variantsArr.forEach((v) => {
    const pid = v.product_id.toString();
    if (!variantsMap[pid]) variantsMap[pid] = [];
    variantsMap[pid].push(v);
  });

  const items = products.map((p) => ({
    ...p.toObject(),
    variants: variantsMap[p._id.toString()] || [],
  }));

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

async function getProductDetailBySlug(slug) {
  if (!slug) {
    throw createHttpError("Thiếu slug sản phẩm", 400);
  }

  const product = await Product.findOne({ slug, is_active: true });
  if (!product) {
    throw createHttpError("Không tìm thấy sản phẩm", 404);
  }

  const variants = await ProductVariant.find({ product_id: product._id }).sort({
    createdAt: -1,
  });

  return { product, variants };
}

/**
 * Danh sách variants của các sản phẩm đang active theo type (frame/lens/...),
 * lọc theo tên/slug sản phẩm hoặc SKU variant.
 */
async function listVariantsByType(query = {}) {
  const { type, search, page: pageRaw, limit: limitRaw } = query;
  if (!type) {
    throw createHttpError("Thiếu tham số type", 400);
  }
  if (!["frame", "lens", "accessory"].includes(type)) {
    throw createHttpError("type không hợp lệ", 400);
  }

  const page = toPositiveInt(pageRaw, 1);
  const limit = toPositiveInt(limitRaw, 12);
  const skip = (page - 1) * limit;

  const keyword = search != null ? String(search).trim() : "";

  let productIdFilter = null;

  if (keyword) {
    const [byNameSlug, variantsMatchingSku] = await Promise.all([
      Product.find({
        is_active: true,
        type,
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { slug: { $regex: keyword, $options: "i" } },
        ],
      })
        .select("_id")
        .lean(),
      ProductVariant.find({
        sku: { $regex: keyword, $options: "i" },
      })
        .select("product_id")
        .lean(),
    ]);

    const idSet = new Set(byNameSlug.map((p) => p._id.toString()));
    const skuProductIds = [
      ...new Set(
        variantsMatchingSku.map((v) => v.product_id && v.product_id.toString()),
      ),
    ].filter(Boolean);

    if (skuProductIds.length > 0) {
      const skuProducts = await Product.find({
        _id: { $in: skuProductIds },
        is_active: true,
        type,
      })
        .select("_id")
        .lean();
      skuProducts.forEach((p) => idSet.add(p._id.toString()));
    }

    const merged = [...idSet];
    if (merged.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          total_pages: 1,
        },
      };
    }
    productIdFilter = merged.map((id) => new mongoose.Types.ObjectId(id));
  }

  const baseProductMatch = { is_active: true, type };
  if (productIdFilter) {
    baseProductMatch._id = { $in: productIdFilter };
  }

  const products = await Product.find(baseProductMatch).select("_id").lean();
  const allProductIds = products.map((p) => p._id);

  if (allProductIds.length === 0) {
    return {
      items: [],
      pagination: {
        page,
        limit,
        total: 0,
        total_pages: 1,
      },
    };
  }

  const variantFilter = { product_id: { $in: allProductIds } };

  const [variants, total] = await Promise.all([
    ProductVariant.find(variantFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "product_id",
        select: "name slug type images is_active",
      })
      .lean(),
    ProductVariant.countDocuments(variantFilter),
  ]);

  const items = variants.map((row) => {
    const populated = row.product_id;
    const product =
      populated && typeof populated === "object" && populated._id != null
        ? {
            _id: populated._id,
            name: populated.name,
            slug: populated.slug,
            type: populated.type,
            images: populated.images,
            is_active: populated.is_active,
          }
        : null;
    return {
      ...row,
      product_id: populated && populated._id ? populated._id : row.product_id,
      product,
    };
  });

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

async function getProductVariants(productId, query = {}) {
  if (!productId) {
    throw createHttpError("Thiếu productId", 400);
  }

  // filter by type + search
  const filters = { product_id: productId };
  if (query.type) {
    if (!["frame", "lens", "accessory"].includes(query.type)) {
      throw createHttpError("type không hợp lệ", 400);
    }
    filters.product_id.type = query.type;
  }
  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { sku: { $regex: query.search, $options: "i" } },
    ];
  }

  const product = await Product.findOne({ _id: productId, is_active: true });
  if (!product) {
    throw createHttpError("Không tìm thấy sản phẩm", 404);
  }

  const variants = await ProductVariant.find(filters).sort({
    createdAt: -1,
  });

  return { product_id: productId, variants };
}

async function createProduct(payload, user) {
  const {
    category,
    name,
    type,
    brand,
    model,
    material,
    images,
    description,
    variants,
  } = payload;
  if (!category || !name || images === undefined) {
    throw createHttpError("Thiếu thông tin bắt buộc", 400);
  }
  if (!Array.isArray(variants) || variants.length === 0) {
    throw createHttpError("Phải nhập ít nhất 1 biến thể cho sản phẩm", 400);
  }
  const slug = buildSlug(name);
  const exists = await Product.findOne({ slug });
  if (exists) {
    throw createHttpError("Slug đã tồn tại", 409);
  }

  const categoryDoc = await Category.findById(category);
  if (!categoryDoc) {
    throw createHttpError("Không tìm thấy danh mục", 404);
  }

  const brandDoc = brand ? await Brand.findById(brand) : null;
  if (brand && !brandDoc) {
    throw createHttpError("Không tìm thấy thương hiệu", 404);
  }

  const modelDoc = model ? await Model.findById(model) : null;
  if (model && !modelDoc) {
    throw createHttpError("Không tìm thấy mẫu mã", 404);
  }

  const product = await Product.create({
    category,
    name,
    slug,
    type: type || "frame",
    brand: brand || null,
    model: model || null,
    material: material || "",
    images: images || [],
    description: description || "",
    is_active: true,
  });

  const createdVariants = await ProductVariant.insertMany(
    variants.map((v, idx) => {
      let sku = v.sku;
      if (!sku) {
        const random = Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase();
        sku = `VAR-${Date.now()}-${idx}-${random}`;
      }
      return {
        product_id: product._id,
        sku,
        price: v.price || 0,
        stock_quantity: v.stock_quantity || 0,
        images: v.images || [],
        ...normalizeVariantFields(v),
      };
    }),
  );
  return {
    message: "Tạo sản phẩm thành công",
    product,
    variants: createdVariants,
  };
}

async function updateProduct(id, payload, user) {
  if (!id) throw createHttpError("Thiếu productId", 400);
  const product = await Product.findById(id);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);

  // Chỉ cập nhật các trường cho phép
  const update = {};
  if (payload.name) update.name = payload.name;
  if (payload.images) update.images = payload.images;
  if (payload.description !== undefined)
    update.description = payload.description;
  if (payload.is_active !== undefined) update.is_active = payload.is_active;
  if (payload.category) update.category = payload.category;
  if (payload.brand) update.brand = payload.brand;
  if (payload.model) update.model = payload.model;
  if (payload.material) update.material = payload.material;

  // Nếu đổi tên, cập nhật slug mới
  if (payload.name) {
    update.slug = buildSlug(payload.name);

    const duplicatedSlug = await Product.findOne({
      slug: update.slug,
      _id: { $ne: id },
    });
    if (duplicatedSlug) {
      throw createHttpError("Slug đã tồn tại", 409);
    }
  }

  const updated = await Product.findByIdAndUpdate(id, update, { new: true });
  return { message: "Cập nhật sản phẩm thành công", product: updated };
}

async function deleteProduct(id, user) {
  if (!id) throw createHttpError("Thiếu productId", 400);
  const product = await Product.findById(id);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);
  // Xóa tất cả biến thể liên quan
  await ProductVariant.deleteMany({ product_id: id });
  // Xóa sản phẩm
  await Product.findByIdAndDelete(id);
  return { message: "Đã xóa sản phẩm và các biến thể liên quan" };
}

async function deleteVariant(productId, variantId, user) {
  if (!productId || !variantId)
    throw createHttpError("Thiếu productId hoặc variantId", 400);
  const product = await Product.findById(productId);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);
  const variant = await ProductVariant.findOne({
    _id: variantId,
    product_id: productId,
  });
  if (!variant) throw createHttpError("Không tìm thấy biến thể", 404);
  await ProductVariant.findByIdAndDelete(variantId);
  return { message: "Đã xóa biến thể thành công" };
}

async function updateVariant(productId, variantId, payload, user) {
  if (!productId || !variantId)
    throw createHttpError("Thiếu productId hoặc variantId", 400);
  const product = await Product.findById(productId);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);
  const variant = await ProductVariant.findOne({
    _id: variantId,
    product_id: productId,
  });
  if (!variant) throw createHttpError("Không tìm thấy biến thể", 404);

  // Chỉ cập nhật các trường cho phép
  const update = {};
  if (payload.sku) update.sku = payload.sku;
  if (payload.price !== undefined) update.price = payload.price;
  if (payload.stock_quantity !== undefined) {
    throw createHttpError(
      "Không cho phép cập nhật stock_quantity trực tiếp. Vui lòng tạo phiếu nhập kho.",
      400,
    );
  }
  if (payload.images) update.images = payload.images;
  Object.assign(update, normalizeVariantFields(payload));

  const updated = await ProductVariant.findByIdAndUpdate(variantId, update, {
    new: true,
  });
  return { message: "Cập nhật biến thể thành công", variant: updated };
}

async function toggleActiveProduct(id, user) {
  if (!id) throw createHttpError("Thiếu productId", 400);
  const product = await Product.findById(id);
  if (!product) throw createHttpError("Không tìm thấy sản phẩm", 404);
  product.is_active = !product.is_active;
  await product.save();
  return { message: `Sản phẩm đã được ${product.is_active ? "hiện" : "ẩn"}` };
}

module.exports = {
  listProducts,
  getProductDetailBySlug,
  listVariantsByType,
  getProductVariants,
  createProduct,
  addVariant,
  updateProduct,
  deleteProduct,
  deleteVariant,
  updateVariant,
  toggleActiveProduct,
};
