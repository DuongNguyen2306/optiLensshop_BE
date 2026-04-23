const authService = require("../services/auth.service");

exports.register = async (req, res, next) => {
  try {
    const user = await authService.register(req.body || {});
    return res.status(201).json(user);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body || {});
    return res.status(200).json({
      message: "Đăng nhập thành công",
      ...data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail({
      token: req.query.token,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.resendVerificationEmail = async (req, res, next) => {
  try {
    const result = await authService.resendVerificationEmail(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword({
      token: req.query.token,
      ...(req.body || {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword({
      userId: req.user && req.user._id ? req.user._id : req.user && req.user.id,
      ...(req.body || {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};
