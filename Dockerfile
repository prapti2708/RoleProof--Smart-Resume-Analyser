# Production image with the OCR tools the extractor needs (tesseract + poppler).
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "src/server/index.ts"]
