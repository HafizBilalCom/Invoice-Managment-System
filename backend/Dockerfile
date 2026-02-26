FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p storage/pdfs

EXPOSE 4000

CMD ["npm", "start"]
