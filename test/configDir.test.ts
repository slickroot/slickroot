import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { slickrootConfigDir } from "../src/configDir.ts";

test("uses XDG_CONFIG_HOME when it is set", () => {
  assert.equal(slickrootConfigDir({ XDG_CONFIG_HOME: "/xdg" }, "/home/maya"), join("/xdg", "slickroot"));
});

test("falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
  assert.equal(slickrootConfigDir({}, "/home/maya"), join("/home/maya", ".config", "slickroot"));
});

test("falls back to ~/.config when XDG_CONFIG_HOME is empty", () => {
  assert.equal(slickrootConfigDir({ XDG_CONFIG_HOME: "" }, "/home/maya"), join("/home/maya", ".config", "slickroot"));
});
