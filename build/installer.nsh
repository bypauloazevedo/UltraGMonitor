!macro customInstall
  DetailPrint "Instalando o driver PawnIO (temperatura da CPU)..."
  ExecWait '"$INSTDIR\resources\pawnio\PawnIO_setup.exe" -install -silent'
  DetailPrint "Configurando pra abrir junto com o Windows..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\task.ps1" -Exe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::ExecToLog 'schtasks.exe /delete /tn "UltraGMonitor" /f'
  ${endIf}
!macroend
