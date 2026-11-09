FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Debian rather than Alpine: the CAD workspace runs the house designer's Python scripts (floorplan
# recognition: OpenCV, PyMuPDF, ezdxf wheels need glibc) and its delivery check drives Chromium.
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip chromium libreoffice-impress fonts-noto-cjk fonts-crosextra-carlito fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY server/recognizer/requirements.txt ./server/recognizer/requirements.txt
COPY scripts/slide-agent/requirements.txt ./scripts/slide-agent/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r server/recognizer/requirements.txt -r scripts/slide-agent/requirements.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The API runs from source through tsx, so the server and its contracts ship
# as-is. resources/ is read at request time — the agent prompts and the draw.io
# shape libraries — so it has to be present too, not just bundled into dist.
# skill/cad-skill carries the designer's scripts: recognition and the delivery check run them.
COPY server ./server
COPY contracts ./contracts
COPY resources ./resources
COPY skill/cad-skill ./skill/cad-skill
COPY scripts/slide-agent ./scripts/slide-agent
COPY tsconfig.json ./tsconfig.json
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
ENV API_BODY_LIMIT=25mb
ENV PYTHON=python3
ENV CHROME_PATH=/usr/bin/chromium

EXPOSE 8080

CMD ["npm", "start"]
