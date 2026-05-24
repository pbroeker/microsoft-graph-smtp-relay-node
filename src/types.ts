import type { IPv4, IPv6 } from 'ipaddr.js';

export type EventHandler = (...args: any[]) => void | boolean | Promise<void | boolean>;

export interface AllowedNetwork {
  network: IPv4 | IPv6;
  bits: number;
}

export interface EnvelopeInfo {
  mailFrom: string;
  rcptTo: string[];
}
