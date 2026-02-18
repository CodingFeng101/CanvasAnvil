FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY api ./api
COPY src ./src
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
ENV API_BODY_LIMIT=25mb

EXPOSE 8080

CMD ["npm", "start"]
