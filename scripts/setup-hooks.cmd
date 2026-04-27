@echo off
REM Activates repo-tracked git hooks. Run once per clone (Windows).

cd /d "%~dp0\.."
git config core.hooksPath .githooks
if errorlevel 1 (
  echo Failed to set core.hooksPath
  exit /b 1
)

echo Git hooks activated (.githooks/)
echo   pre-commit: blocks TS syntax errors before they reach the repo
echo.
echo To disable: git config --unset core.hooksPath
