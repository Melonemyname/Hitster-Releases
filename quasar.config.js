const { configure } = require('quasar/wrappers');

module.exports = configure(function (ctx) {
  return {
    boot: ['song-data'],
    
    css: [
      'app.scss'
    ],

    extras: [
      'roboto-font',
      'material-icons'
    ],

    build: {
      target: {
        browser: ['es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
        node: 'node16'
      },

      // Desktop-App (Electron, file://) braucht 'hash' – 'history' bricht dort.
      vueRouterMode: ctx.mode.electron ? 'hash' : 'history',
      // App-Version im Renderer verfügbar machen (für den Update-Check).
      env: {
        APP_VERSION: require('./package.json').version
      },
      vitePlugins: []
    },

    devServer: {
      open: true,
      host: '0.0.0.0',
      port: 9000,
      historyApiFallback: true,
      // HMR deaktiviert: Vite würde sonst bei fehlgeschlagener HMR-WebSocket-Verbindung
      // (z. B. bei Cloudflare-Gästen) automatisch location.reload() aufrufen → Endlosloop.
      hmr: false,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        // Hochgeladene Dateien (z.B. Profilbilder) liegen im Dev-Modus auf dem
        // Backend – ohne diesen Proxy würden Avatare unter :9000 ins Leere laufen.
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true
        }
      }
    },

    framework: {
      config: {
        dark: 'auto'
      },
      plugins: ['Notify', 'Dark', 'Dialog']
    },

    animations: [],

    ssr: {
      pwa: false,
      prodPort: 3000,
      middlewares: [
        'render'
      ]
    },

    pwa: {
      workboxMode: 'generateSW',
      injectPwaMetaTags: true,
      swFilename: 'sw.js',
      manifestFilename: 'manifest.json',
      useCredentialsForManifestTag: false
    },

    cordova: {},
    capacitor: {},
    electron: {
      // electron-builder erzeugt Installer für Windows und Linux.
      bundler: 'builder',
      // Workaround für @quasar/app-vite <=1.11: esbuild interpretiert
      // 'src-electron/electron-main' ohne führendes './' als Package-Import
      // und bricht mit "Could not resolve" ab. Wir normalisieren die
      // Entry-Points hier explizit.
      extendElectronMainConf (cfg) {
        if (Array.isArray(cfg.entryPoints)) {
          cfg.entryPoints = cfg.entryPoints.map(e =>
            typeof e === 'string' && !e.startsWith('.') && !e.startsWith('/')
              ? './' + e
              : e
          )
        }
      },
      extendElectronPreloadConf (cfg) {
        if (Array.isArray(cfg.entryPoints)) {
          cfg.entryPoints = cfg.entryPoints.map(e =>
            typeof e === 'string' && !e.startsWith('.') && !e.startsWith('/')
              ? './' + e
              : e
          )
        }
      },
      builder: {
        appId: 'de.hitster.app',
        productName: 'Hitster',
        // Auto-Update: Releases liegen in einem separaten öffentlichen Repo,
        // damit `electron-updater` im installierten Client ohne Auth die
        // Update-Metadaten (latest*.yml) lesen kann. Der eigentliche
        // Quellcode bleibt im privaten Repo `Hitster`.
        publish: [
          { provider: 'github', owner: 'Melonemyname', repo: 'Hitster-Releases' },
        ],
        // Seed für den bearbeitbaren Songs-Ordner: liegt im gebauten Paket unter
        // resources/song-seed (Link-Listen + Metadaten-CSV + Manifest) bzw.
        // resources/song-seed/covers (Cover-PNGs). Kein Repo-Duplikat nötig.
        extraResources: [
          { from: 'src/assets/songs', to: 'song-seed', filter: ['**/*.txt', 'hitster-song-metadata.csv', 'editions.json'] },
          { from: 'src/assets/versions', to: 'song-seed/covers', filter: ['**/*.png'] }
        ],
        // Windows: NSIS-Installer (.exe)
        win: {
          target: ['nsis'],
        },
        // Dateiname OHNE Leerzeichen: sonst weichen Datei auf der Platte
        // ("Hitster Setup ….exe"), Eintrag in latest.yml (electron-builder
        // ersetzt Space -> "-": "Hitster-Setup-….exe") und GitHub-Asset-Name
        // (Upload-API ersetzt Space -> ".": "Hitster.Setup.….exe") voneinander
        // ab. electron-updater lädt dann den in latest.yml genannten Namen
        // und bekommt vom Server 404 -> Auto-Update stirbt geräuschlos.
        // Mit einem leerzeichenfreien Namen stimmt der Name überall überein.
        nsis: {
          artifactName: '${productName}-Setup-${version}.${ext}',
          // Wizard-Installer statt oneClick, damit der Nutzer beim Setup
          // einen Zielordner wählen kann. Default (siehe build/installer.nsh)
          // ist der Downloads-Ordner. perMachine=false = pro-User-Installation
          // ohne Admin-Rechte; passt zum Default-Pfad.
          oneClick: false,
          perMachine: false,
          allowElevation: false,
          allowToChangeInstallationDirectory: true,
          // Beim Auto-Update ruft electron-updater den Installer silent
          // auf; der Wizard erscheint dann nicht (der bereits gespeicherte
          // Zielordner bleibt erhalten).
          include: 'build/installer.nsh',
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          runAfterFinish: true,
        },
        // macOS: .dmg für Apple Silicon (arm64). Unsigniert (kein Apple-
        // Zertifikat) -> Gatekeeper verlangt beim ersten Öffnen Rechtsklick
        // -> „Öffnen"; Silent-Auto-Update ist ohne Signierung nicht möglich.
        mac: {
          target: [{ target: 'dmg', arch: 'arm64' }],
          category: 'public.app-category.games',
          identity: null,
        },
        // Linux: gängige Formate für die großen Distros
        // (AppImage unterstützt Auto-Update; deb/rpm nicht).
        // Über LINUX_TARGETS=AppImage,deb steuerbar (Komma-getrennt).
        // Hintergrund: rpmbuild verträgt Leerzeichen im Projektpfad schlecht,
        // deshalb kann rpm lokal ausgeschlossen werden. GitHub Actions baut
        // in einem sauberen Runner-Pfad und liefert dort weiterhin alle drei.
        linux: {
          target: (process.env.LINUX_TARGETS || 'AppImage,deb,rpm')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
          category: 'Game',
          // .deb/.rpm verlangen zwingend eine Maintainer-Angabe.
          // Bitte bei Bedarf durch echte E-Mail-Adresse ersetzen.
          maintainer: 'thorb <thorb@users.noreply.github.com>',
        },
      },
    },

    bex: {
      contentScripts: [
        'my-content-script'
      ]
    }
  }
});
