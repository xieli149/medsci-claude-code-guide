import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MODEL = "Pro/MiniMaxAI/MiniMax-M2.7";
const home = os.homedir();
const claudeDir = path.join(home, ".claude");
const settingsPath = path.join(claudeDir, "settings.json");
const onboardingPath = path.join(home, ".claude.json");

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`配置文件不是有效 JSON，未做修改：${file}`);
  }
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  fs.copyFileSync(file, `${file}.backup-${stamp}`);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readSecret(label) {
  const supplied = process.env.SILICONFLOW_API_KEY?.trim();
  if (supplied) return Promise.resolve(supplied);
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("请在 PowerShell 或 macOS 终端中运行此文件。");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const previousRawMode = process.stdin.isRaw;
    process.stdout.write(label);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(Boolean(previousRawMode));
      process.stdin.pause();
    };

    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("已取消配置。"));
        return;
      }
      if (character === "\r" || character === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value.trim());
        return;
      }
      if (character === "\u007f" || character === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (character >= " ") {
        value += character;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

async function main() {
  console.log("\n硅基流动 × Claude Code 配置助手");
  console.log("API Key 只会写入你电脑上的 ~/.claude/settings.json。\n");

  const apiKey = await readSecret("请粘贴以 sk- 开头的 SiliconFlow API Key（输入会显示为 *）：");
  if (!apiKey.startsWith("sk-") || apiKey.length < 12) {
    throw new Error("API Key 格式不正确，应当以 sk- 开头。未做修改。");
  }

  fs.mkdirSync(claudeDir, { recursive: true });
  const currentSettings = readJson(settingsPath);
  const currentOnboarding = readJson(onboardingPath);
  backup(settingsPath);
  backup(onboardingPath);

  writeJson(settingsPath, {
    ...currentSettings,
    env: {
      ...(currentSettings.env ?? {}),
      ANTHROPIC_BASE_URL: "https://api.siliconflow.cn",
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL,
    },
  });
  writeJson(onboardingPath, {
    ...currentOnboarding,
    hasCompletedOnboarding: true,
  });

  console.log("\n✓ 配置成功");
  console.log(`✓ 模型：${MODEL}`);
  console.log("✓ 已保留原有配置；如有旧文件，已在同目录创建 backup 备份");
  console.log("\n现在请关闭终端，重新打开后，在练习文件夹中运行：claude\n");
}

main().catch((error) => {
  console.error(`\n配置失败：${error.message}`);
  process.exitCode = 1;
});
