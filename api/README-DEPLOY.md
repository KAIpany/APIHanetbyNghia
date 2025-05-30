# Hướng dẫn triển khai API lên Vercel

## Chuẩn bị
1. Tạo repo GitHub mới chỉ dành cho API (ví dụ: api-hanetby-nghia)
2. Push code từ thư mục `/api` lên repo này

## Các bước triển khai
1. Đăng nhập vào Vercel và chọn "New Project"
2. Import từ GitHub repo mới tạo
3. Trong phần cấu hình:
   - Build Command: để trống (hoặc `npm run build` nếu có)
   - Output Directory: để trống
   - Root Directory: để trống (vì đã tách riêng repo)
   
4. Trong phần "Environment Variables", thêm các biến:
   ```
   VERCEL=1
   HANET_CLIENT_ID=<giá_trị>
   HANET_CLIENT_SECRET=<giá_trị>
   HANET_REFRESH_TOKEN=<giá_trị>
   HANET_API_BASE_URL=https://partner.hanet.ai
   HANET_TOKEN_URL=https://oauth.hanet.com/token
   CLIENT_URL=https://client-hanetby-nghia.vercel.app
   ```

5. Nhấn "Deploy" để triển khai API

## Xử lý lỗi phổ biến
- Nếu gặp lỗi Node.js version, thêm file `.npmrc` với nội dung: `node-version=16.x`
- Nếu gặp lỗi về serverless function, đảm bảo server.js được triển khai đúng cách

## Kiểm tra hoạt động
Sau khi deploy thành công, kiểm tra API bằng cách truy cập:
`https://api-hanetby-nghia.vercel.app/api/status` (điều chỉnh URL theo tên miền thực tế)
