const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");

const app = express();

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));

const defaultOrders = [
  {
    id: 1,
    customerName: "王小明",
    customerPhone: "0912345678",
    deliveryAddress: "台北市信義區市府路1號",
    totalAmount: 350,
    status: "待處理",
    orderDate: "2025-08-08 10:30",
    items: [
      { productId: 1, name: "高麗菜", quantity: 1, unitPrice: 50, options: [], isPriceByWeight: false },
      { productId: 2, name: "蘋果", quantity: 2, unitPrice: 80, options: [], isPriceByWeight: false },
      { productId: 5, name: "香菇貢丸", quantity: 1, unitPrice: 90, options: [], isPriceByWeight: false },
    ],
  },
  {
    id: 2,
    customerName: "陳大華",
    customerPhone: "0922334455",
    deliveryAddress: "新北市板橋區縣民大道二段7號",
    totalAmount: 200,
    status: "已確認",
    orderDate: "2025-08-08 11:00",
    items: [
      { productId: 7, name: "青江菜", quantity: 3, unitPrice: 40, options: [], isPriceByWeight: false },
      { productId: 8, name: "香蕉", quantity: 1, unitPrice: 60, options: [], isPriceByWeight: false },
    ],
  },
  {
    id: 3,
    customerName: "林美玲",
    customerPhone: "0933445566",
    deliveryAddress: "桃園市中壢區中正路100號",
    totalAmount: 120,
    status: "待處理",
    orderDate: "2025-08-08 12:15",
    items: [
      { productId: 1, name: "高麗菜", quantity: 1, unitPrice: 0, options: [], isPriceByWeight: true },
      { productId: 3, name: "豬五花", quantity: 1, unitPrice: 120, options: [], isPriceByWeight: false },
    ],
  },
  {
    id: 4,
    customerName: "張小華",
    customerPhone: "0987654321",
    deliveryAddress: "台中市西屯區台灣大道三段",
    totalAmount: 80,
    status: "待處理",
    orderDate: "2025-08-09 09:00",
    items: [
      { productId: 1, name: "高麗菜", quantity: 2, unitPrice: 0, options: [], isPriceByWeight: true },
      { productId: 2, name: "蘋果", quantity: 1, unitPrice: 80, options: [], isPriceByWeight: false },
    ],
  },
];

app.get("/orders", (req, res) => {
  logger.info("GET /orders called");
  res.json(defaultOrders);
});

// Expose Express API as a single Cloud Function:
exports.api = onRequest(app);