import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_CHECK_INTERVAL_MS,
  detectInstallKind,
  isCheckDue,
  menuLabelFor,
  noticeFor,
  reduceUpdate,
  releasePageUrl,
  safeFeedOverride,
  type UpdateEvent,
  type UpdateState,
} from "../../desktop/src/main/update-policy.ts";

const run = (events: UpdateEvent[], from: UpdateState = { status: "idle" }) =>
  events.reduce(reduceUpdate, from);

test("detectInstallKind tells NSIS from MSI by the uninstaller next to the exe", () => {
  const base = { isPackaged: true, productName: "Cadence" };
  const nsisExe = "C:\\Users\\a\\AppData\\Local\\Programs\\cadence\\Cadence.exe";
  const uninstaller = "C:\\Users\\a\\AppData\\Local\\Programs\\cadence\\Uninstall Cadence.exe";
  assert.equal(
    detectInstallKind({ ...base, platform: "win32", execPath: nsisExe, exists: (p) => p === uninstaller }),
    "nsis",
  );
  assert.equal(
    detectInstallKind({ ...base, platform: "win32", execPath: "C:\\Program Files\\Cadence\\Cadence.exe", exists: () => false }),
    "msi",
  );
  assert.equal(detectInstallKind({ ...base, platform: "darwin", execPath: "/Applications/Cadence.app/x", exists: () => false }), "mac");
  assert.equal(detectInstallKind({ ...base, platform: "linux", execPath: "/opt/x", exists: () => true }), "unsupported");
  assert.equal(
    detectInstallKind({ ...base, isPackaged: false, platform: "darwin", execPath: "/x", exists: () => true }),
    "unsupported",
  );
});

test("a self-updating install downloads, then waits for the person to restart", () => {
  const state = run([
    { type: "check", manual: false },
    { type: "found", version: "0.1.27", kind: "mac" },
    { type: "progress", percent: 42.4 },
  ]);
  assert.deepEqual(state, { status: "downloading", version: "0.1.27", percent: 42 });
  assert.equal(menuLabelFor(state), "Downloading Update (42%)");
  assert.equal(noticeFor(state), null);

  const ready = run([{ type: "downloaded", version: "0.1.27" }], state);
  assert.deepEqual(noticeFor(ready), { text: "Update ready. Restart to install.", action: "restart", actionLabel: "Restart" });
  assert.equal(menuLabelFor(ready), "Restart to Install Update");

  // Later checks, errors and "nothing new" never hide a downloaded update.
  assert.equal(run([{ type: "check", manual: true }, { type: "none" }, { type: "failed", message: "x" }], ready), ready);
});

test("an MSI install never downloads; it links to the release page", () => {
  const state = run([{ type: "check", manual: false }, { type: "found", version: "0.1.27", kind: "msi" }]);
  assert.deepEqual(state, {
    status: "available",
    version: "0.1.27",
    url: "https://github.com/pstepanovum/Cadence/releases/tag/desktop-v0.1.27",
  });
  assert.deepEqual(noticeFor(state), { text: "Cadence 0.1.27 is available.", action: "download", actionLabel: "Download" });
});

test("manual checks remember they were manual so the result can be shown", () => {
  assert.deepEqual(run([{ type: "check", manual: true }, { type: "none" }]), { status: "up-to-date", manual: true });
  assert.deepEqual(run([{ type: "check", manual: false }, { type: "failed", message: "offline" }]), {
    status: "error",
    manual: false,
    message: "offline",
  });
  // A check during a download does not interrupt it.
  const downloading: UpdateState = { status: "downloading", version: "0.1.27", percent: 10 };
  assert.equal(reduceUpdate(downloading, { type: "check", manual: false }), downloading);
});

test("checks are due on launch and after six hours", () => {
  assert.equal(isCheckDue(null, 0), true);
  assert.equal(isCheckDue(1000, 1000 + UPDATE_CHECK_INTERVAL_MS - 1), false);
  assert.equal(isCheckDue(1000, 1000 + UPDATE_CHECK_INTERVAL_MS), true);
});

test("the feed override accepts loopback http only", () => {
  assert.equal(safeFeedOverride("http://127.0.0.1:8765/"), "http://127.0.0.1:8765/");
  assert.equal(safeFeedOverride("http://localhost:8765/feed"), "http://localhost:8765/feed");
  assert.equal(safeFeedOverride("https://evil.example/"), null);
  assert.equal(safeFeedOverride("http://192.168.1.2/"), null);
  assert.equal(safeFeedOverride("not a url"), null);
  assert.equal(safeFeedOverride(undefined), null);
});

test("release page links fall back to latest for odd versions", () => {
  assert.equal(releasePageUrl("1.2.3"), "https://github.com/pstepanovum/Cadence/releases/tag/desktop-v1.2.3");
  assert.equal(releasePageUrl("1.2.3-beta.1"), "https://github.com/pstepanovum/Cadence/releases/latest");
});
