import { describe, expect, test } from "bun:test";
import { resolveOpenPXConfigPaths } from "../../src/config/paths";

describe("resolveOpenPXConfigPaths", () => {
  test("在 POSIX 平台上默认使用用户目录下的 .openpx", () => {
    const paths = resolveOpenPXConfigPaths({
      workspaceRoot: "/workspace/openpx",
      homeDir: "/home/alice",
      platform: "linux",
      env: {},
    });

    expect(paths.layers.find((layer) => layer.name === "user")?.path).toBe("/home/alice/.openpx/openpx.jsonc");
    expect(paths.layers.find((layer) => layer.name === "project")?.path).toBe(
      "/workspace/openpx/.openpx/openpx.jsonc",
    );
    expect(paths.capabilityDirectories.skills[0]).toBe("/home/alice/.openpx/skills");
  });

  test("在 Linux 上忽略 XDG_CONFIG_HOME，仍使用用户目录下的 .openpx", () => {
    const paths = resolveOpenPXConfigPaths({
      workspaceRoot: "/workspace/openpx",
      homeDir: "/home/alice",
      platform: "linux",
      env: {
        XDG_CONFIG_HOME: "/home/alice/.config-custom",
      },
    });

    expect(paths.layers.find((layer) => layer.name === "user")?.path).toBe("/home/alice/.openpx/openpx.jsonc");
  });

  test("在 macOS 上使用用户目录下的 .openpx", () => {
    const paths = resolveOpenPXConfigPaths({
      workspaceRoot: "/Users/alice/Code/openpx",
      homeDir: "/Users/alice",
      platform: "darwin",
      env: {},
    });

    expect(paths.layers.find((layer) => layer.name === "user")?.path).toBe("/Users/alice/.openpx/openpx.jsonc");
  });

  test("在 Windows 上也使用用户目录下的 .openpx", () => {
    const paths = resolveOpenPXConfigPaths({
      workspaceRoot: "C:\\Code\\openpx",
      homeDir: "C:\\Users\\Alice",
      platform: "win32",
      env: {
        APPDATA: "C:\\Users\\Alice\\AppData\\Roaming",
        ProgramData: "C:\\ProgramData",
      },
    });

    expect(paths.layers.find((layer) => layer.name === "user")?.path).toBe(
      "C:\\Users\\Alice\\.openpx\\openpx.jsonc",
    );
    expect(paths.layers.find((layer) => layer.name === "project")?.path).toBe(
      "C:\\Code\\openpx\\.openpx\\openpx.jsonc",
    );
    expect(paths.layers.find((layer) => layer.name === "project-local")?.path).toBe(
      "C:\\Code\\openpx\\.openpx\\settings.local.jsonc",
    );
  });

  test("缺少用户目录信息时直接报错，而不是回退到 workspaceRoot", () => {
    expect(() =>
      resolveOpenPXConfigPaths({
        workspaceRoot: "/workspace/openpx",
        platform: "linux",
        env: {},
      })
    ).toThrow("cannot resolve home directory");
  });
});
