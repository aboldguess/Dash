#!/usr/bin/env bash

# Quick start script for running the Dash backend on Raspberry Pi or other Linux systems.
# Installs dependencies, builds the project and launches the server.
#
# Usage: ./dash-start-rpi.sh [-p PORT] [--prod]
#   -p, --port   Port for the server (default: 3000)
#       --prod   Run in production mode using npm start (default: development via npm run dev)
#   -h, --help   Show this help message

set -euo pipefail

LOG_FILE="dash_rpi_start.log"
# Redirect all output to console and log file for debugging
exec > >(tee -i "$LOG_FILE") 2>&1

PORT=3000
PROD=false

usage() {
  echo "Usage: $0 [-p PORT] [--prod]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    --prod|--production)
      PROD=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

echo "Dash quick start script"
echo "========================"

# Check for Node.js and install if missing
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing Node.js 18 (requires sudo)..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Using Node.js version $(node -v)"

echo "Selected port: $PORT"
if $PROD; then
  echo "Server mode: production"
else
  echo "Server mode: development"
fi

# Move to backend directory relative to script location
cd "$(dirname "$0")/backend"

echo "Installing npm dependencies..."
npm install

echo "Initialising database..."
npm run db:init || echo "Database initialisation failed. Check your DB connection settings."

echo "Building project..."
npm run build

export PORT="$PORT"

if $PROD; then
  export NODE_ENV=production
  echo "Starting Dash backend in production on port $PORT..."
  npm start
else
  echo "Starting Dash backend in development mode on port $PORT..."
  npm run dev
fi
