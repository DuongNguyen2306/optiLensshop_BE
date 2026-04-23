const jwt = require("jsonwebtoken");
const User = require("../models/user.schema");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

async function authenticate(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ message: "Thiếu access token" });
    }

    const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
    if (!secret) {
      throw new Error("JWT access token secret is not defined");
    }
    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.sub).select("-password");
    if (!user || user.is_deleted) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.log(error.message);
    return res
      .status(401)
      .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Chưa xác thực" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }

    return next();
  };
}

function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Chưa xác thực" });
  }

  if (!req.user.is_email_verified) {
    return res.status(403).json({ message: "Email chưa được xác thực" });
  }

  return next();
}

module.exports = {
  authenticate,
  authorize,
  requireVerifiedEmail,
};
