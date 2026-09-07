import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { randomHex } from "./utils/common.js";

export interface AndroidDevice {
  display: string;
  product: string;
  device: string;
  board: string;
  model: string;
  fingerprint: string;
  bootId: string;
  procVersion: string;
  imei: string;
  brand: string;
  bootloader: string;
  baseBand: string;
  version: {
    incremental: string;
    release: string;
    codename: string;
    sdk: number;
  };
  simInfo: string;
  osType: string;
  macAddress: string;
  ipAddress: number[];
  wifiBssid: string;
  wifiSsid: string;
  imsiMd5: number[];
  androidId: string;
  apn: string;
  vendorName: string;
  vendorOsName: string;
  openUdid: string;
  sessionUid?: string;
  sessionSid?: string;
  sessionVkey?: number;
  sessionSaveTime?: number;
  qimei?: string;
  qimei36?: string;
  qimeiSaveTime?: number;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function randomImei(): string {
  const digits: number[] = [];
  for (let i = 0; i < 14; i += 1) digits.push(randomInt(10));
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let value = digits[i]!;
    if (i % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }
  digits.push((10 - (sum % 10)) % 10);
  return digits.join("");
}

export function makeDefaultDevice(): AndroidDevice {
  const randomDecimal = (digits: number): string =>
    String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, "0");
  return {
    display: `QMAPI.${randomDecimal(6)}.001`,
    product: "iarim",
    device: "sagit",
    board: "eomam",
    model: "MI 6",
    fingerprint: `xiaomi/iarim/sagit:10/eomam.200122.001/${randomDecimal(7)}:user/release-keys`,
    bootId: randomUUID(),
    procVersion: `Linux 5.4.0-54-generic-${randomHex(4)} (android-build@google.com)`,
    imei: randomImei(),
    brand: "Xiaomi",
    bootloader: "U-boot",
    baseBand: "",
    version: { incremental: "5891938", release: "10", codename: "REL", sdk: 29 },
    simInfo: "T-Mobile",
    osType: "android",
    macAddress: "00:50:56:C0:00:08",
    ipAddress: [10, 0, 1, 3],
    wifiBssid: "00:50:56:C0:00:08",
    wifiSsid: "<unknown ssid>",
    imsiMd5: Array.from({ length: 16 }, () => randomInt(256)),
    androidId: randomHex(8),
    apn: "wifi",
    vendorName: "MIUI",
    vendorOsName: "qmapi",
    openUdid: randomUUID().replace(/-/g, "")
  };
}

export class DeviceManager {
  private readonly path: string;
  private device?: AndroidDevice;

  constructor(dataDir: string, fileName = "device.json") {
    this.path = resolve(dataDir, fileName);
  }

  async getDevice(): Promise<AndroidDevice> {
    if (this.device) return this.device;
    try {
      const raw = readFileSync(this.path, "utf-8");
      this.device = JSON.parse(raw) as AndroidDevice;
    } catch {
      this.device = makeDefaultDevice();
      await this.save();
    }
    return this.device!;
  }

  async save(): Promise<void> {
    if (!this.device) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.device, null, 2)}\n`, "utf-8");
    renameSync(temp, this.path);
  }

  async applyQimei(q16: string, q36: string): Promise<void> {
    const device = await this.getDevice();
    device.qimei = q16;
    device.qimei36 = q36;
    device.qimeiSaveTime = Math.floor(Date.now() / 1000);
    await this.save();
  }

  async setSession(session: { uid: string; sid: string; vkey?: number }): Promise<void> {
    const device = await this.getDevice();
    device.sessionUid = session.uid;
    device.sessionSid = session.sid;
    device.sessionVkey = session.vkey ?? 0;
    device.sessionSaveTime = Math.floor(Date.now() / 1000);
    await this.save();
  }

  pathForDebug(): string {
    return join(this.path ?? "", "");
  }
}
