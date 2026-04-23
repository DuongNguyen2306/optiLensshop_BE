const User = require("../models/user.schema");
const { uploadAvatar } = require("./cloudinary.service");
const {
  sendStaffCreatedEmail,
  sendStaffDeletedEmail,
} = require("./mail.service");
const { createHttpError } = require("../utils/create-http-error");
const { addressToString } = require("../utils/address");
const mongoose = require("mongoose");
const ALLOWED_STAFF_ROLES = ["sales", "operations"];
const ALLOWED_MANAGER_ROLE = "manager";

function ensureValidObjectId(id, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(`${fieldName} không hợp lệ`, 400);
  }
}

function sanitizeUser(user) {
  const profile = user.profile || {};
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    is_email_verified: user.is_email_verified,
    profile: {
      full_name: profile.full_name || "",
      dob: profile.dob || null,
      gender: profile.gender || null,
      phone: profile.phone || "",
      avatar: profile.avatar || "",
      addresses: Array.isArray(profile.addresses) ? profile.addresses : [],
    },
    created_at: user.created_at,
  };
}

async function getMyProfile(userId) {
  if (!userId) throw createHttpError("Thiếu thông tin người dùng", 401);
  const user = await User.findById(userId).select("-password");
  if (!user || user.is_deleted)
    throw createHttpError("Không tìm thấy người dùng", 404);
  return sanitizeUser(user);
}

async function updateMyProfile(userId, payload = {}) {
  if (!userId) throw createHttpError("Thiếu thông tin người dùng", 401);

  const profileUpdates = {};
  const allowedProfileFields = ["full_name", "dob", "gender", "phone"];

  allowedProfileFields.forEach((field) => {
    if (payload[field] !== undefined) {
      profileUpdates[`profile.${field}`] = payload[field];
    }
  });

  if (payload.dob !== undefined && payload.dob !== null) {
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(String(payload.dob))) {
      throw createHttpError("Ngày sinh phải đúng định dạng YYYY-MM-DD", 400);
    }
    const date = new Date(payload.dob);
    const isValidDate =
      !isNaN(date.getTime()) &&
      String(payload.dob) === date.toISOString().slice(0, 10);
    if (!isValidDate)
      throw createHttpError("Ngày sinh không phải ngày hợp lệ", 400);
  }

  if (payload.gender !== undefined && payload.gender !== null) {
    if (!["male", "female", "other"].includes(payload.gender)) {
      throw createHttpError("gender không hợp lệ", 400);
    }
  }

  if (payload.phone !== undefined) {
    const normalizedPhone = String(payload.phone || "").trim();
    if (!normalizedPhone)
      throw createHttpError("Số điện thoại là bắt buộc", 400);
    profileUpdates["profile.phone"] = normalizedPhone;
  }

  if (payload.avatar_file && payload.avatar_file.buffer) {
    const uploadedAvatar = await uploadAvatar(
      payload.avatar_file.buffer,
      userId,
    );
    profileUpdates["profile.avatar"] = uploadedAvatar.url;
  }

  if (!Object.keys(profileUpdates).length) {
    throw createHttpError("Không có dữ liệu profile hợp lệ để cập nhật", 400);
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, is_deleted: false },
    { $set: profileUpdates },
    { new: true },
  ).select("-password");

  if (!user) throw createHttpError("Không tìm thấy người dùng", 404);
  return sanitizeUser(user);
}

async function getMyAddresses(userId) {
  if (!userId) throw createHttpError("Thiếu thông tin người dùng", 401);
  const user = await User.findOne({ _id: userId, is_deleted: false }).select(
    "profile.addresses",
  );
  if (!user) throw createHttpError("Không tìm thấy người dùng", 404);
  return Array.isArray(user.profile?.addresses) ? user.profile.addresses : [];
}

async function addMyAddress(userId, payload = {}) {
  if (!userId) throw createHttpError("Thiếu thông tin người dùng", 401);
  const rawAddress =
    typeof payload.address === "object" && payload.address !== null
      ? addressToString(payload.address)
      : payload.address;
  const address = String(rawAddress || "").trim();
  if (!address) throw createHttpError("Thiếu thông tin địa chỉ", 400);

  const user = await User.findOne({ _id: userId, is_deleted: false });
  if (!user) throw createHttpError("Không tìm thấy người dùng", 404);

  if (!user.profile) user.profile = {};
  if (!Array.isArray(user.profile.addresses)) user.profile.addresses = [];
  user.profile.addresses.push(address);
  await user.save();
  return user.profile.addresses;
}

async function listStaff() {
  const users = await User.find({
    role: { $in: ALLOWED_STAFF_ROLES },
    is_deleted: false,
  })
    .select("-password")
    .sort({ created_at: -1 });
  return users.map(sanitizeUser);
}

async function createStaff({
  email,
  password,
  role,
  status = "active",
  phone,
}) {
  if (!email || !password)
    throw createHttpError("Email và password là bắt buộc", 400);
  if (!ALLOWED_STAFF_ROLES.includes(role))
    throw createHttpError("Role staff không hợp lệ", 400);

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone)
    throw createHttpError("Phone là bắt buộc theo schema", 400);

  const exists = await User.findOne({
    email: normalizedEmail,
    is_deleted: false,
  });
  if (exists) throw createHttpError("Email đã tồn tại", 409);

  const bcrypt = require("bcrypt");
  const hashedPassword = await bcrypt.hash(String(password), 10);

  const user = await User.create({
    email: normalizedEmail,
    password: hashedPassword,
    role,
    status,
    is_email_verified: false,
    profile: {
      phone: normalizedPhone,
      full_name: String(email).split("@")[0],
      addresses: [],
    },
  });

  await sendStaffCreatedEmail({
    to: normalizedEmail,
    role,
    tempPassword: String(password),
  });

  return sanitizeUser(user);
}

