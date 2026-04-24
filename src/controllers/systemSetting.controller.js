const systemSettingService = require("../services/systemSetting.service");

exports.getPreorderDepositRate = async (req, res) => {
  try {
    const config = await systemSettingService.getPreorderDepositRateConfig();
    res.status(200).json({ setting: config });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updatePreorderDepositRate = async (req, res) => {
  try {
    const rate = Number(req.body?.value_number);
    if (!Number.isFinite(rate)) {
      return res
        .status(400)
        .json({ message: "value_number phai la so trong khoang 0 -> 1" });
    }
    if (rate < 0 || rate > 1) {
      return res
        .status(400)
        .json({ message: "value_number phai nam trong khoang 0 -> 1" });
    }

    const setting = await systemSettingService.updatePreorderDepositRate(
      rate,
      req.user?.id,
    );
    return res
      .status(200)
      .json({ message: "Cap nhat ti le coc preorder thanh cong", setting });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
