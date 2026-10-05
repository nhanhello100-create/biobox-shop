# BIOBOX CONNECT

Bộ web gồm:
- `/` — web khách hàng: sản phẩm, giỏ hàng, số lượng, đặt hàng, nhắn tin.
- `/seller` — web người bán: xem đơn hàng, thông tin khách, đổi trạng thái, nhận và trả lời tin nhắn.

## Chạy trên máy
Cài Node.js 18+ rồi:
```bash
npm start
```
Mở `http://localhost:3000`.
Khu vực người bán: `http://localhost:3000/seller`.
Mã quản trị mặc định: `2468`.
Có thể đổi bằng biến môi trường `SELLER_PIN`.

Dữ liệu được lưu trong `data/db.json`, vì vậy khách và người bán dùng cùng máy chủ sẽ thấy đơn/tin nhắn của nhau.

## Đưa lên Internet
Đưa nguyên thư mục này lên một máy chủ Node.js (Render, Railway, VPS...). Khi chạy cùng một server, khách và người bán có thể dùng hai địa chỉ web riêng và dữ liệu đi qua API chung.

Lưu ý: để dùng thật nên thay mã PIN mặc định, bật HTTPS và dùng database bền vững/managed database trước khi nhận đơn thực tế.
