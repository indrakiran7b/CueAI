# CueAI → NotebookLM Upload Pack

This folder will hold markdown exports of the CueAI Confluence MVP.

## Files to upload (after export)

1. 01-CueAI-MVP-Product-and-Technical-Scope.md
2. 02-CueAI-Tech-Stack.md
3. 03-CueAI-Architecture.md
4. 04-CueAI-Week1-Status-Aug-3-8.md

## One-time setup

1. Restart Cursor (MCP already configured for NotebookLM + Atlassian)
2. In a terminal run:

```powershell
& "$env:APPDATA\Python\Python314\Scripts\nlm.exe" login
```

Sign in with your Google account in the Chrome window that opens.

3. Then run:

```powershell
cd C:\Users\Indra\cueai-android
powershell -File .\notebooklm-export\upload-to-notebooklm.ps1
```

Or ask the Cursor agent: "Upload CueAI MVP to NotebookLM"