async function updateStaff(staffId, payload = {}) {
  ensureValidObjectId(staffId, "staffId");
  const staff = await User.findOne({ _id: staffId, is_deleted: false });
  if (!staff) throw createHttpError("Không tìm thấy staff", 404);
  if (!ALLOWED_STAFF_ROLES.includes(staff.role)) {
    throw createHttpError("Người dùng này không thuộc nhóm staff", 400);
  }

  const updates = {};
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.role !== undefined) {
    if (!ALLOWED_STAFF_ROLES.includes(payload.role)) {
      throw createHttpError("Role staff không hợp lệ", 400);
    }
    updates.role = payload.role;
  }
  if (payload.phone !== undefined) {
    const normalizedPhone = String(payload.phone || "").trim();
    if (!normalizedPhone) throw createHttpError("Phone không hợp lệ", 400);
    updates["profile.phone"] = normalizedPhone;
  }

  if (!Object.keys(updates).length) {
    throw createHttpError("Không có dữ liệu hợp lệ để cập nhật", 400);
  }

  const updated = await User.findOneAndUpdate(
    { _id: staffId, is_deleted: false },
    { $set: updates },
    { new: true },
  ).select("-password");

  return sanitizeUser(updated);
}

async function deleteStaff(staffId) {
  ensureValidObjectId(staffId, "staffId");
  const staff = await User.findOne({ _id: staffId, is_deleted: false });
  if (!staff) throw createHttpError("Không tìm thấy staff", 404);
  if (!ALLOWED_STAFF_ROLES.includes(staff.role)) {
    throw createHttpError("Người dùng này không thuộc nhóm staff", 400);
  }

  staff.is_deleted = true;
  staff.deleted_at = new Date();
  await staff.save();
  await sendStaffDeletedEmail({ to: staff.email, role: staff.role });
  return { message: "Xóa mềm staff thành công" };
}

async function listManagers() {
  const managers = await User.find({
    role: ALLOWED_MANAGER_ROLE,
    is_deleted: false,
  })
    .select("-password")
    .sort({ created_at: -1 });
  return managers.map(sanitizeUser);
}

async function createManager({ email, password, status = "active", phone }) {
  if (!email || !password)
    throw createHttpError("Email và password là bắt buộc", 400);
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone)
    throw createHttpError("Phone là bắt buộc theo schema", 400);

  const exists = await User.findOne({
    email: normalizedEmail,
    is_deleted: false,
  });
  if (exists) throw createHttpError("Email đã tồn tại", 409);

  const bcrypt = require("bcrypt");
  const hashedPassword = await bcrypt.hash(String(password), 10);

  const user = await User.create({
    email: normalizedEmail,
    password: hashedPassword,
    role: ALLOWED_MANAGER_ROLE,
    status,
    is_email_verified: false,
    profile: {
      phone: normalizedPhone,
      full_name: String(email).split("@")[0],
      addresses: [],
    },
  });

  await sendStaffCreatedEmail({
    to: normalizedEmail,
    role: ALLOWED_MANAGER_ROLE,
    tempPassword: String(password),
  });

  return sanitizeUser(user);
}

async function updateManager(managerId, payload = {}) {
  ensureValidObjectId(managerId, "managerId");
  const manager = await User.findOne({ _id: managerId, is_deleted: false });
  if (!manager) throw createHttpError("Không tìm thấy manager", 404);
  if (manager.role !== ALLOWED_MANAGER_ROLE) {
    throw createHttpError("Người dùng này không phải manager", 400);
  }

  const updates = {};
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.phone !== undefined) {
    const normalizedPhone = String(payload.phone || "").trim();
    if (!normalizedPhone) throw createHttpError("Phone không hợp lệ", 400);
    updates["profile.phone"] = normalizedPhone;
  }
  if (!Object.keys(updates).length) {
    throw createHttpError("Không có dữ liệu hợp lệ để cập nhật", 400);
  }

  const updated = await User.findOneAndUpdate(
    { _id: managerId, is_deleted: false },
    { $set: updates },
    { new: true },
  ).select("-password");

  return sanitizeUser(updated);
}

async function deleteManager(managerId) {
  ensureValidObjectId(managerId, "managerId");
  const manager = await User.findOne({ _id: managerId, is_deleted: false });
  if (!manager) throw createHttpError("Không tìm thấy manager", 404);
  if (manager.role !== ALLOWED_MANAGER_ROLE) {
    throw createHttpError("Người dùng này không phải manager", 400);
  }

  manager.is_deleted = true;
  manager.deleted_at = new Date();
  await manager.save();
  await sendStaffDeletedEmail({ to: manager.email, role: manager.role });
  return { message: "Xóa mềm manager thành công" };
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  getMyAddresses,
  addMyAddress,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  listManagers,
  createManager,
  updateManager,
  deleteManager,
};
