' Starts the NSA presence agent without a console window.
' Used by the Windows scheduled task, or by a shortcut in the Startup folder.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.Run "cmd /c node --env-file-if-exists=.env dist\src\index.js >> agent.log 2>&1", 0, False
