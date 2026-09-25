; Revolution Kontabilisti — si Fiskale/Security:
; - Instalim në Program Files (folder i fshehur)
; - Start.cmd në %ProgramData%\RevolutionInvest\Revolution Kontabilisti-Launch\
; - Shortcut desktop/start menu → Start.cmd (jo .exe direkt)

!macro KontabilistiLaunchDir
  ReadEnvStr $R7 "PROGRAMDATA"
  StrCmp $R7 "" 0 +2
    StrCpy $R7 "C:\ProgramData"
  StrCpy $R7 "$R7\RevolutionInvest\${PRODUCT_NAME}-Launch"
!macroend

!macro WriteKontabilistiLaunchStub
  !insertmacro KontabilistiLaunchDir
  RMDir /r "$R7"
  CreateDirectory "$R7"
  FileOpen $R8 "$R7\Start.cmd" w
  FileWrite $R8 "@echo off$\r$\n"
  FileWrite $R8 "cd /d $\"$INSTDIR$\"$\r$\n"
  FileWrite $R8 "start $\"$\" $\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"$\r$\n"
  FileClose $R8
!macroend

!macro customInit
  ExecWait 'cmd /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T 2>nul' $0
  Sleep 800
!macroend

!macro customInstall
  SetDetailsPrint none
  SetDetailsView hide

  File "/oname=$PLUGINSDIR\security-lock.ps1" "${BUILD_RESOURCES_DIR}\security-lock.ps1"
  ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\security-lock.ps1" -Dir "$INSTDIR"' $0
  ExecWait 'cmd /c attrib +H "$INSTDIR"' $0

  !insertmacro WriteKontabilistiLaunchStub
  !insertmacro KontabilistiLaunchDir
  SetOutPath "$R7"
  File "/oname=$R7\app.ico" "${BUILD_RESOURCES_DIR}\icon.ico"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$R7\Start.cmd" "" "$R7\app.ico" 0
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$R7\Start.cmd" "" "$R7\app.ico" 0
  CreateShortCut "C:\Users\Public\Desktop\${PRODUCT_NAME}.lnk" "$R7\Start.cmd" "" "$R7\app.ico" 0
  ExecWait 'cmd /c attrib +H "$R7\app.ico"' $0
!macroend

!macro customUnInstall
  !insertmacro KontabilistiLaunchDir
  RMDir /r "$R7"
!macroend
