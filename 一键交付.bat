@echo off
REM ===================================================================
REM  MoneyNote one-click delivery.  Double-click this file.
REM
REM  It does, in order, with no questions asked:
REM    1. check environment, get a GitHub token (asks once, ever)
REM    2. create the public repo github.com/<your-name>/moneynote
REM    3. push the code
REM    4. trigger the iOS + Android NATIVE builds and simulator
REM       recordings on GitHub's free macOS / Ubuntu machines
REM    5. wait for them, download both recordings into dist\
REM    6. print what you got and what to do next
REM
REM  NOTE: this file is deliberately pure ASCII -- NOT ONE character
REM  outside ASCII, comments included, same rule as run-tests.bat.
REM
REM  cmd.exe parses .bat files byte-by-byte using the console codepage
REM  (GBK on Chinese Windows).  A UTF-8 Chinese character is 3 bytes;
REM  cmd counts them as ~1.5 characters, loses track of where it is,
REM  and the NEXT line gets its first characters eaten.  So a Chinese
REM  comment on line N silently corrupts the command on line N+1:
REM      node "scripts\deploy.mjs"   becomes   oy.mjs
REM  and the comment itself gets run as a command.
REM  chcp 65001 cannot fix this -- that line gets mis-parsed too.
REM  All Chinese output comes from scripts\deploy.mjs instead.
REM  (This rule was learned the hard way, in this very file.)
REM
REM  Pass "nopause" as an argument to skip the pause (for automation).
REM  Double-clicking passes no argument, so the window stays open.
REM ===================================================================

chcp 65001 >nul 2>&1
cd /d "%~dp0"

node "scripts\deploy.mjs"
set "EXITCODE=%ERRORLEVEL%"

if /i not "%~1"=="nopause" (
  echo.
  pause
)

exit /b %EXITCODE%
