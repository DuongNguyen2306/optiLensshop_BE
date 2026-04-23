const brandService = require("../services/brand.service");

async function listBrands(req, res, next) {
  try {
    const data = await brandService.listBrands();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function createBrand(req, res, next) {
  try {
    if (req.file) {
      req.body.logo = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }
    const data = await brandService.createBrand(req.body);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function updateBrand(req, res, next) {
  try {
    const { id } = req.params;
    const data = await brandService.updateBrand(id, req.body);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function deleteBrand(req, res, next) {
  try {
    const { id } = req.params;
    const data = await brandService.deleteBrand(id);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
};
