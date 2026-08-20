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
; Bei einem Auto-Update ist der Wert bereits durch die vorherige Installation
; gesetzt (auf den vom Nutzer gewählten Ort) – der Installer läuft dann silent
; über electron-updater und behält den bestehenden Pfad bei.

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Downloads\${PRODUCT_NAME}"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Downloads\${PRODUCT_NAME}"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Downloads\${PRODUCT_NAME}"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Downloads\${PRODUCT_NAME}"
!macroend
