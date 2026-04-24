const SystemSetting = require("../models/systemSetting.schema");

const PREORDER_DEPOSIT_RATE_KEY = "preorder_deposit_rate";
const DEFAULT_PREORDER_DEPOSIT_RATE = 0.3;

function clampRate(rate) {
  return Math.min(1, Math.max(0, Number(rate) || 0));
}

async function getPreorderDepositRate() {
  const setting = await SystemSetting.findOne({ key: PREORDER_DEPOSIT_RATE_KEY })
    .select("value_number")
    .lean();

  if (setting && Number.isFinite(setting.value_number)) {
    return clampRate(setting.value_number);
  }

  throw new Error(
    "Chua cau hinh preorder_deposit_rate. Vui long chay seed he thong truoc.",
  );
}

async function getPreorderDepositRateConfig() {
  const setting = await SystemSetting.findOne({ key: PREORDER_DEPOSIT_RATE_KEY })
    .select("key value_number description updated_at updated_by")
    .populate("updated_by", "email role")
    .lean();

  if (!setting) {
    return {
      key: PREORDER_DEPOSIT_RATE_KEY,
      value_number: DEFAULT_PREORDER_DEPOSIT_RATE,
      source: "missing_seed",
      description: "Ti le coc mac dinh cho don pre_order (0 -> 1)",
      updated_by: null,
      updated_at: null,
    };
  }

  return {
    ...setting,
    value_number: clampRate(setting.value_number),
    source: "db",
  };
}

async function updatePreorderDepositRate(value, actorId) {
  const nextRate = clampRate(value);

  const setting = await SystemSetting.findOneAndUpdate(
    { key: PREORDER_DEPOSIT_RATE_KEY },
    {
      $set: {
        value_number: nextRate,
        value_string: null,
        description: "Ti le coc mac dinh cho don pre_order (0 -> 1)",
        updated_by: actorId || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .populate("updated_by", "email role")
    .lean();

  return {
    ...setting,
    value_number: clampRate(setting.value_number),
    source: "db",
  };
}

module.exports = {
  getPreorderDepositRate,
  getPreorderDepositRateConfig,
  updatePreorderDepositRate,
  PREORDER_DEPOSIT_RATE_KEY,
};
