const userService = require("../services/user.service");

function getUserIdFromReq(req) {
  if (!req.user) return null;
  return req.user._id || req.user.id || null;
}

exports.getMyProfile = async (req, res, next) => {
  try {
    const result = await userService.getMyProfile(getUserIdFromReq(req));
    return res.status(200).json({ user: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.updateMyProfile = async (req, res, next) => {
  try {
    const payload = { ...(req.body || {}) };

    if (req.file) {
      payload.avatar_file = {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      };
    }

    const result = await userService.updateMyProfile(
      getUserIdFromReq(req),
      payload,
    );
    return res.status(200).json({
      message: "Cập nhật profile thành công",
      user: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.getMyAddresses = async (req, res, next) => {
  try {
    const result = await userService.getMyAddresses(getUserIdFromReq(req));
    return res.status(200).json({ items: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.addMyAddress = async (req, res, next) => {
  try {
    const result = await userService.addMyAddress(
      getUserIdFromReq(req),
      req.body || {},
    );
    return res.status(201).json({
      message: "Thêm địa chỉ thành công",
      items: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.listStaff = async (req, res, next) => {
  try {
    const result = await userService.listStaff();
    return res.status(200).json({ items: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.createStaff = async (req, res, next) => {
  try {
    const result = await userService.createStaff(req.body || {});
    return res.status(201).json({
      message: "Tạo staff thành công",
      user: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.updateStaff = async (req, res, next) => {
  try {
    const result = await userService.updateStaff(req.params.id, req.body || {});
    return res.status(200).json({
      message: "Cập nhật staff thành công",
      user: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.deleteStaff = async (req, res, next) => {
  try {
    const result = await userService.deleteStaff(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.listManagers = async (req, res, next) => {
  try {
    const result = await userService.listManagers();
    return res.status(200).json({ items: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.createManager = async (req, res, next) => {
  try {
    const result = await userService.createManager(req.body || {});
    return res.status(201).json({
      message: "Tạo manager thành công",
      user: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.updateManager = async (req, res, next) => {
  try {
    const result = await userService.updateManager(
      req.params.id,
      req.body || {},
    );
    return res.status(200).json({
      message: "Cập nhật manager thành công",
      user: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.deleteManager = async (req, res, next) => {
  try {
    const result = await userService.deleteManager(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};
