set shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]
set dotenv-load := true

alias start := desktop
alias dev := desktop
alias d := desktop
alias c := check
alias b := build

default:
    @just --list

# Install JS dependencies.
install:
    npm install

# Create .env from the example when one does not exist.
init-env:
    if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env'; Write-Host 'created .env from .env.example' } else { Write-Host '.env already exists' }

# First-run setup for a fresh checkout.
setup: install init-env prepare-sidecars

# Start the Tauri desktop app. This is the main product path.
desktop:
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; npm run tauri:dev

# Prepare bundled sidecar runtime files used by Tauri builds.
prepare-sidecars:
    npm run prepare:sidecars

# Mint free TxLINE World Cup credentials (guest JWT + API token) into .env.
# Defaults to devnet level 1 (60s delay); pass --network mainnet --level 12 for real-time.
txline-onboard *ARGS:
    node tooling/txline-onboard.mjs {{ARGS}}

# Build the webview assets and prepare sidecars.
build:
    npm run build:desktop

# Build the packaged Tauri app/installer.
tauri-build:
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; npm run tauri:build

# Typecheck the React/TypeScript frontend.
typecheck:
    npm run lint:types

# Check the Rust desktop backend.
rust-check:
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; $env:RUSTUP_TOOLCHAIN = '1.95.0-x86_64-pc-windows-msvc'; cargo check --manifest-path src-tauri\Cargo.toml

# Syntax-check Node sidecar entrypoints.
sidecars-check:
    node --check runtime\sidecars\coralos-bridge.mjs
    node --check runtime\sidecars\txoracle-validation-bridge.mjs
    node --check runtime\sidecars\yellowstone-bridge.mjs

# Run the local verification set.
check: typecheck rust-check sidecars-check

# Remove generated build output but keep installed dependencies.
clean:
    if (Test-Path -LiteralPath 'dist') { Remove-Item -LiteralPath 'dist' -Recurse -Force }
    if (Test-Path -LiteralPath 'runtime\sidecars\bin') { Remove-Item -LiteralPath 'runtime\sidecars\bin' -Recurse -Force }

# Remove generated output and local dependencies.
clean-all: clean
    if (Test-Path -LiteralPath 'node_modules') { Remove-Item -LiteralPath 'node_modules' -Recurse -Force }

# Show git branch state.
status:
    git status --short --branch

# Push the current main branch.
push:
    git push origin main
