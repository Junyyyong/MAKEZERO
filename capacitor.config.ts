import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.junyyyong.makezero",
  appName: "TAP to TEN",
  webDir: "dist",
  // The window behind the WebView, so launch does not flash a colour the app
  // never shows. It matches the studio card the app opens on — see
  // `--studio-orange`. It was the old dark-wood skin's brown, which the game
  // stopped using when it went to paper.
  backgroundColor: "#e95532",
  android: {
    backgroundColor: "#e95532",
  },
};

export default config;
