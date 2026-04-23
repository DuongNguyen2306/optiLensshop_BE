const productService = require("../services/product.service");
async function addVariant(req, res, next) {
  try {
    const { id } = req.params;
    const data = await productService.addVariant(id, req.body, req.user);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listProducts(req, res, next) {
  try {
    const data = await productService.listProducts(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getProductDetailBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const data = await productService.getProductDetailBySlug(slug);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listVariantsByType(req, res, next) {
  try {
    const data = await productService.listVariantsByType(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getProductVariants(req, res, next) {
  try {
    const { id } = req.params;
    const data = await productService.getProductVariants(id);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    let body = req.body;

    if (typeof body.variants === "string") {
      try {
        body.variants = JSON.parse(body.variants);
      } catch {}
    }
    if (typeof body.images === "string") {
      try {
        body.images = JSON.parse(body.images);
      } catch {}
    }
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const cloudinary = require("../services/cloudinary.service");
      body.images = body.images || [];
      for (const f of req.files) {
        // Đọc buffer từ file (multer lưu ở disk hoặc memory)
        let buffer = f.buffer;
        if (!buffer && f.path) {
          buffer = require("fs").readFileSync(f.path);
        }
        const result = await cloudinary.uploadBufferToCloudinary(buffer, {
          folder: "optilens/products",
          resource_type: "image",
        });
        body.images.push(result.secure_url);
      }
    }

    const data = await productService.createProduct(body, req.user);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    let body = req.body;
    if (typeof body.images === "string") {
      try {
        body.images = JSON.parse(body.images);
      } catch {}
    }
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const cloudinary = require("../services/cloudinary.service");
      body.images = body.images || [];
      for (const f of req.files) {
        let buffer = f.buffer;
        if (!buffer && f.path) {
          buffer = require("fs").readFileSync(f.path);
        }
        const result = await cloudinary.uploadBufferToCloudinary(buffer, {
          folder: "optilens/products",
          resource_type: "image",
        });
        body.images.push(result.secure_url);
      }
    }
    const data = await productService.updateProduct(id, body, req.user);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    const data = await productService.deleteProduct(id, req.user);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function deleteVariant(req, res, next) {
  try {
    const { productId, variantId } = req.params;
    const data = await productService.deleteVariant(
      productId,
      variantId,
      req.user,
    );
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function updateVariant(req, res, next) {
  try {
    const { productId, variantId } = req.params;
    const data = await productService.updateVariant(
      productId,
      variantId,
      req.body,
      req.user,
    );
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function toggleActiveProduct(req, res, next) {
  try {
    const { id } = req.params;
    const data = await productService.toggleActiveProduct(id, req.user);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
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
