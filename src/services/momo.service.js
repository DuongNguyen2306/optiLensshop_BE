exports.verifyMomoReturn = (query) => {
  if (!query) {
    throw new Error("Missing momo query parameters");
  }

  const {
    partnerCode,
    orderId,
    requestId,
    amount,
    orderInfo,
    orderType,
    transId,
    resultCode,
    message,
    payType,
    responseTime,
    extraData,
    signature,
  } = query;

  const secretKey = process.env.MOMO_SECRET_KEY;

  const rawSignature =
    "accessKey=" +
    process.env.MOMO_ACCESS_KEY +
    "&amount=" +
    amount +
    "&extraData=" +
    extraData +
    "&message=" +
    message +
    "&orderId=" +
    orderId +
    "&orderInfo=" +
    orderInfo +
    "&orderType=" +
    orderType +
    "&partnerCode=" +
    partnerCode +
    "&payType=" +
    payType +
    "&requestId=" +
    requestId +
    "&responseTime=" +
    responseTime +
    "&resultCode=" +
    resultCode +
    "&transId=" +
    transId;

  const signCheck = require("crypto")
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const isSignatureValid = signCheck === signature;
  const isSuccess = isSignatureValid && resultCode === "0";

  return {
    isSuccess,
    message: isSuccess
      ? "Payment successful"
      : isSignatureValid
        ? "Payment failed"
        : "Invalid signature",
  };
};
const crypto = require("crypto");
const https = require("https");

exports.createMomoPayment = async ({
  amount,
  orderId,
  orderInfo,
  redirectUrl,
  ipnUrl,
}) => {
  const accessKey = process.env.MOMO_ACCESS_KEY;
  const secretKey = process.env.MOMO_SECRET_KEY;
  const partnerCode = process.env.MOMO_PARTNER_CODE;
  const requestType = "payWithMethod";
  const requestId = orderId;
  const extraData = "";
  const orderGroupId = "";
  const autoCapture = true;
  const lang = "vi";

  // Build raw signature
  const rawSignature =
    `accessKey=${accessKey}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${partnerCode}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=${requestType}`;

  // Create signature
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  // Build request body
  const requestBody = JSON.stringify({
    partnerCode,
    partnerName: "OptiLens Shop",
    storeId: "OptiLensStore",
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    lang,
    requestType,
    autoCapture,
    extraData,
    orderGroupId,
    signature,
  });

  // Send request to MoMo
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "test-payment.momo.vn",
      port: 443,
      path: "/v2/gateway/api/create",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
};
