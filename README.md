# 👓 OptiLens - Hệ Thống Quản Lý Cửa Hàng Kính Mắt Thông Minh

[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![TailwindCSS](https://img.shields.io/badge/Styling-TailwindCSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

> **OptiLens** là giải pháp quản lý toàn diện cho cửa hàng kính mắt, tích hợp quy trình nhập kho chuyên nghiệp (Inventory Inbound), quản lý đơn hàng đặt trước (Pre-order) và hệ thống báo cáo tài chính (P&L Dashboard) chuẩn xác.

---

## ✨ Tính Năng Nổi Bật

### 📦 Quản Lý Kho & Biến Thể (Inventory & Variants)
- **Chuẩn hóa SKU:** Tự động tạo mã định danh cho từng biến thể (Màu sắc, Kích thước, Độ cận).
- **Luồng Nhập Kho Chặt Chẽ:** Quy trình 6 bước (Draft → Submit → Approve → Receive → Complete).
- **Phân bổ FIFO:** Tự động gán hàng cho đơn Pre-order ngay khi hàng về kho.

### 💰 Báo Cáo Tài Chính (Financial Analytics)
- **Dashboard P&L:** Thống kê Doanh thu, Giá vốn (COGS) và Lợi nhuận thực tế.
- **Theo Dõi Dòng Tiền:** Quản lý tiền cọc (Deposit) và các khoản thanh toán từ MoMo, VNPAY, COD.
- **Sổ Cái Kho (Inventory Ledger):** Truy xuất mọi biến động tăng/giảm kho theo thời gian thực.

### 🛒 Quy Trình Bán Hàng (Sales Flow)
- Hỗ trợ đơn hàng có sẵn (In-stock) và đơn hàng chờ (Awaiting Stock).
- Logic giữ chỗ hàng (Reserved Quantity) để tránh tình trạng "bán lố" (Over-selling).

---

## 🛠 Công Nghệ Sử Dụng

### Frontend
- **React.js** & **Tailwind CSS** cho giao diện hiện đại, responsive.
- **Shadcn UI** & **Lucide Icons** để chuẩn hóa components.
- **Recharts** cho hệ thống biểu đồ tài chính trực quan.

### Backend
- **Node.js** & **Express** cho hệ thống API.
- **MongoDB** với cơ chế ACID Transaction để đảm bảo an toàn dữ liệu kho.
- **JWT** cho bảo mật và phân quyền (Admin, Manager, Operations).

---

## 📸 Hình Ảnh Dự Án

| Dashboard Tài Chính | Quản Lý Nhập Kho |
| :---: | :---: |
| ![Financial Dashboard](https://via.placeholder.com/400x250?text=Financial+Dashboard) | ![Inbound Management](https://via.placeholder.com/400x250?text=Inbound+Process) |

---

## 🚀 Cài Đặt

1. **Clone dự án:**
   ```bash
   git clone [https://github.com/DuongNguyen2306/FE_MatKinhSWP.git](https://github.com/DuongNguyen2306/FE_MatKinhSWP.git)
