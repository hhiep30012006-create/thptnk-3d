# THPT Nguyễn Khuyến — tham quan 3D

## Nội dung

- `index.html`: trang vào và hồ sơ học sinh.
- `app.js`: tải mô hình GLB, tạo nhân vật, điều khiển đi lại, bản đồ nhỏ và giới hạn di chuyển theo ranh đỏ.
- `style.css`: giao diện máy tính và điện thoại.
- `server.js`: máy chủ phục vụ trang web, chat chung và đồng bộ nhân vật qua mạng nội bộ.
- `assets/NGUYENKHUYEN1_HANG_RAO_AN.glb`: mô hình trường cùng hàng rào ẩn.

## Chạy thử trên máy

1. Cài Node.js nếu máy chưa có.
2. Mở thư mục dự án `file thử` trong VS Code.
3. Chọn **Terminal → New Terminal**.
4. Gõ `node server.js` rồi nhấn Enter.
5. Trên máy chủ, mở `http://localhost:3000`. Trong Terminal sẽ hiện địa chỉ LAN để các thiết bị cùng Wi-Fi mở.
6. Mỗi người điền hồ sơ rồi vào trường; nút **Chat** mở khung nhắn tin chung.

Không cần bấm **Go Live** khi chạy theo cách này. Giữ cửa sổ Terminal đang mở để phòng chat và người chơi tiếp tục hoạt động.

## Đưa lên web

Máy chủ hiện hỗ trợ các thiết bị cùng mạng Wi-Fi. Hosting tĩnh riêng lẻ không đủ cho chat và đồng bộ người chơi; muốn học sinh tham gia từ mạng Internet khác, cần đưa `server.js` lên một dịch vụ hosting có Node.js và kết nối HTTPS tới cùng máy chủ.

## Phạm vi hiện tại

- Người trong cùng phòng thấy nhân vật, tên/lớp và tin nhắn của nhau.
- Tin nhắn được giữ tạm trên máy chủ để người vừa vào xem được các tin gần đây; dữ liệu được xóa khi máy chủ dừng.
- Three.js 0.170.0 được tải từ jsDelivr, nên người xem cần Internet.
