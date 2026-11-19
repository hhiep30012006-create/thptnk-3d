# THPT Nguyễn Khuyến — tham quan 3D

## Nội dung

- `index.html`: trang vào và hồ sơ học sinh.
- `app.js`: tải mô hình GLB, tạo nhân vật, điều khiển đi lại, bản đồ nhỏ và giới hạn di chuyển theo ranh đỏ.
- `style.css`: giao diện máy tính và điện thoại.
- `server.js`: máy chủ phục vụ trang web, chat chung và đồng bộ nhân vật qua mạng nội bộ.
- `assets/Nguyenkhuyen1989.glb`: mô hình gốc của trường, dung lượng khoảng 28 MB. `npm ci` ghép lại mô hình từ `release-assets/` và kiểm tra SHA-256 trước khi chạy.

## Chạy thử trên máy

1. Cài Node.js nếu máy chưa có.
2. Mở thư mục dự án `file thử` trong VS Code.
3. Chọn **Terminal → New Terminal** và chạy `npm ci` để cài thư viện.
4. Nhấn **F5** trong VS Code hoặc chạy `npm start` trong terminal.
5. Trên máy chủ, mở `http://localhost:3000`. Trong Terminal sẽ hiện địa chỉ LAN để các thiết bị cùng Wi-Fi mở.
6. Mỗi người điền hồ sơ rồi vào trường; nút **Chat** mở khung nhắn tin chung.

Không cần bấm **Go Live** khi chạy theo cách này. Giữ cửa sổ Terminal đang mở để phòng chat và người chơi tiếp tục hoạt động.

## Đưa lên web

Máy chủ hiện hỗ trợ các thiết bị cùng mạng Wi-Fi. Hosting tĩnh riêng lẻ không đủ cho chat và đồng bộ người chơi; muốn học sinh tham gia từ mạng Internet khác, cần đưa `server.js` lên một dịch vụ hosting có Node.js và kết nối HTTPS tới cùng máy chủ.

## Phạm vi hiện tại

- Người trong cùng phòng thấy nhân vật, tên/lớp và tin nhắn của nhau.
- Tin nhắn được giữ tạm trên máy chủ để người vừa vào xem được các tin gần đây; dữ liệu được xóa khi máy chủ dừng.
- Three.js 0.170.0 được tải từ jsDelivr, nên người xem cần Internet.

## Giờ địa phương và danh sách Online

- `campus-lighting.js` quyết định pha ánh sáng từ giờ thiết bị (06:00, 16:01 và 19:01). `app.js` kiểm tra giờ mỗi giây, cập nhật khi quay lại tab và nội suy đèn, bầu trời, sương trong vòng lặp render khi đổi pha. Có thể chỉnh màu, cường độ và thời gian chuyển ở đầu module.
- `campus-presence.js` quản lý danh sách và cập nhật từng dòng HUD. `app.js` gửi trạng thái qua `/api/heartbeat` của `server.js`. Danh sách dùng biệt danh, lớp/niên khóa và trạng thái trong chính phòng đang chơi. Sau khoảng hai phút không có thao tác, trạng thái đổi sang không hoạt động.

## Tương tác và lưu bút

