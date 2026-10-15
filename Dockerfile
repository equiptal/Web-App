# Renter web (Next.js SSR) for AWS ECS Fargate. Built by .github/workflows/deploy-aws.yml.
#
# NEXT_PUBLIC_* are inlined into the browser bundle by `next build`, so they are build
# arguments and each environment builds its own image. Server-side variables (APP_API_URL,
# AGENTS_API_TOKEN, ...) are NOT baked in: ECS injects them at container start from
# SSM Parameter Store / Secrets Manager.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_STREAM_API_KEY
ARG NEXT_PUBLIC_OS_APP_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_STREAM_API_KEY=$NEXT_PUBLIC_STREAM_API_KEY \
    NEXT_PUBLIC_OS_APP_URL=$NEXT_PUBLIC_OS_APP_URL

COPY . .
RUN npm run build


FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next

USER node
EXPOSE 3000
CMD ["npm", "start"]
