function getOpenApiSpec() {
  const port = process.env.PORT || 3000;
  const defaultServer =
    process.env.SWAGGER_SERVER_URL || `http://localhost:${port}`;

  const objectIdParam = (name, description = "Mongo ObjectId") => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
    description,
  });

  const orderStatusEnum = [
    "pending",
    "confirmed",
    "processing",
    "manufacturing",
    "received",
    "packed",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "return_requested",
    "returned",
    "refunded",
  ];

  const paymentStatusEnum = [
    "pending",
    "pending-payment",
    "deposit-paid",
    "remaining-due",
    "paid",
    "failed",
    "refunded",
  ];

  /** Query filter dùng chung cho GET /orders (customer) và GET /orders/all (shop). */
  const orderListFilterQueryParams = (options = {}) => {
    const { shopNotes } = options;
    return [
      {
        name: "status",
        in: "query",
        required: false,
        schema: { type: "string", enum: orderStatusEnum },
        description:
          "Lọc đơn theo trạng thái đơn (`Order.status`). Không gửi = lấy mọi trạng thái.",
      },
      {
        name: "page",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, default: 1 },
        description: "Trang (phân trang), mặc định 1.",
      },
      {
        name: "pageSize",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, default: 10 },
        description: "Số đơn mỗi trang, mặc định 10.",
      },
      {
        name: "payment_method",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["cod", "momo", "vnpay"] },
        description:
          "Lọc theo phương thức thanh toán (`Payment.method`) trên các đơn trong trang hiện tại." +
          (shopNotes
            ? " Với shop: nếu kèm `payment_method` hoặc `payment_status`, chỉ giữ đơn có bản ghi thanh toán khớp."
            : ""),
      },
      {
        name: "payment_status",
        in: "query",
        required: false,
        schema: { type: "string", enum: paymentStatusEnum },
        description:
          "Lọc theo trạng thái thanh toán (`Payment.status`)." +
          (shopNotes
            ? " Với shop: chỉ giữ đơn (trong trang) có payment khớp khi dùng cùng `payment_method` / `payment_status`."
            : " Customer: map payment bỏ qua bản ghi `pending-payment` khi gắn `payment` vào từng đơn."),
      },
      {
        name: "order_type",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["stock", "pre_order", "prescription"] },
        description: "Lọc theo loại đơn hàng (`Order.order_type`).",
      },
    ];
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "OptiLens Shop API",
      version: "1.2.0",
      description:
        "Tài liệu OpenAPI đồng bộ với routes hiện tại của backend OptiLens Shop.",
    },
    servers: [{ url: defaultServer, description: "API server" }],
    tags: [
      { name: "Auth" },
      { name: "Users" },
      { name: "Management" },
      { name: "Statistics" },
      { name: "Products" },
      { name: "Categories" },
      { name: "Brands" },
      { name: "Models" },
      { name: "Combos" },
      { name: "Cart" },
      { name: "Orders" },
      { name: "Payments" },
      { name: "MoMo" },
      { name: "VNPay" },
      {
        name: "Inbound",
        description:
          "Quản lý phiếu nhập kho (DRAFT → PENDING_APPROVAL → APPROVED → RECEIVED → COMPLETED) và sổ kho (InventoryLedger).",
      },
      {
        name: "Finance",
        description:
          "Thu chi & báo cáo doanh thu (manager, admin). Chi phí nhập tay; doanh thu lấy từ Order/Payment/ReturnRequest.",
      },
      { name: "Ops Orders", description: "Luồng Ops: gia công, đóng gói, giao hàng" },
      { name: "Returns – Customer", description: "Khách hàng gửi & tra cứu yêu cầu trả hàng" },
      { name: "Returns – Admin", description: "Admin/Ops xử lý yêu cầu trả hàng (nhận, hoàn tất, từ chối)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        MessageResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            error: { type: "string" },
          },
        },
        RegisterBody: {
          type: "object",
          required: ["email", "password", "confirm_password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
            confirm_password: { type: "string" },
          },
        },
        LoginBody: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        StaffBody: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
            role: { type: "string", enum: ["sales", "operations"] },
            status: {
              type: "string",
              enum: ["active", "inactive", "banned", "pending"],
            },
          },
        },
        ManagerBody: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
            status: {
              type: "string",
              enum: ["active", "inactive", "banned", "pending"],
            },
          },
        },
        PreorderDepositRateBody: {
          type: "object",
          required: ["value_number"],
          properties: {
            value_number: {
              type: "number",
              minimum: 0,
              maximum: 1,
              example: 0.3,
            },
          },
        },
        PreorderDepositRateSetting: {
          type: "object",
          properties: {
            key: { type: "string", example: "preorder_deposit_rate" },
            value_number: { type: "number", minimum: 0, maximum: 1 },
            source: { type: "string", enum: ["db", "missing_seed"] },
            description: { type: "string" },
            updated_at: { type: "string", format: "date-time", nullable: true },
            updated_by: {
              nullable: true,
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { type: "string" },
                  },
                },
              ],
            },
          },
        },
        AddressBody: {
          type: "object",
          required: ["address"],
          properties: {
            address: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    street: { type: "string" },
                    ward: { type: "string" },
                    district: { type: "string" },
                    city: { type: "string" },
                  },
                },
              ],
            },
          },
        },
        ProductVariantBody: {
          type: "object",
          description:
            "Payload tạo / cập nhật biến thể. Lưu ý: KHÔNG được gửi `stock_quantity` hoặc `reserved_quantity` — tồn kho chỉ thay đổi qua phiếu nhập kho (Inbound), đơn hàng và return restock. Nếu gửi sẽ bị từ chối với lỗi 400.",
          properties: {
            sku: { type: "string" },
            price: { type: "number" },
            images: { type: "array", items: { type: "string" } },
            color: { type: "string" },
            size: { type: "string" },
            bridge_fit: { type: "string" },
            diameter: { type: "number" },
            base_curve: { type: "number" },
            power: { type: "number" },
          },
        },
        ProductVariantResponse: {
          type: "object",
          description:
            "Variant trả về từ API. `available_quantity` được tính = max(0, stock_quantity - reserved_quantity) và không lưu trong DB.",
          properties: {
            _id: { type: "string" },
            product_id: { type: "string" },
            sku: { type: "string" },
            price: { type: "number" },
            stock_quantity: {
              type: "integer",
              description: "Tồn kho thực tế (on-hand). Read-only từ phía client.",
            },
            reserved_quantity: {
              type: "integer",
              description: "Số lượng đang giữ chỗ cho đơn. Read-only từ phía client.",
            },
            available_quantity: {
              type: "integer",
              description: "Số có thể bán = max(0, stock_quantity - reserved_quantity).",
            },
            images: { type: "array", items: { type: "string" } },
            color: { type: "string" },
            size: { type: "string" },
            bridge_fit: { type: "string" },
            diameter: { type: "number" },
            base_curve: { type: "number" },
            power: { type: "number" },
            is_active: { type: "boolean" },
          },
        },
        LensParamsBody: {
          type: "object",
          properties: {
            sph_right: { type: "number" },
            sph_left: { type: "number" },
            cyl_right: { type: "number" },
            cyl_left: { type: "number" },
            axis_right: { type: "number" },
            axis_left: { type: "number" },
            add_right: { type: "number" },
            add_left: { type: "number" },
            pd: { type: "number" },
            pupillary_distance: { type: "number" },
            note: { type: "string" },
          },
        },
        CartItemResponse: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Cart line ID" },
            variant_id: { type: "string", nullable: true },
            combo_id: { type: "string", nullable: true },
            quantity: { type: "integer" },
            lens_params: { $ref: "#/components/schemas/LensParamsBody" },
            price_snapshot: { type: "number", nullable: true },
            combo_price_snapshot: { type: "number", nullable: true },
          },
        },
        CartResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/CartItemResponse" },
            },
            totalAmount: { type: "number" },
          },
        },
        CheckoutBody: {
          type: "object",
          required: ["shipping_address", "phone", "payment_method"],
          properties: {
            shipping_address: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    street: { type: "string" },
                    ward: { type: "string" },
                    district: { type: "string" },
                    city: { type: "string" },
                  },
                },
              ],
            },
            phone: { type: "string" },
            payment_method: { type: "string", enum: ["cod", "momo", "vnpay"] },
            shipping_method: { type: "string", enum: ["ship", "pickup"] },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  variant_id: { type: "string" },
                  combo_id: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                  lens_params: {
                    $ref: "#/components/schemas/LensParamsBody",
                  },
                },
              },
            },
          },
        },

        // ── Shipping Info ──────────────────────────────────────────────────────
        ShippingInfoBody: {
          type: "object",
          description:
            "Cập nhật thông tin vận chuyển. Ít nhất một trong hai trường phải có giá trị.",
          properties: {
            shipping_carrier: {
              type: "string",
              example: "GHN",
              description: "Đơn vị vận chuyển (GHN, GHTK, Viettel Post…)",
            },
            tracking_code: {
              type: "string",
              example: "GHN123456789",
              description: "Mã vận đơn / mã giao hàng",
            },
          },
        },

        // ── Return Request ─────────────────────────────────────────────────────
        ReturnItemInput: {
          type: "object",
          required: ["order_item_id", "quantity"],
          properties: {
            order_item_id: {
              type: "string",
              description: "ObjectId của dòng sản phẩm trong đơn (OrderItem._id)",
            },
            quantity: {
              type: "integer",
              minimum: 1,
              description: "Số lượng muốn trả (≤ số lượng đã mua)",
            },
          },
        },

        RequestReturnBody: {
          type: "object",
          required: ["order_id", "return_reason", "items"],
          properties: {
            order_id: {
              type: "string",
              description: "ObjectId của đơn hàng muốn trả",
            },
            return_reason: {
              type: "string",
              minLength: 10,
              description: "Mô tả lý do trả hàng (bắt buộc, tối thiểu 10 ký tự)",
            },
            reason_category: {
              type: "string",
              enum: [
                "damaged_on_arrival",
                "wrong_item",
                "changed_mind",
                "defective",
                "other",
              ],
              default: "other",
              description: "Phân loại lý do trả hàng",
            },
            items: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/components/schemas/ReturnItemInput" },
            },
          },
        },

        ReturnHistoryLog: {
          type: "object",
          properties: {
            action: { type: "string", example: "INSPECTING" },
            actor: { type: "string", description: "User ID người thực hiện" },
            at: { type: "string", format: "date-time" },
            note: { type: "string" },
          },
        },

        ReturnRequest: {
          type: "object",
          properties: {
            _id: { type: "string" },
            order_id: { type: "string", description: "Order ID hoặc object Order đã populate" },
            requested_by: { type: "string", description: "User ID khách hàng" },
            return_reason: { type: "string" },
            reason_category: {
              type: "string",
              enum: ["damaged_on_arrival", "wrong_item", "changed_mind", "defective", "other"],
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  order_item_id: { type: "string" },
                  variant_id: { type: "string" },
                  quantity: { type: "integer" },
                  item_type: { type: "string", enum: ["frame", "lens"], nullable: true },
                },
              },
            },
            status: {
              type: "string",
              description:
                "PENDING=Chờ duyệt, APPROVED=Đã chấp nhận trả, INSPECTING=Đã nhận & kiểm tra, REFUNDED=Đã hoàn tiền, REJECTED=Từ chối. Giá trị RECEIVED/PROCESSING/COMPLETED là dữ liệu cũ.",
              enum: [
                "PENDING",
                "APPROVED",
                "INSPECTING",
                "REFUNDED",
                "REJECTED",
                "RECEIVED",
                "PROCESSING",
                "COMPLETED",
              ],
            },
            condition_at_receipt: {
              type: "string",
              enum: ["NEW", "DAMAGED", "USED"],
              nullable: true,
              description: "Tình trạng hàng do Ops đánh giá khi nhận về",
            },
            is_restocked: { type: "boolean", description: "Đã cộng lại vào kho chưa" },
            refund_amount: { type: "number", description: "Số tiền thực tế hoàn cho khách (VND)" },
            handled_by: { type: "string", nullable: true, description: "User ID Ops/Admin xử lý" },
            rejected_reason: { type: "string", nullable: true },
            history_log: {
              type: "array",
              items: { $ref: "#/components/schemas/ReturnHistoryLog" },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        ReceiveReturnBody: {
          type: "object",
          required: ["condition_at_receipt"],
          properties: {
            condition_at_receipt: {
              type: "string",
              enum: ["NEW", "DAMAGED", "USED"],
              description:
                "NEW = còn nguyên vẹn → eligible for restock. DAMAGED = hàng hỏng. USED = đã qua sử dụng.",
            },
            note: {
              type: "string",
              description: "Ghi chú thêm của Ops (tùy chọn)",
            },
          },
        },

        RejectReturnBody: {
          type: "object",
          required: ["rejected_reason"],
          properties: {
            rejected_reason: {
              type: "string",
              description: "Lý do từ chối yêu cầu trả hàng (bắt buộc)",
            },
          },
        },

        RestockLogItem: {
          type: "object",
          properties: {
            variant_id: { type: "string" },
            quantity: { type: "integer" },
            restock: { type: "boolean" },
            reason: { type: "string", description: "Giải thích quyết định restock/no-restock" },
          },
        },

        CompleteReturnResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
            restockLog: {
              type: "array",
              items: { $ref: "#/components/schemas/RestockLogItem" },
              description:
                "Chi tiết từng item: có được cộng kho không và lý do tại sao.",
            },
            finalOrderStatus: {
              type: "string",
              enum: ["returned", "refunded"],
              description:
                "returned = COD/chưa thu tiền. refunded = đã thu qua MoMo/VNPay → đánh dấu hoàn tiền.",
            },
          },
        },

        FinanceExpenseBody: {
          type: "object",
          required: ["title", "amount", "category", "occurred_at"],
          properties: {
            title: { type: "string", maxLength: 200 },
            amount: { type: "number", minimum: 0 },
            category: {
              type: "string",
              enum: [
                "marketing",
                "payroll",
                "rent",
                "utilities",
                "logistics",
                "inventory_purchase",
                "equipment",
                "tax_fees",
                "platform_fees",
                "other",
              ],
            },
            occurred_at: { type: "string", format: "date-time", description: "Ngày phát sinh chứng từ" },
            description: { type: "string", maxLength: 2000 },
            reference_no: { type: "string", maxLength: 100, description: "Số hóa đơn / phiếu chi" },
          },
        },

        VoidExpenseBody: {
          type: "object",
          properties: {
            void_reason: { type: "string", description: "Lý do hủy phiếu (tùy chọn)" },
          },
        },

        InboundItemInput: {
          type: "object",
          required: ["variant_id", "qty_planned"],
          properties: {
            variant_id: { type: "string", description: "ProductVariant ID" },
            qty_planned: {
              type: "integer",
              minimum: 1,
              description: "Số lượng dự kiến nhập",
            },
            import_price: {
              type: "number",
              minimum: 0,
              description: "Giá nhập (VND) cho mỗi đơn vị",
            },
          },
        },
        InboundCreateBody: {
          type: "object",
          required: ["items"],
          properties: {
            type: {
              type: "string",
              enum: ["PURCHASE", "RETURN_RESTOCK", "OPENING_BALANCE"],
              default: "PURCHASE",
            },
            supplier_name: { type: "string" },
            expected_date: { type: "string", format: "date-time" },
            note: { type: "string" },
            reference_orders: {
              type: "array",
              items: { type: "string" },
              description: "Danh sách Order ID liên quan (tùy chọn)",
            },
            items: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/components/schemas/InboundItemInput" },
            },
          },
        },
      },
    },
    paths: {
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Đăng ký",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Đăng nhập",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginBody" },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/verify-email": {
        get: {
          tags: ["Auth"],
          summary: "Xác thực email",
          parameters: [
            {
              name: "token",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/resend-verification-email": {
        post: {
          tags: ["Auth"],
          summary: "Gửi lại mail xác thực",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Quên mật khẩu",
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Đặt lại mật khẩu",
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/change-password": {
        post: {
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          summary: "Đổi mật khẩu",
          responses: { 200: { description: "OK" } },
        },
      },
      "/users/me/profile": {
        get: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Lấy profile",
          responses: { 200: { description: "OK" } },
        },
        put: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật profile",
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    avatar: { type: "string", format: "binary" },
                    full_name: { type: "string" },
                    phone: { type: "string" },
                    dob: { type: "string", format: "date" },
                    gender: {
                      type: "string",
                      enum: ["male", "female", "other"],
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },
      "/users/me/addresses": {
        get: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Lay danh sach dia chi trong profile",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Them dia chi vao profile.addresses",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddressBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/management/staff": {
        get: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách staff",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo staff (sales/operations)",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StaffBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/management/staff/{id}": {
        put: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật staff",
          parameters: [objectIdParam("id", "Staff ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StaffBody" },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa staff",
          parameters: [objectIdParam("id", "Staff ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/management/managers": {
        get: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách managers (admin)",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo manager (admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ManagerBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/management/managers/{id}": {
        put: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật manager",
          parameters: [objectIdParam("id", "Manager ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa manager",
          parameters: [objectIdParam("id", "Manager ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/management/settings/preorder-deposit-rate": {
        get: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Lấy tỷ lệ cọc mặc định cho preorder",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      setting: {
                        $ref: "#/components/schemas/PreorderDepositRateSetting",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ["Management"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật tỷ lệ cọc mặc định cho preorder",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PreorderDepositRateBody" },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      setting: {
                        $ref: "#/components/schemas/PreorderDepositRateSetting",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/statistics/overview": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Thống kê tổng quan cho manager/admin",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Mặc định: end_date - 30 ngày",
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Mặc định: thời điểm hiện tại",
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/statistics/admin": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Thống kê mở rộng cho admin",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/statistics/timeseries": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Thống kê doanh thu và số đơn theo thời gian",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "group_by",
              in: "query",
              schema: {
                type: "string",
                enum: ["day", "week", "month"],
                default: "day",
              },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/statistics/top-products": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Top sản phẩm theo doanh thu",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 10, minimum: 1, maximum: 50 },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/statistics/inventory-alerts": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Cảnh báo tồn kho thấp",
          parameters: [
            {
              name: "threshold",
              in: "query",
              schema: { type: "integer", default: 10, minimum: 0 },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                default: 50,
                minimum: 1,
                maximum: 200,
              },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/statistics/funnel": {
        get: {
          tags: ["Statistics"],
          security: [{ bearerAuth: [] }],
          summary: "Funnel trạng thái đơn hàng",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/products": {
        get: {
          tags: ["Products"],
          summary: "Danh sách sản phẩm",
          description:
            "Trả về sản phẩm kèm `variants[]`. Mỗi variant có thêm `available_quantity = max(0, stock_quantity - reserved_quantity)`.",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 12 },
            },
            {
              name: "type",
              in: "query",
              schema: { type: "string", enum: ["frame", "lens", "accessory"] },
            },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "category_id", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo sản phẩm",
          description:
            "Tạo product kèm danh sách variants. **Không cho phép set `stock_quantity` / `reserved_quantity`** trong từng variant — biến thể luôn được tạo với tồn = 0. Để có hàng, hãy tạo phiếu nhập kho (Inbound) sau đó.",
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    name: { type: "string" },
                    type: {
                      type: "string",
                      enum: ["frame", "lens", "accessory"],
                    },
                    brand: { type: "string" },
                    model: { type: "string" },
                    material: { type: "string" },
                    description: { type: "string" },
                    images: {
                      type: "array",
                      items: { type: "string", format: "binary" },
                    },
                    variants: {
                      type: "string",
                      description:
                        "JSON string của mảng variants. KHÔNG được chứa `stock_quantity` hay `reserved_quantity` (sẽ trả 400).",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Created" },
            400: {
              description:
                "Bad request — payload chứa `stock_quantity` / `reserved_quantity`, hoặc thiếu thông tin bắt buộc.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/variants": {
        get: {
          tags: ["Products"],
          summary: "Danh sách variants theo loại sản phẩm (frame/lens) và tìm kiếm",
          description:
            "Mỗi item trả thêm `available_quantity = max(0, stock_quantity - reserved_quantity)`. Xem `ProductVariantResponse`.",
          parameters: [
            {
              name: "type",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["frame", "lens", "accessory"] },
            },
            { name: "search", in: "query", schema: { type: "string" } },
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 12 },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/products/{slug}": {
        get: {
          tags: ["Products"],
          summary: "Chi tiết sản phẩm theo slug",
          description:
            "Trả về `product` + `variants[]`. Mỗi variant có thêm `available_quantity`.",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/products/{id}/variants": {
        get: {
          tags: ["Products"],
          summary: "Danh sách variants theo product ID",
          description: "Mỗi variant có thêm `available_quantity`.",
          parameters: [objectIdParam("id", "Product ID")],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Thêm variant",
          description:
            "Tạo biến thể mới. **Không cho phép set `stock_quantity` / `reserved_quantity`** — biến thể luôn được tạo với tồn = 0. Tăng tồn qua phiếu nhập kho.",
          parameters: [objectIdParam("id", "Product ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductVariantBody" },
              },
            },
          },
          responses: {
            201: { description: "Created" },
            400: {
              description:
                "Bad request — payload chứa `stock_quantity` / `reserved_quantity`, hoặc thiếu giá.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/products/{id}": {
        put: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật sản phẩm",
          parameters: [objectIdParam("id", "Product ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa sản phẩm",
          description:
            "Xóa sản phẩm. **Hành vi soft-disable**: nếu bất kỳ biến thể nào còn tồn (`stock_quantity > 0`) hoặc đang giữ chỗ (`reserved_quantity > 0`), API sẽ chuyển product + tất cả variant sang `is_active = false` thay vì xóa cứng và trả `soft_disabled: true`. Nếu sạch tồn, sẽ xóa cứng cả product và variants.",
          parameters: [objectIdParam("id", "Product ID")],
          responses: {
            200: {
              description: "OK — đã xóa cứng hoặc soft-disable",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      product: { type: "object", nullable: true },
                      soft_disabled: {
                        type: "boolean",
                        description:
                          "true nếu sản phẩm còn tồn và bị chuyển sang ẩn thay vì xóa cứng.",
                      },
                    },
                  },
                },
              },
            },
            404: { description: "Không tìm thấy sản phẩm" },
          },
        },
      },
      "/products/{productId}/variants/{variantId}": {
        put: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật variant",
          description:
            "Cập nhật thông tin biến thể. **Không được cập nhật `stock_quantity` / `reserved_quantity`** — sẽ trả 400. Tồn kho chỉ thay đổi qua phiếu nhập kho, đơn hàng và return restock.",
          parameters: [
            objectIdParam("productId", "Product ID"),
            objectIdParam("variantId", "Variant ID"),
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductVariantBody" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              description:
                "Bad request — payload chứa `stock_quantity` (phải tạo phiếu nhập kho).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa variant",
          description:
            "Xóa biến thể. **Hành vi soft-disable**: nếu variant còn tồn (`stock_quantity > 0`) hoặc đang giữ chỗ (`reserved_quantity > 0`), API sẽ chuyển sang `is_active = false` thay vì xóa cứng và trả `soft_disabled: true`. Nếu sạch tồn, xóa cứng như bình thường.",
          parameters: [
            objectIdParam("productId", "Product ID"),
            objectIdParam("variantId", "Variant ID"),
          ],
          responses: {
            200: {
              description: "OK — đã xóa cứng hoặc soft-disable",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      variant: {
                        $ref: "#/components/schemas/ProductVariantResponse",
                      },
                      soft_disabled: {
                        type: "boolean",
                        description:
                          "true nếu biến thể còn tồn và bị chuyển sang ẩn thay vì xóa cứng.",
                      },
                    },
                  },
                },
              },
            },
            404: { description: "Không tìm thấy biến thể" },
          },
        },
      },
      "/products/{id}/active": {
        patch: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Toggle active sản phẩm",
          parameters: [objectIdParam("id", "Product ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/categories": {
        get: {
          tags: ["Categories"],
          summary: "Danh sách categories",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Categories"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo category",
          responses: { 201: { description: "Created" } },
        },
      },
      "/categories/{id}": {
        put: {
          tags: ["Categories"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật category",
          parameters: [objectIdParam("id", "Category ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Categories"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa category",
          parameters: [objectIdParam("id", "Category ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/brands": {
        get: {
          tags: ["Brands"],
          summary: "Danh sách brands",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Brands"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo brand",
          responses: { 201: { description: "Created" } },
        },
      },
      "/brands/{id}": {
        put: {
          tags: ["Brands"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật brand",
          parameters: [objectIdParam("id", "Brand ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Brands"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa brand",
          parameters: [objectIdParam("id", "Brand ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/models": {
        get: {
          tags: ["Models"],
          summary: "Danh sách models",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Models"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo model",
          responses: { 201: { description: "Created" } },
        },
      },
      "/models/{id}": {
        put: {
          tags: ["Models"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật model",
          parameters: [objectIdParam("id", "Model ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Models"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa model",
          parameters: [objectIdParam("id", "Model ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/combos": {
        get: {
          tags: ["Combos"],
          summary: "Danh sách combos",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Combos"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo combo",
          responses: { 201: { description: "Created" } },
        },
      },
      "/combos/{id}": {
        put: {
          tags: ["Combos"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật combo",
          parameters: [objectIdParam("id", "Combo ID")],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Combos"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa combo",
          parameters: [objectIdParam("id", "Combo ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/combos/{slug}": {
        get: {
          tags: ["Combos"],
          summary: "Chi tiết combo theo slug",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/cart": {
        get: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Lấy cart",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
      },
      "/cart/items": {
        post: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Thêm item vào cart",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    variant_id: { type: "string" },
                    combo_id: { type: "string" },
                    quantity: { type: "integer", minimum: 1 },
                    lens_params: {
                      $ref: "#/components/schemas/LensParamsBody",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
      },
      "/cart/items/{cartLineId}": {
        put: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật item trong cart theo cart line ID",
          parameters: [objectIdParam("cartLineId", "Cart line ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    quantity: { type: "integer", minimum: 0 },
                    lens_params: {
                      $ref: "#/components/schemas/LensParamsBody",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa item trong cart theo cart line ID",
          parameters: [objectIdParam("cartLineId", "Cart line ID")],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
      },
      "/cart/combo-items/{combo_id}": {
        put: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật combo item trong cart",
          parameters: [objectIdParam("combo_id", "Combo ID")],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa combo item khỏi cart",
          parameters: [objectIdParam("combo_id", "Combo ID")],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
      },
      "/cart/clear": {
        delete: {
          tags: ["Cart"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa toàn bộ cart",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CartResponse" },
                },
              },
            },
          },
        },
      },
      "/orders": {
        get: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách đơn của customer",
          description:
            "Trả về đơn của user đang đăng nhập. Query filter: `status`, phân trang `page`/`pageSize`, và lọc theo `payment_method` / `payment_status` trên tập payment của các đơn trong trang. Logic backend: payment có `status` khác `pending-payment` mới đưa vào map kèm đơn; response gồm `data` (đơn + `payment`) và `pagination` (`page`, `pageSize`, `total`, `totalPages`).",
          parameters: orderListFilterQueryParams(),
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/all": {
        get: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách đơn cho shop (sales/manager/operations/admin)",
          description:
            "Trả về đơn toàn hệ thống. Cùng bộ query filter như customer; nếu có `payment_method` hoặc `payment_status` thì chỉ giữ các đơn trong trang có payment khớp. `pagination.total` đếm theo filter `status` trên Order, không đổi theo filter payment.",
          parameters: orderListFilterQueryParams({ shopNotes: true }),
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/{id}": {
        get: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết đơn hàng",
          description:
            "**Customer** chỉ xem được đơn của mình (trả 403 nếu không phải chủ đơn).\n\n" +
            "**Staff** (sales / operations / manager / admin) xem được bất kỳ đơn nào.\n\n" +
            "Response bao gồm: thông tin đơn (kể cả `shipping_carrier`, `tracking_code`), `items[]`, `payment`, `prescriptions` (nếu là đơn kính thuốc).",
          parameters: [objectIdParam("id", "Order ID")],
          responses: {
            200: {
              description: "Chi tiết đơn hàng",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      order: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          order_type: {
                            type: "string",
                            enum: ["stock", "pre_order", "prescription"],
                          },
                          status: { type: "string" },
                          total_amount: { type: "number" },
                          shipping_fee: { type: "number" },
                          final_amount: { type: "number" },
                          phone: { type: "string" },
                          shipping_address: { type: "string" },
                          shipping_carrier: {
                            type: "string",
                            nullable: true,
                            example: "GHN",
                            description: "Đơn vị vận chuyển (null nếu chưa nhập)",
                          },
                          tracking_code: {
                            type: "string",
                            nullable: true,
                            example: "GHN123456789",
                            description: "Mã vận đơn (null nếu chưa nhập)",
                          },
                          items: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                _id: { type: "string" },
                                variant_id: {
                                  type: "object",
                                  description: "Thông tin variant (đã populate)",
                                  properties: {
                                    _id: { type: "string" },
                                    sku: { type: "string" },
                                    price: { type: "number" },
                                    color: { type: "string" },
                                    size: { type: "string" },
                                    images: { type: "array", items: { type: "string" } },
                                    product_id: {
                                      type: "object",
                                      properties: {
                                        _id: { type: "string" },
                                        name: { type: "string" },
                                        type: { type: "string", enum: ["frame", "lens", "accessory"] },
                                        slug: { type: "string" },
                                        images: { type: "array", items: { type: "string" } },
                                      },
                                    },
                                  },
                                },
                                quantity: { type: "integer" },
                                unit_price: { type: "number" },
                                item_type: { type: "string", enum: ["frame", "lens"], nullable: true },
                                lens_params: { type: "object", nullable: true },
                                product_name: { type: "string", nullable: true, description: "Shortcut: tên sản phẩm từ variant.product_id.name" },
                                product_type: { type: "string", nullable: true, description: "Shortcut: loại sản phẩm (frame/lens/accessory)" },
                                product_slug: { type: "string", nullable: true },
                                images: {
                                  type: "array",
                                  items: { type: "string" },
                                  description: "Ảnh hiển thị: ưu tiên ảnh variant, fallback sang ảnh product",
                                },
                              },
                            },
                          },
                          payment: { type: "object", nullable: true },
                          prescriptions: { type: "array", nullable: true },
                          status_history: { type: "array", items: { type: "object" } },
                        },
                      },
                    },
                  },
                },
              },
            },
            403: { description: "Không có quyền xem đơn này (customer xem đơn người khác)" },
            404: { description: "Không tìm thấy đơn hàng" },
          },
        },
      },

      "/orders/{id}/shipping-info": {
        patch: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật thông tin vận chuyển (mã vận đơn)",
          description:
            "Sales / Ops / Manager / Admin nhập đơn vị vận chuyển và mã vận đơn.\n\n" +
            "**Cho phép khi đơn ở trạng thái:** `confirmed`, `packed`, `shipped`, `completed`.\n\n" +
            "Có thể gọi nhiều lần để sửa nhầm mã. Mỗi lần gọi ghi một entry vào `status_history`.",
          parameters: [objectIdParam("id", "Order ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ShippingInfoBody" },
                example: {
                  shipping_carrier: "GHN",
                  tracking_code: "GHN123456789",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Lưu thành công",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string", example: "Đã lưu thông tin vận chuyển" },
                      order: { type: "object" },
                    },
                  },
                },
              },
            },
            400: {
              description:
                "Lỗi — đơn không ở trạng thái cho phép, hoặc không cung cấp carrier/tracking",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            404: { description: "Không tìm thấy đơn hàng" },
          },
        },
      },
      "/orders/checkout": {
        post: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Checkout",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/orders/preorder-now": {
        post: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Đặt preorder ngay (không qua giỏ hàng)",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/orders/{id}/confirm": {
        post: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Sales xác nhận hoặc từ chối đơn",
          parameters: [objectIdParam("id", "Order ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/{id}/cancel": {
        put: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Customer hủy đơn",
          parameters: [objectIdParam("id", "Order ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/{id}/confirm-received": {
        put: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Customer xác nhận đã nhận hàng (delivered -> completed)",
          parameters: [objectIdParam("id", "Order ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/{id}/status": {
        put: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Operations cập nhật trạng thái đơn",
          parameters: [objectIdParam("id", "Order ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: [
                        "processing",
                        "manufacturing",
                        "received",
                        "packed",
                        "shipped",
                        "delivered",
                        "completed",
                        "return_requested",
                        "returned",
                        "refunded",
                        "cancelled",
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },
      "/payment/success": {
        get: {
          tags: ["Payments"],
          security: [{ bearerAuth: [] }],
          summary: "Đánh dấu payment success",
          parameters: [
            {
              name: "orderId",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/payment/fail": {
        get: {
          tags: ["Payments"],
          security: [{ bearerAuth: [] }],
          summary: "Đánh dấu payment fail",
          parameters: [
            {
              name: "orderId",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/momo/create": {
        post: {
          tags: ["MoMo"],
          summary: "Tạo thanh toán MoMo",
          responses: { 200: { description: "OK" } },
        },
      },
      "/momo/return": {
        get: {
          tags: ["MoMo"],
          summary: "MoMo return URL",
          responses: { 302: { description: "Redirect" } },
        },
      },
      "/momo/ipn": {
        post: {
          tags: ["MoMo"],
          summary: "MoMo IPN",
          responses: { 200: { description: "OK" } },
        },
      },
      "/vnpay/create": {
        post: {
          tags: ["VNPay"],
          summary: "Tạo thanh toán VNPay",
          responses: { 200: { description: "OK" } },
        },
      },
      "/vnpay/verify": {
        get: {
          tags: ["VNPay"],
          summary: "Xác minh kết quả thanh toán VNPay",
          responses: { 200: { description: "OK" } },
        },
      },
      // ════════════════════════════════════════════════════════════════════════
      // Returns – Customer
      // ════════════════════════════════════════════════════════════════════════

      "/returns": {
        post: {
          tags: ["Returns – Customer"],
          security: [{ bearerAuth: [] }],
          summary: "Gửi yêu cầu trả hàng",
          description:
            "Khách hàng tạo yêu cầu trả hàng sau khi đơn ở trạng thái **delivered** hoặc **completed**.\n\n" +
            "Mỗi đơn chỉ một yêu cầu trả **đang xử lý** (PENDING, APPROVED, INSPECTING — hoặc bản ghi legacy RECEIVED/PROCESSING).\n\n" +
            "Sau khi tạo thành công, trạng thái đơn gốc tự động chuyển sang `return_requested`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RequestReturnBody" },
                example: {
                  order_id: "64f1a2b3c4d5e6f7a8b9c0d1",
                  return_reason: "Sản phẩm bị nứt gọng khi nhận hàng",
                  reason_category: "damaged_on_arrival",
                  items: [
                    { order_item_id: "64f1a2b3c4d5e6f7a8b9c0d2", quantity: 1 },
                  ],
                },
              },
            },
          },
          responses: {
            201: {
              description: "Yêu cầu trả hàng đã được tạo",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
                    },
                  },
                },
              },
            },
            400: {
              description:
                "Lỗi — đơn không ở trạng thái phù hợp, đã có yêu cầu đang xử lý, hoặc dữ liệu không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/returns/my": {
        get: {
          tags: ["Returns – Customer"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách yêu cầu trả hàng của tôi",
          description: "Trả về các yêu cầu trả hàng do khách hàng đang đăng nhập tạo ra.",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "PENDING",
                  "APPROVED",
                  "INSPECTING",
                  "REFUNDED",
                  "REJECTED",
                  "RECEIVED",
                  "PROCESSING",
                  "COMPLETED",
                ],
              },
              description: "Lọc theo trạng thái yêu cầu",
            },
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, default: 10 },
            },
          ],
          responses: {
            200: {
              description: "Danh sách yêu cầu trả hàng",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      page: { type: "integer" },
                      pageSize: { type: "integer" },
                      returns: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ReturnRequest" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // Returns – Admin / Ops
      // ════════════════════════════════════════════════════════════════════════

      "/api/admin/returns": {
        get: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách toàn bộ yêu cầu trả hàng",
          description:
            "Dành cho Operations / Manager / Admin.\n\n" +
            "Có thể lọc theo `status`, `order_id`, `condition` (tình trạng hàng nhận về).",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "PENDING",
                  "APPROVED",
                  "INSPECTING",
                  "REFUNDED",
                  "REJECTED",
                  "RECEIVED",
                  "PROCESSING",
                  "COMPLETED",
                ],
              },
            },
            {
              name: "order_id",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Lọc theo Order ID",
            },
            {
              name: "condition",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["NEW", "DAMAGED", "USED"] },
              description: "Lọc theo tình trạng hàng nhận về",
            },
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Danh sách yêu cầu trả hàng",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      page: { type: "integer" },
                      pageSize: { type: "integer" },
                      returns: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ReturnRequest" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/returns/{id}": {
        get: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết yêu cầu trả hàng",
          description:
            "Trả về đầy đủ thông tin: thông tin đơn gốc (populated), khách hàng, items (populated variant), lịch sử xử lý (`history_log`).",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          responses: {
            200: {
              description: "Chi tiết yêu cầu",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
                    },
                  },
                },
              },
            },
            404: { description: "Không tìm thấy yêu cầu trả hàng" },
          },
        },
      },

      "/api/admin/returns/{id}/approve": {
        patch: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Chấp nhận trả hàng (Chờ duyệt → Đã chấp nhận)",
          description:
            "Operations / Manager / Admin duyệt yêu cầu: **PENDING → APPROVED**.\n\n" +
            "Sau bước này khách đóng gói gửi hàng về. Khi nhận kiện và mở hộp kiểm tra, gọi `PATCH .../receive`.",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    note: { type: "string", description: "Ghi chú nội bộ (tùy chọn)" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Đã chấp nhận trả",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
                    },
                  },
                },
              },
            },
            400: { description: "Bad request" },
          },
        },
      },

      "/api/admin/returns/{id}/receive": {
        patch: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Đã nhận hàng & kiểm tra (Đang kiểm tra)",
          description:
            "**APPROVED → INSPECTING.** Shop đã nhận kiện từ shipper; Ops mở hộp và ghi `condition_at_receipt`.\n\n" +
            "**Quy tắc cộng kho (bước hoàn tiền sau):** `condition_at_receipt` quyết định restock:\n" +
            "- `NEW` → đủ điều kiện restock (trừ tròng prescription/pre_order).\n" +
            "- `DAMAGED` / `USED` → không restock.",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReceiveReturnBody" },
                example: {
                  condition_at_receipt: "NEW",
                  note: "Hàng còn nguyên seal, gọng không trầy xước",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Đã nhận hàng và ghi nhận tình trạng",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Lỗi — trạng thái không hợp lệ hoặc condition không đúng enum",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            404: { description: "Không tìm thấy yêu cầu" },
          },
        },
      },

      "/api/admin/returns/{id}/refund": {
        patch: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Hoàn tiền & hoàn tất (INSPECTING → REFUNDED)",
          description:
            "**Quyền:** Manager / Admin (vận hành không gọi endpoint này).\n\n" +
            "**Điều kiện:** `INSPECTING` và đã có `condition_at_receipt`.\n\n" +
            "**Transaction:** cộng kho (nếu đủ điều kiện), ghi ledger, cập nhật payment/order; `ReturnRequest.status` → **REFUNDED**.\n\n" +
            "Alias: `PATCH .../complete` (cùng logic).",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          responses: {
            200: {
              description: "Đã hoàn tiền",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CompleteReturnResponse" },
                },
              },
            },
            400: {
              description: "Lỗi — trạng thái không phải INSPECTING, hoặc chưa ghi condition_at_receipt",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            404: { description: "Không tìm thấy yêu cầu" },
          },
        },
      },

      "/api/admin/returns/{id}/complete": {
        patch: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Alias: hoàn tiền (giống PATCH /refund)",
          description: "Giống `PATCH /api/admin/returns/{id}/refund`. **Manager / Admin**.",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          responses: {
            200: {
              description: "Đã hoàn tiền",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CompleteReturnResponse" },
                },
              },
            },
            400: {
              description: "Bad request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            404: { description: "Không tìm thấy yêu cầu" },
          },
        },
      },

      "/api/admin/returns/{id}/reject": {
        patch: {
          tags: ["Returns – Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Từ chối yêu cầu trả hàng",
          description:
            "Từ chối khi hàng giả, vỡ do khách, hoặc không đủ điều kiện.\n\n" +
            "Cho phép khi: **PENDING**, **APPROVED**, **INSPECTING** (và bản ghi legacy RECEIVED/PROCESSING).\n\n" +
            "Đơn gốc `return_requested` → `delivered`.",
          parameters: [objectIdParam("id", "ReturnRequest ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RejectReturnBody" },
                example: {
                  rejected_reason: "Sản phẩm có dấu hiệu đã qua sử dụng, không đủ điều kiện trả",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Đã từ chối yêu cầu",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      returnRequest: { $ref: "#/components/schemas/ReturnRequest" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Lỗi — trạng thái không hợp lệ hoặc thiếu lý do từ chối",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            404: { description: "Không tìm thấy yêu cầu" },
          },
        },
      },

      "/finance/summary": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Tổng quan thu — chi — hoàn — ước lượng lãi",
          description:
            "Doanh thu theo đơn (delivered/completed, theo created_at). Tiền vào theo Payment (paid/deposit-paid, theo paid_at). Hoàn tiền: ReturnRequest REFUNDED (updatedAt; tương thích COMPLETED cũ). Chi: FinanceExpense active (occurred_at).",
          parameters: [
            {
              name: "start_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Mặc định: 30 ngày trước end_date",
            },
            {
              name: "end_date",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Mặc định: hiện tại",
            },
          ],
          responses: { 200: { description: "OK" }, 400: { description: "Bad request" } },
        },
      },
      "/finance/revenue/breakdown": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết doanh thu (payment × status, đơn × status)",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/finance/cashflow": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Dòng tiền (tiền vào vs chi theo bucket)",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
            {
              name: "group_by",
              in: "query",
              schema: { type: "string", enum: ["day", "week", "month"], default: "day" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/finance/revenue/orders": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách đơn ghi nhận doanh thu (delivered/completed) trong kỳ",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/finance/refunds": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách hoàn tiền đã hoàn tất trong kỳ",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/finance/expenses/by-category": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Tổng chi phí theo danh mục trong kỳ",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/finance/expenses": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách phiếu chi",
          parameters: [
            { name: "start_date", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end_date", in: "query", schema: { type: "string", format: "date-time" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["active", "voided", "all"], default: "active" },
            },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo phiếu chi",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/FinanceExpenseBody" } },
            },
          },
          responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
        },
      },
      "/finance/expenses/{id}": {
        get: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết phiếu chi",
          parameters: [objectIdParam("id", "FinanceExpense ID")],
          responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật phiếu chi (không sửa phiếu đã void)",
          parameters: [objectIdParam("id", "FinanceExpense ID")],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/FinanceExpenseBody" } },
            },
          },
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Finance"],
          security: [{ bearerAuth: [] }],
          summary: "Hủy phiếu chi (soft void)",
          parameters: [objectIdParam("id", "FinanceExpense ID")],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/VoidExpenseBody" } },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },

      "/inbounds": {
        get: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách phiếu nhập kho",
          description:
            "Phân quyền: operations / manager / admin.\n\nFilter: `status`, `type`, `supplier_name` (regex).",
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "DRAFT",
                  "PENDING_APPROVAL",
                  "APPROVED",
                  "RECEIVED",
                  "COMPLETED",
                  "CANCELLED",
                ],
              },
            },
            {
              name: "type",
              in: "query",
              schema: {
                type: "string",
                enum: ["PURCHASE", "RETURN_RESTOCK", "OPENING_BALANCE"],
              },
            },
            { name: "supplier_name", in: "query", schema: { type: "string" } },
            {
              name: "page",
              in: "query",
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo phiếu nhập (DRAFT)",
          description:
            "Tạo phiếu nhập ở trạng thái DRAFT. Phân quyền: operations / manager / admin.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InboundCreateBody" },
                example: {
                  type: "PURCHASE",
                  supplier_name: "NCC ABC",
                  expected_date: "2026-05-01",
                  note: "Nhập bổ sung gọng",
                  items: [
                    {
                      variant_id: "64f1a2b3c4d5e6f7a8b9c0d1",
                      qty_planned: 50,
                      import_price: 120000,
                    },
                  ],
                },
              },
            },
          },
          responses: {
            201: { description: "Created" },
            400: {
              description: "Bad request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/inbounds/{id}": {
        get: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết phiếu nhập",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          responses: {
            200: { description: "OK" },
            404: { description: "Không tìm thấy phiếu nhập" },
          },
        },
        put: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Sửa phiếu DRAFT",
          description:
            "Chỉ phiếu DRAFT mới sửa được nội dung. Cho sửa: `type`, `supplier_name`, `expected_date`, `note`, `items`.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InboundCreateBody" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: { description: "Phiếu không ở trạng thái DRAFT" },
          },
        },
      },
      "/inbounds/{id}/submit": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Gửi duyệt (DRAFT → PENDING_APPROVAL)",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          responses: {
            200: { description: "OK" },
            400: { description: "Trạng thái không hợp lệ hoặc phiếu rỗng" },
          },
        },
      },
      "/inbounds/{id}/approve": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Duyệt phiếu (PENDING_APPROVAL → APPROVED)",
          description: "Phân quyền: manager / admin.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          responses: {
            200: { description: "OK" },
            400: { description: "Phiếu không ở trạng thái PENDING_APPROVAL" },
          },
        },
      },
      "/inbounds/{id}/reject": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Từ chối phiếu (PENDING_APPROVAL → DRAFT)",
          description: "Phân quyền: manager / admin. Bắt buộc ghi chú lý do.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["note"],
                  properties: {
                    note: { type: "string", description: "Lý do từ chối" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: { description: "Trạng thái không hợp lệ hoặc thiếu note" },
          },
        },
      },
      "/inbounds/{id}/cancel": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Hủy phiếu",
          description:
            "Phân quyền: manager / admin. Cho phép hủy khi phiếu ở DRAFT / PENDING_APPROVAL / APPROVED (chưa nhận hàng). Bắt buộc nhập `cancel_reason`.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["cancel_reason"],
                  properties: {
                    cancel_reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: { description: "Phiếu đã nhận hàng / hoàn tất, không hủy được" },
          },
        },
      },
      "/inbounds/{id}/receive": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Nhận hàng vào kho (APPROVED → RECEIVED)",
          description:
            "Tăng `stock_quantity` của từng variant đúng `qty_planned` (chính sách v1: không cho over-receiving, không partial). Ghi InventoryLedger và chạy allocation FIFO cho các đơn pre_order ở `confirmed`. Đơn nào đủ hàng sẽ tự chuyển sang `processing`.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          responses: {
            200: { description: "OK" },
            400: { description: "Phiếu không ở trạng thái APPROVED" },
          },
        },
      },
      "/inbounds/{id}/complete": {
        post: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Chốt phiếu (RECEIVED → COMPLETED)",
          description: "Khoá phiếu sau khi đã nhận hàng và đối soát.",
          parameters: [objectIdParam("id", "Inbound receipt ID")],
          responses: {
            200: { description: "OK" },
            400: { description: "Phiếu chưa ở trạng thái RECEIVED" },
          },
        },
      },
      "/inbounds/ledger": {
        get: {
          tags: ["Inbound"],
          security: [{ bearerAuth: [] }],
          summary: "Sổ kho (Inventory Ledger)",
          description:
            "Truy vấn lịch sử biến động tồn kho. Filter: `variant_id`, `event_type`, `ref_type`, `ref_id`.",
          parameters: [
            { name: "variant_id", in: "query", schema: { type: "string" } },
            {
              name: "event_type",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "receipt_confirmed",
                  "inbound_completed",
                  "manual_adjustment",
                  "order_reserve",
                  "order_release",
                  "order_deduct",
                  "return_restock",
                ],
              },
            },
            {
              name: "ref_type",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "inventory_receipt",
                  "stock_inbound",
                  "order",
                  "cart",
                  "manual",
                  "return_request",
                ],
              },
            },
            { name: "ref_id", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", default: 20, maximum: 200 },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
    },
  };
}

module.exports = getOpenApiSpec;
