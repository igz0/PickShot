const { build } = require("electron-builder");

build({
  config: {
    // package.json の 'name' と異なる名前をつける場合に必要
    productName: "PickShot",
    // 出力ファイル名, 例: PickShot-0.1.0-win32-x64.exe
    artifactName: "${productName}-${version}-${platform}-${arch}.${ext}",
    copyright: "Copyright (c) 2025 igz0",
    // パッケージ対象とするファイル
    files: ["dist/**"],
    // 出力先とアセットファイル置き場
    directories: {
      output: "release",
      buildResources: "assets",
    },
    asar: true,
    publish: process.env.GH_TOKEN
      ? {
          // GitHub へデプロイする
          provider: "github",
          // とりあえず draft としてデプロイ
          releaseType: "draft", // or 'release', 'prerelease'
        }
      : null,
    // Windows 向け設定
    win: {
      // ICO ファイルが必要
      icon: "assets/icon.ico",
      // ターゲット
      target: [
        {
          target: "nsis",
          arch: ["x64"],
        },
        "zip",
      ],
    },
    // Windows インストーラの設定
    nsis: {
      // インストーラと分かる名前にする
      artifactName: "${productName}-${version}-win32-installer.exe",
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      installerIcon: "assets/icon.ico",
      installerHeaderIcon: "assets/icon.ico",
    },
    mac: {
      // PNG ファイルを使用（ICNSがない場合）
      icon: "assets/icon.png",
      /**
       * macOS では 'category' が必須
       * https://developer.apple.com/documentation/bundleresources/information_property_list/lsapplicationcategorytype
       */
      category: "public.app-category.photography",
      target: {
        // macOS では string 型のみ指定可, 配列は使えないことに注意
        target: "dmg", // or 'default', 'zip'
        // Intel, Apple Silicon ともにビルド可能
        arch: ["x64", "arm64"],
      },
      // コード署名しない場合は null の設定が必須
      identity: null,
      hardenedRuntime: false,
    },
    dmg: {
      sign: false,
    },
    linux: {
      // PNG ファイルを使用
      icon: "assets/icon.png",
      // どのディストロでも使える AppImage を選択
      target: ["AppImage"], // or 'deb', 'snap' など
      /**
       * Linux では 'category' が必要
       * https://specifications.freedesktop.org/menu-spec/latest/apa.html
       */
      category: "Graphics",
    },
  },
}).catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
