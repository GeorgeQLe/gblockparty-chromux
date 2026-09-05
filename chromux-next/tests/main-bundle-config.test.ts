import { describe, expect, it } from "vitest";
import config from "../vite.main.config";

describe("Electron main-process bundle", () => {
  it("keeps ws on its safe JavaScript masking and validation paths", () => {
    expect(config.define).toMatchObject({
      "process.env.WS_NO_BUFFER_UTIL": JSON.stringify("1"),
      "process.env.WS_NO_UTF_8_VALIDATE": JSON.stringify("1")
    });
  });
});
