; Custom-NSIS-Skript für den Windows-Installer (electron-builder).
; Setzt den Default-Zielordner bei der Erstinstallation auf den Downloads-
; Ordner des Nutzers. Der Nutzer kann im Wizard weiterhin frei einen anderen
; Zielordner wählen (siehe quasar.config.js -> nsis.allowToChangeInstallationDirectory).
;
; Funktionsweise: electron-builder liest beim Setup-Start den Registry-Wert
;   HKCU/HKLM\Software\<AppId>\InstallLocation
; und nutzt ihn als Vorschlag für INSTDIR. Wir setzen den Wert VOR dem
; ersten Prüfen (`!macro preInit`) auf $PROFILE\Downloads\<ProductName>.
;
; Den Vorschlag nur setzen, solange noch keine Installation eingetragen ist.
; Bei einem Auto-Update (electron-updater startet den Installer silent) steht
; dort bereits der Ort der bestehenden Installation, und den behalten wir.
; Vorher wurde der Wert bei jedem Lauf überschrieben: Jedes Update landete in
; Downloads\Hitster, die Installation am gewählten Ort blieb alt liegen.

!macro hitsterDefaultInstallLocation ROOT
  ReadRegStr $0 ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $0 "" 0 +2
    WriteRegExpandStr ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Downloads\${PRODUCT_NAME}"
!macroend

!macro preInit
  SetRegView 64
  !insertmacro hitsterDefaultInstallLocation HKCU
  !insertmacro hitsterDefaultInstallLocation HKLM
  SetRegView 32
  !insertmacro hitsterDefaultInstallLocation HKCU
  !insertmacro hitsterDefaultInstallLocation HKLM
!macroend

; Immer pro Benutzer installieren, ohne die Seite „Für alle Benutzer / Nur für
; mich". Eine Installation für alle Benutzer liegt unter HKLM und in Program
; Files, die bestehende unter HKCU bliebe daneben stehen: zwei Hitster-
; Installationen. So ersetzt auch ein von Hand geladenes Setup die bestehende
; Installation wie ein Auto-Update. electron-builder deinstalliert die alte
; Version des gleichen Kontexts (HKCU) vor dem Kopieren, auch wenn im Wizard
; ein anderer Ordner gewählt wird; vorgeschlagen ist der bisherige
; (InstallLocation, siehe oben).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
