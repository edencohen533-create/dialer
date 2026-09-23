import type { TelephonyProvider as ProviderName } from "@/generated/prisma/enums";

/** Normalized provider event, independent of vendor payload shape. */
export interface ProviderEvent {
  provider: ProviderName;
  /** Vendor event id – used for de-duplication. */
  eventId: string;
  type:
    | "leg.initiated"
    | "leg.answered"
    | "leg.bridged"
    | "leg.hangup"
    | "leg.machine_detection"
    | "recording.saved"
    | "other";
  legId: string;
  /** Our call id, when the vendor echoed it back (client_state). */
  callId?: string;
  leg?: "agent" | "lead";
  occurredAt?: Date;
  hangupCause?: string;
  hangupSource?: string;
  amdResult?: string;
  recordingDurationMs?: number;
  raw: unknown;
}

export interface DialAgentInput {
  callId: string;
  sipUsername: string;
  fromE164: string;
  timeoutSeconds: number;
}

export interface DialLeadInput {
  callId: string;
  agentLegId: string;
  toE164: string;
  fromE164: string;
  timeoutSeconds: number;
  record: boolean;
  amd: boolean;
}

export interface DialResult {
  legId: string;
  providerSessionId?: string;
  recordingId?: string;
}

export interface TelephonyAdapter {
  name: ProviderName;
  /** True when this adapter only simulates calls (must be shown clearly in the UI). */
  simulation: boolean;
  dialAgent(input: DialAgentInput): Promise<DialResult>;
  dialLead(input: DialLeadInput): Promise<DialResult>;
  hangupLeg(legId: string, commandId: string): Promise<void>;
  sendDtmf(legId: string, digits: string, commandId: string): Promise<void>;
  /** Is the leg still alive at the provider? `null` = unknown (provider unreachable). */
  isLegAlive(legId: string): Promise<boolean | null>;
  /** Short-lived browser login token for the WebRTC SDK. */
  createBrowserToken(userId: string): Promise<{ token: string; sipUsername: string; expiresAt: Date }>;
  /** Resolve a temporary download URL for a saved recording. */
  getRecordingDownloadUrl(recordingId: string): Promise<{ url: string; contentType: string } | null>;
}

export class TelephonyRequestTimeout extends Error {
  constructor(message = "telephony request timed out") {
    super(message);
    this.name = "TelephonyRequestTimeout";
  }
}
