# BIOBOX - Đưa web lên Internet

## Cách dễ nhất
1. Tạo tài khoản GitHub và tạo repository mới, ví dụ `biobox-connect`.
2. Upload toàn bộ file trong thư mục này lên repository.
3. Vào Render, chọn **New > Web Service**, kết nối repository `biobox-connect`.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Environment Variable: `SELLER_PIN` = mã riêng của bạn (không dùng 2468 khi chạy thật).
7. Deploy. Render sẽ cấp một link HTTPS dạng `https://....onrender.com`.
8. Web khách: link gốc. Web người bán: thêm `/seller` vào cuối link.

Ví dụ:
- Khách: https://TEN-WEB.onrender.com/
- Người bán: https://TEN-WEB.onrender.com/seller

## Lưu ý
Bản hiện tại dùng `data/db.json`, phù hợp demo/thi. Trên hosting miễn phí, dữ liệu file có thể mất khi máy chủ được thay mới/redeploy. Nếu dùng bán hàng thật, nên chuyển đơn hàng/chat sang database managed (PostgreSQL/Supabase/Firebase) và thay mã PIN.
