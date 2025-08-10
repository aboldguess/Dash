# Dockerfile
# Purpose: Build a production-ready image for the Dash backend.
# Structure:
#   1. Builder stage installs all dependencies and compiles TypeScript.
#   2. Runtime stage installs only production deps and runs compiled code.
# Usage:
#   docker build -t dash-backend .

# --- Builder stage ---
FROM node:18-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
