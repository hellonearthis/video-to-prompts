@echo off
setlocal
echo =====================================================================
echo  llama-server Launcher for Video to Prompts (Vision Model Support)
echo =====================================================================
echo.
set PORT=8081

if not "%~1"=="" set MODEL_PATH=%~1
if not "%~2"=="" set MMPROJ_PATH=%~2
if not "%~3"=="" set PORT=%~3

if "%MODEL_PATH%"=="" (
    echo Usage:
    echo   start-llama.bat ^<path_to_model.gguf^> ^<path_to_mmproj.gguf^> [port]
    echo.
    echo Example:
    echo   start-llama.bat "models\qwen2.5-vl-7b-instruct-q4_k_m.gguf" "models\mmproj-qwen2.5-vl-7b-instruct-f16.gguf" 8081
    echo.
    set /p MODEL_PATH="Enter path to model .gguf file: "
    set /p MMPROJ_PATH="Enter path to mmproj .gguf file: "
)

echo.
echo Launching llama-server on port %PORT% with mmproj projector...
llama-server.exe -m "%MODEL_PATH%" --mmproj "%MMPROJ_PATH%" --port %PORT% -c 16384 -ngl 99 --host 127.0.0.1
pause
