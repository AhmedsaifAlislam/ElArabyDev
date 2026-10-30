@echo off
rem تشغيل خدمة Excel Autofix المحلية للمتصفح (127.0.0.1:8765)
cd /d "%~dp0"
echo Starting Excel Autofix Service at http://127.0.0.1:8765 ...
python service.py
pause
