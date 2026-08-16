Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("Wscript.Shell")
' Get the folder where this VBS file lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
' Run the Python script from the same folder
ws.Run "python """ & scriptDir & "\excel_app.py""", 0, False
