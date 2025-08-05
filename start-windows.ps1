<#
Runs the Dash backend on Windows with optional port, database URI and
production mode parameters. The script attempts to ensure MongoDB is running
locally using Docker when available. All output is logged to aid debugging.

Usage examples:
  .\start-windows.ps1 -port 4000
  .\start-windows.ps1 -port 4000 -prod -dbUri "mongodb://localhost:27017/dash"
#>

param(
    [int]$port = 3000,
    [switch]$prod,
    [string]$dbUri = "mongodb://localhost:27017/dash"
)

$ErrorActionPreference = 'Stop'

$logFile = "dash_windows_start.log"
Start-Transcript -Path $logFile -Force | Out-Null
Write-Host "Logging output to $logFile"

# Determine the script's directory and move to the backend folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir/backend"

# Ensure a default environment configuration exists
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Write-Host "No .env file found. Copying default .env.example..."
    Copy-Item ".env.example" ".env"
}

$env:DB_URI = $dbUri
Write-Host "Using database URI: $dbUri"

# Attempt to start a local MongoDB instance if using the default localhost URI
if ($dbUri -eq "mongodb://localhost:27017/dash") {
    $mongoUp = Test-NetConnection -ComputerName "localhost" -Port 27017 -WarningAction SilentlyContinue
    if (-not $mongoUp.TcpTestSucceeded) {
        Write-Host "MongoDB not detected on localhost:27017. Attempting to launch Docker container..."
        if (Get-Command docker -ErrorAction SilentlyContinue) {
            docker rm -f dash-mongo | Out-Null
            docker run -d --name dash-mongo -p 27017:27017 -v "$PWD\mongo-data:/data/db" mongo:6 | Out-Null
            Write-Host "Waiting for MongoDB to be ready..."
            for ($i = 0; $i -lt 10; $i++) {
                $mongoUp = Test-NetConnection -ComputerName "localhost" -Port 27017 -WarningAction SilentlyContinue
                if ($mongoUp.TcpTestSucceeded) {
                    Write-Host "MongoDB is up."
                    break
                }
                Start-Sleep -Seconds 2
            }
            if (-not $mongoUp.TcpTestSucceeded) {
                Write-Host "MongoDB did not start. Please check Docker or install MongoDB manually."
            }
        } else {
            Write-Host "Docker not installed; please install MongoDB manually or set -dbUri to an external server."
        }
    }
}

Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed. See $logFile for details."
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host "Running database initialisation..."
npm run db:init
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database initialisation failed. Check your DB connection settings."
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host "Building project..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. See $logFile for details."
    Stop-Transcript | Out-Null
    exit 1
}

# Set the PORT environment variable for the Node server
$env:PORT = $port
Write-Host "Starting server on port $port..."

if ($prod) {
    $env:NODE_ENV = "production"
    Write-Host "Running in production mode"
    npm start
} else {
    Write-Host "Running in development mode"
    npm run dev
}
