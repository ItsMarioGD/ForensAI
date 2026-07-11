!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "ForensIA"
OutFile "ForensIA-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\ForensIA"
InstallDirRegKey HKCU "Software\ForensIA" ""
RequestExecutionLevel user

!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

Section "ForensIA" SecMain
  SetOutPath "$INSTDIR"
  File /r "dist\*"
  File /r "electron\*"
  File /r "api\*"
  File /r "utils\*"
  File "requirements.txt"

  CreateDirectory "$SMPROGRAMS\ForensIA"
  CreateShortCut "$SMPROGRAMS\ForensIA\ForensIA.lnk" "$INSTDIR\ForensIA.exe"
  CreateShortCut "$DESKTOP\ForensIA.lnk" "$INSTDIR\ForensIA.exe"

  WriteRegStr HKCU "Software\ForensIA" "" $INSTDIR
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA" "DisplayName" "ForensIA"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA" "Publisher" "ForensIA Team"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA" "DisplayIcon" "$INSTDIR\ForensIA.exe"
SectionEnd

Section "Start Menu" SecStartMenu
  CreateShortCut "$SMPROGRAMS\ForensIA\ForensIA.lnk" "$INSTDIR\ForensIA.exe"
SectionEnd

Section "Desktop Shortcut" SecDesktop
  CreateShortCut "$DESKTOP\ForensIA.lnk" "$INSTDIR\ForensIA.exe"
SectionEnd

Function .onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Section "Uninstall"
  Delete "$INSTDIR\*"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\ForensIA\ForensIA.lnk"
  Delete "$DESKTOP\ForensIA.lnk"
  RMDir "$SMPROGRAMS\ForensIA"
  DeleteRegKey HKCU "Software\ForensIA"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ForensIA"
SectionEnd

Function un.onUninstallSuccess
  HideWindow
  MessageBox MB_ICONINFORMATION|MB_OK "$(^Name) ha sido desinstalado correctamente."
FunctionEnd