const test = require("node:test");
const assert = require("node:assert/strict");

const opsOrderService = require("../src/services/ops-order.service");
const Order = require("../src/models/order.schema");
const OrderItem = require("../src/models/orderItem.schema");

function makeOrder(overrides = {}) {
  return {
    _id: "69ea00000000000000000001",
    order_type: "pre_order",
    status: "confirmed",
    requires_fabrication: true,
    lens_worksheet: null,
    status_history: [],
    fulfilled_at: null,
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

test("Test 1: non-CONFIRMED order cannot start PROCESSING", async () => {
  const originalFindById = Order.findById;
  Order.findById = async () => makeOrder({ status: "pending" });
  try {
    await assert.rejects(
      () => opsOrderService.startProcessing("69ea00000000000000000011", "ops1"),
      /CONFIRMED/,
    );
  } finally {
    Order.findById = originalFindById;
  }
});

test("Test 2: CANCELLED order blocks all Ops actions", async () => {
  const originalFindById = Order.findById;
  Order.findById = async () => makeOrder({ status: "cancelled" });
  try {
    await assert.rejects(
      () => opsOrderService.startProcessing("69ea00000000000000000012", "ops1"),
      /Đơn đã hủy/,
    );
    await assert.rejects(
      () => opsOrderService.fulfillOrder("69ea00000000000000000012", "ops1"),
      /Đơn đã hủy/,
    );
  } finally {
    Order.findById = originalFindById;
  }
});

test("Test 3: PROCESSING -> next Ops stage and set fulfilled_at", async () => {
  const originalFindById = Order.findById;
  const order = makeOrder({
    status: "processing",
    order_type: "stock",
    requires_fabrication: false,
    lens_worksheet: { is_custom_made: true },
  });
  Order.findById = async () => order;
  try {
    const updated = await opsOrderService.fulfillOrder(
      "69ea00000000000000000013",
      "ops1",
    );
    assert.equal(updated.status, "manufacturing");
    assert.ok(updated.fulfilled_at instanceof Date);
    assert.equal(updated.status_history.at(-1).action, "MANUFACTURING");
  } finally {
    Order.findById = originalFindById;
  }
});

test("Non-fabrication order cannot be processed by Ops", async () => {
  const originalFindById = Order.findById;
  Order.findById = async () =>
    makeOrder({
      order_type: "stock",
      requires_fabrication: false,
      lens_worksheet: null,
    });
  try {
    await assert.rejects(
      () => opsOrderService.startProcessing("69ea00000000000000000015", "ops1"),
      /không thuộc luồng gia công/i,
    );
  } finally {
    Order.findById = originalFindById;
  }
});

test("Pre-order can start PROCESSING without full lens params", async () => {
  const originalFindById = Order.findById;
  const order = makeOrder({ status: "confirmed", order_type: "pre_order" });
  Order.findById = async () => order;

  try {
    const updated = await opsOrderService.startProcessing(
      "69ea00000000000000000014",
      "ops1",
    );
    assert.equal(updated.status, "processing");
  } finally {
    Order.findById = originalFindById;
  }
});

