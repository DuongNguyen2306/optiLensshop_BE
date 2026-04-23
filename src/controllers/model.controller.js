const modelService = require("../services/model.service");

async function listModels(req, res, next) {
  try {
    const data = await modelService.listModels();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function createModel(req, res, next) {
  try {
    const data = await modelService.createModel(req.body);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function updateModel(req, res, next) {
  try {
    const { id } = req.params;
    const data = await modelService.updateModel(id, req.body);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function deleteModel(req, res, next) {
  try {
    const { id } = req.params;
    const data = await modelService.deleteModel(id);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listModels,
  createModel,
  updateModel,
  deleteModel,
};
