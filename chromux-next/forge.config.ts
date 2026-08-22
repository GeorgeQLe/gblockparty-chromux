import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { OsxSignOptions } from "@electron/packager";

const osxSign = process.env.CHROMUX_NEXT_SIGN_IDENTITY
  ? { identity: process.env.CHROMUX_NEXT_SIGN_IDENTITY, continueOnError: false } as OsxSignOptions & { continueOnError: false }
  : undefined;

const osxNotarize = process.env.CHROMUX_NEXT_NOTARY_PROFILE
  ? { keychainProfile: process.env.CHROMUX_NEXT_NOTARY_PROFILE }
  : process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      }
    : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "dev.georgele.chromux.next",
    name: "Chromux Next",
    executableName: "chromux-next",
    icon: "build/icon",
    asar: true,
    extraResource: ["fixtures/subprocess-fixture.cjs", "scripts/update-helper.cjs", "scripts/update-helper-core.cjs"],
    // @electron/osx-sign enables hardened runtime and its Electron entitlements
    // by default; the release identity must be provided explicitly in CI/local qualification.
    ...(osxSign ? { osxSign } : {}),
    ...(osxNotarize ? { osxNotarize } : {})
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ name: "chromux_next" }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({})
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};

export default config;
