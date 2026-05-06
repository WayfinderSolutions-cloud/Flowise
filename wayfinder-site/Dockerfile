FROM node:20-slim

WORKDIR /app

COPY . .

ENV NODE_ENV=production
RUN npm install --omit=dev

# Render provides PORT; your server reads process.env.PORT
CMD ["npm","start"]
