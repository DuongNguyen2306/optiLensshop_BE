const comboService = require("../services/combo.service");

function sendError(res, err) {
  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message });
}

async function listCombos(req, res) {
  try {
    const data = await comboService.listCombos(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getComboBySlug(req, res) {
  try {
    const data = await comboService.getComboBySlug(req.params.slug);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function createCombo(req, res) {
  try {
    const data = await comboService.createCombo(req.body);
    return res.status(201).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateCombo(req, res) {
  try {
    const data = await comboService.updateCombo(req.params.id, req.body);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function deleteCombo(req, res) {
  try {
    const data = await comboService.deleteCombo(req.params.id);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  listCombos,
  getComboBySlug,
  createCombo,
  updateCombo,
  deleteCombo,
};
