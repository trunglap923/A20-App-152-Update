# Hướng dẫn Deploy và CI/CD cho Dự án A20-App-152

## Tổng quan

Dự án này là một full-stack application với:

- **Frontend**: Next.js 14+ (TypeScript, Tailwind CSS, shadcn/ui)
- **Backend**: Python FastAPI + SQLAlchemy + ChromaDB
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth

## Phần 1: Deploy Frontend lên Vercel (Đề xuất)

Vercel là nền tảng tốt nhất để deploy Next.js vì:

- Tích hợp trực tiếp với GitHub
- Auto deploy khi có push lên main
- Free tier miễn phí với giới hạn

### Bước 1: Chuẩn bị trên Vercel

1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub
2. Nhấn "New Project" → Chọn repository `A20-App-152`

### Bước 2: Cấu hình Project

Trong phần "Configure Project":

- **Framework Preset**: Next.js (được tự động nhận diện)
- **Root Directory**: `myApp` (QUAN TRỌNG - vì frontend nằm trong thư mục myApp)
- **Environment Variables**: Thêm các biến sau:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_ADMIN_EMAILS`
  - (Các biến khác nếu cần)

### Bước 3: Deploy

Nhấn "Deploy" và chờ vài phút! Frontend sẽ được deploy và bạn có domain dạng:
`https://a20-app-152-[your-username].vercel.app`

---

## Phần 2: Deploy Backend lên Render (Đề xuất)

Render là nền tảng tốt để deploy Python/Node.js backend:

- Tích hợp GitHub
- Auto deploy khi push
- Free tier có sẵn

### Bước 1: Chuẩn bị trên Render

