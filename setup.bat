@echo off
setlocal
if not exist backend\.env (
  copy backend\.env.example backend\.env >nul
  echo Created backend\.env from .env.example.
  echo Edit DATABASE_URL and JWT_SECRET, then run setup.bat again.
  exit /b 0
)
call npm ci --prefix backend || exit /b 1
call npm ci --prefix frontend || exit /b 1
call npm run db:generate --prefix backend || exit /b 1
call npm run db:migrate --prefix backend || exit /b 1
echo Setup complete.
endlocal
