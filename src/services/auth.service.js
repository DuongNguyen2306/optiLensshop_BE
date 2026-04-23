const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/user.schema");
const mailService = require("./mail.service");
const mongoose = require("mongoose");
const { createHttpError } = require("../utils/create-http-error");
const { getVerificationEmailTemplate } = require("../templates/verification");
const getForgotPasswordEmailTemplate = require("../templates/forgot-password");

async function register({ email, password, confirm_password }) {
  if (!password || !email || !confirm_password) {
    throw createHttpError(
      "Email, password và confirm password là bắt buộc",
      400,
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (password.length < 5 || password.length > 64) {
    throw createHttpError(`Password phải từ 5 đến 64 ký tự`, 400);
  }
  if (password !== confirm_password) {
    throw createHttpError("Password và confirm password không khớp", 400);
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw createHttpError("Email đã tồn tại", 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: normalizedEmail,
    password: hashedPassword,
    status: "active",
    is_email_verified: false,
  });
  const emailVerificationToken = crypto.randomBytes(32).toString("hex");
  user.email_verification_token = emailVerificationToken;
  user.email_verification_expires = new Date(Date.now() + 30 * 60 * 1000); // 30 phút
  await user.save();

  try {
    await mailService.sendMail({
      to: user.email,
      subject: "Xác thực email — OptiLens Shop",
      html: getVerificationEmailTemplate(
        `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/verify-email?token=${emailVerificationToken}`,
      ),
    });
  } catch (mailErr) {
    console.log(mailErr);
    throw createHttpError(
      "Lỗi gửi email xác thực, đăng ký không thành công",
      500,
    );
  }

  return {
    message:
      "Đăng ký thành công, vui lòng kiểm tra email để xác thực tài khoản",
    email: user.email,
  };
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!password || !email) {
    throw createHttpError("Email và password là bắt buộc", 400);
  }

  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw createHttpError("Email hoặc password không đúng", 401);
  }

  if (!user.is_email_verified) {
    throw createHttpError("Vui lòng xác thực email trước khi đăng nhập", 401);
  }

  const isMatched = await bcrypt.compare(password, user.password);
  if (!isMatched) {
    throw createHttpError("Email hoặc password không đúng", 401);
  }

  const accessToken = jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    },
    process.env.JWT_ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION },
  );
  const refreshToken = jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    },
    process.env.JWT_REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION },
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
    },
  };
}

async function verifyEmail({ token }) {
  if (!token) {
    throw createHttpError("Thiếu token xác thực email", 400);
  }

  const user = await User.findOne({ email_verification_token: token });
  if (!user) {
    throw createHttpError("Token xác thực không hợp lệ", 400);
  }

  if (
    !user.email_verification_expires ||
    user.email_verification_expires < new Date()
  ) {
    throw createHttpError("Token xác thực đã hết hạn", 400);
  }

  user.is_email_verified = true;
  user.email_verification_token = null;
  user.email_verification_expires = null;
  await user.save();

  return { message: "Xác thực email thành công" };
}

async function resendVerificationEmail({ email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw createHttpError("Không tìm thấy người dùng", 404);
  }

  if (user.is_email_verified) {
    throw createHttpError("Email đã được xác thực trước đó", 400);
  }

  const emailVerificationToken = crypto.randomBytes(32).toString("hex");
  user.email_verification_token = emailVerificationToken;
  user.email_verification_expires = new Date(Date.now() + 30 * 60 * 1000); // 30 phút
  await user.save();

  try {
    await mailService.sendMail({
      to: user.email,
      subject: "Xác thực email — OptiLens Shop",
      html: getVerificationEmailTemplate(
        `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/verify-email?token=${user.email_verification_token}`,
      ),
    });
  } catch (error) {
    console.log(error);
    throw createHttpError("Lỗi gửi email xác thực, vui lòng thử lại", 500);
  }
  return { message: "Đã gửi lại email xác thực" };
}

async function forgotPassword({ email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return {
      message:
        "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi",
    };
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 phút

  user.reset_password_token = resetToken;
  user.reset_password_expires = resetExpires;
  await user.save();

  const resetLink = `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/reset-password?token=${resetToken}`;
  await mailService.sendMail({
    to: user.email,
    subject: "Hướng dẫn đặt lại mật khẩu — OptiLens Shop",
    html: getForgotPasswordEmailTemplate(resetLink),
  });

  return {
    message:
      "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi",
  };
}

async function resetPassword({ token, password, confirm_password }) {
  if (!token) {
    throw createHttpError("Thiếu token đặt lại mật khẩu", 400);
  }

  // Validate password inline
  if (!password || typeof password !== "string") {
    throw createHttpError("Password là bắt buộc", 400);
  }
  if (password.length < 5 || password.length > 64) {
    throw createHttpError(`Password phải từ 5 đến 64 ký tự`, 400);
  }
  if (password !== confirm_password) {
    throw createHttpError("Password và confirm password không khớp", 400);
  }

  const user = await User.findOne({ reset_password_token: token });
  if (!user) {
    throw createHttpError("Token đặt lại mật khẩu không hợp lệ", 400);
  }

  if (
    !user.reset_password_expires ||
    user.reset_password_expires < new Date()
  ) {
    throw createHttpError("Token đặt lại mật khẩu đã hết hạn", 400);
  }

  user.password = await bcrypt.hash(password, 10);
  user.reset_password_token = null;
  user.reset_password_expires = null;
  await user.save();

  return { message: "Đặt lại mật khẩu thành công" };
}

async function changePassword({
  userId,
  current_password,
  new_password,
  confirm_new_password,
}) {
  if (!userId) {
    throw createHttpError("Thiếu thông tin người dùng", 401);
  }

  if (!current_password) {
    throw createHttpError("Mật khẩu hiện tại là bắt buộc", 400);
  }

  // Validate password inline
  if (!new_password || typeof new_password !== "string") {
    throw createHttpError("Password là bắt buộc", 400);
  }
  if (new_password.length < 5 || new_password.length > 64) {
    throw createHttpError(`Password phải từ 5 đến 64 ký tự`, 400);
  }
  if (new_password !== confirm_new_password) {
    throw createHttpError("Password và confirm password không khớp", 400);
  }

  const validNewPassword = new_password;

  const user = await User.findById(userId);
  if (!user) {
    throw createHttpError("Không tìm thấy người dùng", 404);
  }

  const isMatched = await bcrypt.compare(
    String(current_password),
    user.password,
  );
  if (!isMatched) {
    throw createHttpError("Mật khẩu hiện tại không đúng", 400);
  }

  const isSameAsOld = await bcrypt.compare(validNewPassword, user.password);
  if (isSameAsOld) {
    throw createHttpError("Mật khẩu mới không được trùng mật khẩu cũ", 400);
  }

  user.password = await bcrypt.hash(validNewPassword, 10);
  await user.save();

  return { message: "Đổi mật khẩu thành công" };
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
};
