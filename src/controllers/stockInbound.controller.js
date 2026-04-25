const stockInboundService = require("../services/stockInbound.service");

async function autoGenerateInbound(req, res, next) {
  try {
    const { orderIds } = req.body || {};
    const data = await stockInboundService.autoGenerateInbound(orderIds, req.user?._id);
    return res.status(201).json({ message: "Tạo phiếu nhập tạm thành công", data });
  } catch (error) {
    return next(error);
  }
}

async function completeInbound(req, res, next) {
  try {
    const data = await stockInboundService.completeInbound(req.params.id, req.user?._id);
    return res.status(200).json({ message: "Hoàn tất phiếu nhập thành công", data });
  } catch (error) {
    return next(error);
  }
}

async function listInbound(req, res, next) {
  try {
    const data = await stockInboundService.listInbound(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getInboundDetail(req, res, next) {
  try {
    const data = await stockInboundService.getInboundDetail(req.params.id);
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  autoGenerateInbound,
  completeInbound,
  listInbound,
  getInboundDetail,
};
