FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS build

WORKDIR /workspace
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY front/ ./
ARG VITE_TURNSTILE_SITE_KEY=""
ARG VITE_EMAIL_VERIFICATION_REQUIRED="false"
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY} \
    VITE_EMAIL_VERIFICATION_REQUIRED=${VITE_EMAIL_VERIFICATION_REQUIRED}
RUN npm run build

FROM nginx:1.31.4-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913

COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html

EXPOSE 80
