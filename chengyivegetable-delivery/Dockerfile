FROM node:18-alpine

# 建立工作目錄
WORKDIR /app

# 複製專案檔案
COPY package.json package-lock.json* ./

# 安裝依賴
RUN npm install --production

COPY . .

# 啟動應用
CMD ["npm", "start"]