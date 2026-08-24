#!/usr/bin/env bash
set -euo pipefail

echo "ERP-POS v2 setup"
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from .env.example. Edit DATABASE_URL and JWT_SECRET before continuing."
  exit 0
fi
npm ci --prefix backend
npm ci --prefix frontend
npm run db:generate --prefix backend
npm run db:migrate --prefix backend
echo "Setup complete. Run backend and frontend dev servers in separate terminals."
