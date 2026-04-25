const inboundService = require("../services/inbound.service");

async function createDraft(req, res, next) {
  try {
    const data = await inboundService.createDraft(req.body || {}, req.user);
    return res.status(201).json({ message: "Tạo phiếu nhập (DRAFT) thành công", data });
  } catch (error) {
    return next(error);
  }
}

async function updateDraft(req, res, next) {
  try {
    const data = await inboundService.updateDraft(
      req.params.id,
      req.body || {},
      req.user,
    );
    return res.status(200).json({ message: "Cập nhật phiếu thành công", data });
  } catch (error) {
    return next(error);
  }
}

async function submit(req, res, next) {
  try {
    const data = await inboundService.submit(req.params.id, req.user);
    return res.status(200).json({ message: "Đã gửi duyệt", data });
  } catch (error) {
    return next(error);
  }
}

async function approve(req, res, next) {
  try {
    const data = await inboundService.approve(req.params.id, req.user);
    return res.status(200).json({ message: "Đã duyệt phiếu", data });
  } catch (error) {
    return next(error);
  }
}

async function reject(req, res, next) {
  try {
    const data = await inboundService.reject(
      req.params.id,
      req.body || {},
      req.user,
    );
    return res.status(200).json({ message: "Đã từ chối phiếu", data });
  } catch (error) {
    return next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const data = await inboundService.cancel(
      req.params.id,
      req.body || {},
      req.user,
    );
    return res.status(200).json({ message: "Đã hủy phiếu", data });
  } catch (error) {
    return next(error);
  }
}

async function receive(req, res, next) {
  try {
    const data = await inboundService.receive(req.params.id, req.user);
    return res.status(200).json({ message: "Đã nhận hàng vào kho", data });
  } catch (error) {
    return next(error);
  }
}

async function complete(req, res, next) {
  try {
    const data = await inboundService.complete(req.params.id, req.user);
    return res.status(200).json({ message: "Đã chốt phiếu nhập", data });
  } catch (error) {
    return next(error);
  }
}

async function list(req, res, next) {
  try {
    const data = await inboundService.list(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getDetail(req, res, next) {
  try {
    const data = await inboundService.getDetail(req.params.id);
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
}

async function listLedger(req, res, next) {
  try {
    const data = await inboundService.listLedger(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createDraft,
  updateDraft,
  submit,
  approve,
  reject,
  cancel,
  receive,
  complete,
  list,
  getDetail,
  listLedger,
};
