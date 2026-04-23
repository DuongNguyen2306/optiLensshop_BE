// Thiết lập DNS cho Node.js
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

var express = require("express");
const connectDB = require("./src/config/db");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");

var indexRouter = require("./src/routes/index");
const swaggerUi = require("swagger-ui-express");
const getOpenApiSpec = require("./src/docs/openapi");
const {
  startPendingPaymentCleanupJob,
} = require("./src/jobs/pending-payment-cleanup.job");

var app = express();
app.use(
  cors({
    origin: "http://localhost:3000", // Thay đổi nếu frontend chạy trên cổng khács
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    allowedHeaders: "Origin,X-Requested-With,Content-Type,Accept,Authorization",
  }),
);

// Kết nối MongoDB
connectDB();
startPendingPaymentCleanupJob();
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const openApiSpec = getOpenApiSpec();
app.get("/openapi.json", (req, res) => {
  res.json(openApiSpec);
});
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: { persistAuthorization: true },
  }),
);

app.use("/", indexRouter);

console.log(`Server is running on port ${process.env.PORT || 3000}`);
console.log(
  `Link to API documentation: http://localhost:${process.env.PORT || 3000}/api-docs `,
);

module.exports = app;
