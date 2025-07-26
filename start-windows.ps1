# Runs the Dash backend on Windows with an optional port parameter.
# Usage: .\start-windows.ps1 -port 4000
param(
    [int]$port = 3000
)

# Determine the script's directory and move to the backend folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir/backend"

# Install NPM dependencies
Write-Host "Installing dependencies..."
npm install

# Run database initialisation
Write-Host "Running database migrations..."
npm run db:init

# Compile TypeScript sources
Write-Host "Building project..."
npm run build

# Set the PORT environment variable for the Node server
$env:PORT = $port
Write-Host "Starting server on port $port..."

# Launch the app
npm start
