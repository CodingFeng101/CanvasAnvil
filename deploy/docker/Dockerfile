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

# The API runs from source through tsx, so the server and its contracts ship
# as-is. resources/ is read at request time — the agent prompts and the draw.io
# shape libraries — so it has to be present too, not just bundled into dist.
COPY server ./server
COPY contracts ./contracts
COPY resources ./resources
COPY tsconfig.json ./tsconfig.json
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
ENV API_BODY_LIMIT=25mb

EXPOSE 8080

CMD ["npm", "start"]
