/**
 * Deklarasi ambient utk package `web-push` (v3.x — API flat/legacy:
 * generateVAPIDKeys / setVapidDetails / sendNotification). Package tidak
 * menyertakan file types, jadi kami deklarasi manual sesuai runtime-nya.
 */
declare module 'web-push' {
  export interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }
  /** Buat pasangan kunci VAPID (base64url). */
  export function generateVAPIDKeys(): VapidKeys;
  /**
   * Set detail VAPID global (per instance). subject wajib URL https: atau
   * mailto:. Dipanggil sebelum sendNotification.
   */
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export interface PushSubscriptionJSON {
    endpoint: string;
    expirationTime?: number | string | null;
    keys: { p256dh: string; auth: string };
  }
  export interface SendNotificationOptions {
    TTL?: number;
    contentEncoding?: string;
  }
  export interface WebPushResponse {
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }
  /** Kirim 1 push ke subscription. 404/410 = subscription mati (hapus). */
  export function sendNotification(
    subscription: PushSubscriptionJSON,
    payload?: string,
    options?: SendNotificationOptions
  ): Promise<WebPushResponse>;
}