1. Truy cập [render.com](https://render.com) và đăng nhập
2. Nhấn "New +" → Chọn "Web Service"
3. Connect với GitHub và chọn repo `A20-App-152`

### Bước 2: Cấu hình Web Service

- **Name**: `a20-app-152-backend`
- **Region**: Singapore (hoặc gần bạn nhất)
- **Runtime**: Python 3
- **Build Command**: `pip install -r backend/requirements.txt`
- **Start Command**: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Root Directory**: (để trống)
- **Branch**: `main`

### Bước 3: Thêm Environment Variables

Trong phần "Environment":

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (nếu dùng)
- `DATABASE_URL` (nếu dùng PostgreSQL riêng)
- `DEFAULT_MODEL`
- `LOG_LEVEL`

### Bước 4: Deploy

Nhấn "Create Web Service"! Sau vài phút backend sẽ chạy trên:
`https://a20-app-152-backend.onrender.com`

---

## Phần 3: Cài đặt CI/CD với GitHub Actions

Chúng ta sẽ tạo workflows để tự động:

- Kiểm tra code (lint, type check) mỗi khi có PR/push
- Deploy lên Vercel/Render tự động

### 3.1: Tạo Workflow cho Frontend (Next.js)

File: `.github/workflows/frontend-ci.yml`

```yaml
name: Frontend CI/CD

on:
  push:
    branches: [main]
    paths:
      - "myApp/**"
  pull_request:
    branches: [main]
    paths:
      - "myApp/**"

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: myApp

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: myApp/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

  deploy-vercel:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    defaults:
      run:
        working-directory: myApp

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
```

### 3.2: Tạo Workflow cho Backend (Python)

File: `.github/workflows/backend-ci.yml`

```yaml
name: Backend CI/CD

on:
  push:
    branches: [main]
    paths:
      - "backend/**"
      - "requirements.txt"
  pull_request:
    branches: [main]
    paths:
      - "backend/**"
      - "requirements.txt"

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r backend/requirements.txt
          pip install ruff

      - name: Lint with Ruff
        run: ruff check backend/

      - name: Type check (mypy nếu có)
        run: echo "Type check step - add mypy if needed"
```

### 3.3: Cấu hình Secrets trên GitHub

1. Vào repo GitHub → Settings → Secrets and variables → Actions
2. Thêm các secrets sau:
   - `VERCEL_TOKEN`: Lấy từ [vercel.com/account/tokens](https://vercel.com/account/tokens)
   - `VERCEL_ORG_ID`: Lấy từ Vercel project settings
   - `VERCEL_PROJECT_ID`: Lấy từ Vercel project settings

---

## Phần 4: Dockerization (Tùy chọn)

Nếu bạn muốn dùng Docker để deploy, đây là các file Dockerfile:

### 4.1: Dockerfile cho Frontend

File: `myApp/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
```

_(Lưu ý: Cần cấu hình `output: 'standalone'` trong next.config.mjs)_

### 4.2: Dockerfile cho Backend

File: `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 4.3: Docker Compose (Chạy local full-stack)

File: `docker-compose.yml`

```yaml
version: "3.8"

services:
  frontend:
    build:
      context: ./myApp
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
```

---

## Phần 5: Kết nối Frontend với Backend

Sau khi deploy cả 2 phần, cần cập nhật URL API trong frontend:

1. Vào file `myApp/lib/api.ts` (hoặc tương đương)
2. Sử dụng biến môi trường backend URL đã deploy:
   ```typescript
   const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
   ```
3. Thêm biến `NEXT_PUBLIC_API_URL` vào Vercel environment variables

---

## Tóm tắt Quy trình Hoàn chỉnh

1. **Code**: Viết code trên feature branch
2. **Commit & Push**: `git push origin feature/your-feature`
3. **Tạo PR**: Tạo Pull Request lên main
4. **CI Run**: GitHub Actions tự động chạy test/lint
5. **Merge**: Sau khi approved, merge vào main
6. **Auto Deploy**: GitHub Actions auto deploy lên Vercel & Render

---

## Lưu ý Quan trọng

- **Không commit file .env**: File này đã được thêm vào .gitignore
- **Dùng GitHub Secrets**: Lưu các API key vào Secrets, không hardcode
- **Free Tier Giới hạn**: Vercel free có giới hạn bandwidth, Render free sẽ sleep sau 15 phút không hoạt động
- **Supabase**: Đảm bảo cấu hình CORS trên Supabase cho domain frontend mới

---

## Liên hệ/Hỗ trợ

Nếu có vấn đề, kiểm tra:

- Log trên Vercel/Render dashboard
- GitHub Actions tab để xem CI lỗi ở đâu
- Console trên trình duyệt (F12) để xem lỗi frontend


#########################################
####################

Xong rồi! Tôi đã hoàn thành việc chuẩn bị toàn bộ tài liệu và file cấu hình để bạn deploy và sử dụng CI/CD cho dự án này!

## Những điều đã làm:
1. ✅ Tạo file hướng dẫn chi tiết : DEPLOYMENT.md - Bao gồm toàn bộ hướng dẫn từ A-Z
2. ✅ Tạo GitHub Actions Workflows :
   - .github/workflows/frontend-ci.yml : CI cho Next.js frontend
   - .github/workflows/backend-ci.yml : CI cho Python backend
3. ✅ Tạo Dockerfiles :
   - myApp/Dockerfile : Docker cho frontend
   - backend/Dockerfile : Docker cho backend
4. **✅ Tạo docker-compose.yml`: Để chạy full-stack local bằng Docker
5. **✅ Cập nhật next.config.mjs : Thêm output: 'standalone'` để tối ưu Docker
## Bắt đầu Deploy thôi!
Bạn chỉ cần làm theo các bước trong DEPLOYMENT.md , tóm tắt ngắn gọn:

### Đầu tiên (từ 5 phút):
1. Deploy Frontend lên Vercel (rất đơn giản, chỉ cần connect GitHub)
2. Deploy Backend lên Render (tương tự, cũng connect GitHub)
3. Thêm Secrets vào GitHub repo để CI/CD hoạt động
### Những lợi ích bạn sẽ có:
- ✨ Auto deploy mỗi khi bạn push code lên main
- 🧪 Tự động chạy test/lint mỗi khi tạo Pull Request
- 🐳 Docker sẵn sàng nếu bạn muốn dùng container
- 📝 Tài liệu tiếng Việt đầy đủ trong DEPLOYMENT.md
Mở file DEPLOYMENT.md để xem hướng dẫn chi tiết nhé!
