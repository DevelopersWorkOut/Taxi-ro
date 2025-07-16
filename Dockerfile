FROM node:18

WORKDIR /app

COPY package*.json ./
# RUN npm install

COPY . .

EXPOSE 19000 19001 19002 8081 8082

CMD ["npx", "expo", "start", "--tunnel", "--clear"]