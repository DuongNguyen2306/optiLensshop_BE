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

  return {
    openapi: "3.0.3",
    info: {
      title: "OptiLens Shop API",
      version: "1.1.0",
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
      { name: "Inventory" },
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
          properties: {
            sku: { type: "string" },
            price: { type: "number" },
            stock_quantity: { type: "integer" },
            images: { type: "array", items: { type: "string" } },
            color: { type: "string" },
            size: { type: "string" },
            bridge_fit: { type: "string" },
            diameter: { type: "number" },
            base_curve: { type: "number" },
            power: { type: "number" },
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
                      description: "JSON string của mảng variants",
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Created" } },
        },
      },
      "/variants": {
        get: {
          tags: ["Products"],
          summary: "Danh sách variants theo loại sản phẩm (frame/lens) và tìm kiếm",
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
          parameters: [objectIdParam("id", "Product ID")],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Thêm variant",
          parameters: [objectIdParam("id", "Product ID")],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductVariantBody" },
              },
            },
          },
          responses: { 201: { description: "Created" } },
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
          parameters: [objectIdParam("id", "Product ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/products/{productId}/variants/{variantId}": {
        put: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Cập nhật variant",
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
          responses: { 200: { description: "OK" } },
        },
        delete: {
          tags: ["Products"],
          security: [{ bearerAuth: [] }],
          summary: "Xóa variant",
          parameters: [
            objectIdParam("productId", "Product ID"),
            objectIdParam("variantId", "Variant ID"),
          ],
          responses: { 200: { description: "OK" } },
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
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/all": {
        get: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách đơn cho shop (sales/manager/operations/admin)",
          responses: { 200: { description: "OK" } },
        },
      },
      "/orders/{id}": {
        get: {
          tags: ["Orders"],
          security: [{ bearerAuth: [] }],
          summary: "Chi tiết đơn",
          parameters: [objectIdParam("id", "Order ID")],
          responses: { 200: { description: "OK" } },
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
      "/inventory/receipts": {
        get: {
          tags: ["Inventory"],
          security: [{ bearerAuth: [] }],
          summary: "Danh sách phiếu nhập kho",
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["Inventory"],
          security: [{ bearerAuth: [] }],
          summary: "Tạo phiếu nhập kho",
          responses: { 201: { description: "Created" } },
        },
      },
      "/inventory/receipts/{id}/confirm": {
        patch: {
          tags: ["Inventory"],
          security: [{ bearerAuth: [] }],
          summary: "Xác nhận phiếu nhập kho",
          parameters: [objectIdParam("id", "Receipt ID")],
          responses: { 200: { description: "OK" } },
        },
      },
      "/inventory/ledger": {
        get: {
          tags: ["Inventory"],
          security: [{ bearerAuth: [] }],
          summary: "Sổ kho (inventory ledger)",
          responses: { 200: { description: "OK" } },
        },
      },
    },
  };
}

module.exports = getOpenApiSpec;
