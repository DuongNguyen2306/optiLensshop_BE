const inventoryService = require("../services/inventory.service");

async function createReceipt(req, res, next) {
  try {
    const data = await inventoryService.createReceipt(req.body, req.user);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function confirmReceipt(req, res, next) {
  try {
    const { id } = req.params;
    const data = await inventoryService.confirmReceipt(id, req.user);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listReceipts(req, res, next) {
  try {
    const data = await inventoryService.listReceipts(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listLedger(req, res, next) {
  try {
    const data = await inventoryService.listLedger(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createReceipt,
  confirmReceipt,
  listReceipts,
  listLedger,
};
