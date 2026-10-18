@echo off
set CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" -nologo -target:winexe -out:%~dp0CCRTray.exe -r:System.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll %~dp0CCRTray.cs
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
echo BUILD OK: %~dp0CCRTray.exe