- Áp sát lư hương rồi nhấn **F** hoặc chọn **Dâng hoa**. Nhấn **E** hoặc bấm ghế để ngồi nghỉ.
- Cửa các lớp tự mở khi lại gần và khép lại khi rời đi. Đến ghế hoặc nhìn về phía bảng đen rồi nhấn **E** hoặc chạm nút tương tác. Đứng dậy bằng **E**, **Space** hoặc nút **Đứng dậy**. Nội dung mỗi bảng đen được giữ riêng trong phiên tham quan.
- Ở cửa P101 dãy C1, nút **Vào phòng thực hành C1** mở phòng có công tắc, quạt và bảng xanh dùng chung. Chữ trên bảng xanh trong phòng thực hành được chia sẻ với người chơi cùng phòng.
- Bấm **Bảng vàng kỷ niệm** để ký tên và thả tim. Khi chạy cục bộ, lời nhắn được lưu trong thư mục dữ liệu người dùng (trên Windows là `%LOCALAPPDATA%\thptnk-3d\guestbook.json`). Có thể đổi đường dẫn bằng `GUESTBOOK_FILE`.
- Khi triển khai Render, chạy `npm ci` ở bước build và `npm start` ở bước start. Đặt `MONGODB_URI` trong Environment của Render để lưu lưu bút trên MongoDB Atlas. Có thể đặt `MONGODB_DATABASE` để đổi tên cơ sở dữ liệu mặc định `thptnk`. Nếu dùng ổ đĩa lưu trữ bền vững, đặt `GUESTBOOK_FILE` trỏ tới tệp trên ổ đó.
- Hai người đứng gần nhau trong vùng cổng trường hoặc bờ hồ thì nút **Ảnh nhóm** sáng lên. Bấm nút hoặc nhấn **P** rồi tải ảnh PNG đã đóng dấu ngày.

Trên điện thoại, dùng nửa trái để kéo joystick và vuốt nửa phải để xoay góc nhìn. Menu **☰** có dịch chuyển nhanh, tiến độ, chat và nhạc nền. Hãy nói chuyện với bác bảo vệ để xem hướng dẫn.

`campus-classrooms.js` chứa thông số bán kính và thời gian chuyển động. `app.js` nhận diện vật thể lớp học khi nạp GLB và đưa cửa động vào kiểm tra va chạm. `campus-activities.js` nối cửa, ghế và bảng với vòng lặp game và nút tương tác. Máy chủ Node giữ ghế theo phòng chơi và giải phóng ghế khi người chơi rời phòng.

Nút **🎵** chọn nhạc tự động, một bài, phát luân phiên hoặc tắt tiếng. Hai tệp nhạc phát trong game đã nén MP3 96 kbps. Âm thanh tạm dừng khi tab bị ẩn.

Nút **☀️ / 🌅 / 🌙** đổi lần lượt giữa buổi sáng, hoàng hôn và buổi tối. Chế độ được lưu riêng trên mỗi trình duyệt. Giờ và thời tiết Hải Phòng trên HUD vẫn là dữ liệu thực.

Ngoài trụ trắng bên phải cổng có NPC **Bùi Quốc Hiệp 06**. Lại gần, nhấn **E** hoặc chạm vào nhân vật để nghe câu thoại. Tiếng ngựa dùng bản ghi phạm vi công cộng [Wiehern.ogg của Hü](https://commons.wikimedia.org/wiki/File:Wiehern.ogg), chuyển thành MP3.

Nhặt **8 bông hoa và 2 giấy gói** để tự ghép bó hoa tri ân. Đến gần cô Hường ở hành lang C1, cô Quyên gần sân khấu hoặc cô Nhung cạnh hồ rồi nhấn **E** hay bấm nút **💐**. Tiến độ lưu riêng trên trình duyệt theo tên, lớp và năm nhập học.

Chọn **Có nhận** ở mục Nhiệm vụ ẩn để mở hướng dẫn của Hiệp và điểm trèo cạnh bảng tên trường. Chờ bác bảo vệ quay đi, dùng **E** hoặc **🧗**, rồi mua một gói xôi và một ổ bánh mì để nhận danh hiệu. Các đoạn rào cứng vẫn chặn bước đi và nhảy thông thường.

Quốc lộ 37 có 8 xe chạy theo làn. Xe máy, xe tay ga và xe đạp đi gần vỉa hè. Ô tô và xe tải nhẹ đi gần vạch giữa đường. Trong nhiệm vụ ẩn, chạm xe sau khi đã trèo ra sẽ kích hoạt còi, lời nhắc và lùi nhẹ về phía vỉa hè.
