import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("phone agent testers", () => {
  const wf = read(".github/workflows/agent-testers.yml");
  it("default to Flisk Inference, not Claude", () => {
    expect(wf).toMatch(/llm_base_url:[\s\S]*?default: "https:\/\/inference\.flisk\.si"/);
    expect(wf).toMatch(/model:[\s\S]*?default: flisk-wolf-agent/);
  });
  it("build the chat shell, Android only", () => {
    expect(wf).toMatch(/app_dir:[\s\S]*?default: testers\/chat-wrapper/);
    expect(wf).toMatch(/ios_personas:[\s\S]*?default: "none"/);
    const cap = JSON.parse(read("testers/chat-wrapper/capacitor.config.json"));
    expect(cap.server.url).toBe("https://chat.flisk.si");
    expect(wf).toContain(`default: ${cap.appId}`);
  });
  it("personas are valid and every Android default exists", () => {
    const personas = JSON.parse(read("personas.json"));
    const ids = new Set(personas.filter((p) => p.platform === "android").map((p) => p.id));
    const def = /android_personas:[\s\S]*?default: "([^"]+)"/.exec(wf)[1].split(",");
    for (const id of def) expect(ids.has(id)).toBe(true);
    for (const p of personas) expect(p.goal).toContain("Signed out");
  });
  it("drops the repo's skills before a non-Claude model runs the agent", () => {
    expect(read("scripts/llm_env.sh")).toMatch(/rm -rf \.claude\/skills/);
  });
  it("setup.sh is valid bash", () => {
    expect(spawnSync("bash", ["-n", "setup.sh"], { cwd: new URL("..", import.meta.url).pathname }).status).toBe(0);
  });
});
