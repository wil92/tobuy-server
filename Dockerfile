FROM node:24-alpine3.24 AS dependencies

WORKDIR /app

RUN apk add --no-cache python3 py3-pip

COPY package.json package-lock.json requirements.txt ./
RUN npm ci --omit=dev \
    && python3 -m venv .venv \
    && .venv/bin/pip install --no-cache-dir --no-compile -r requirements.txt \
    && .venv/bin/pip uninstall -y pip

FROM alpine:3.24

WORKDIR /app
ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1

RUN apk add --no-cache nodejs python3 \
    && addgroup -S node && adduser -S -G node node

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/.venv ./.venv
COPY --chown=node:node package.json app.js ./
COPY --chown=node:node bin ./bin
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services

USER node
EXPOSE 3000
CMD ["node", "bin/www"]
