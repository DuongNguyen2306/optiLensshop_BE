require("dotenv").config();
const mongoose = require("mongoose");
const SystemSetting = require("../models/systemSetting.schema");

const PREORDER_DEPOSIT_RATE_KEY = "preorder_deposit_rate";
const DEFAULT_PREORDER_DEPOSIT_RATE = 0.3;

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("Thieu MONGO_URI trong bien moi truong");
  }

  await mongoose.connect(mongoUri);

  await SystemSetting.findOneAndUpdate(
    { key: PREORDER_DEPOSIT_RATE_KEY },
    {
      $set: {
        value_number: DEFAULT_PREORDER_DEPOSIT_RATE,
        value_string: null,
        description: "Ti le coc mac dinh cho don pre_order (0 -> 1)",
        updated_by: null,
      },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true },
  );

  console.log(
    `Seeded setting ${PREORDER_DEPOSIT_RATE_KEY}=${DEFAULT_PREORDER_DEPOSIT_RATE}`,
  );
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed system settings failed:", error.message);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // no-op
    }
    process.exit(1);
  });
