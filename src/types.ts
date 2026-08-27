/**
 * Shared domain types for the mock Nooks data layer.
 *
 * Four records: account → prospect → call / email. The README draws the same
 * graph. No sales background is needed for this exercise.
 */

/** The seller — one per install. Vector Labs, here. */
export interface Workspace {
  id: string;
  companyName: string;
  product: string;
  valueProps: string[];
}

/** A researched fact about an account or person, with a confidence rating. */
export interface Signal {
  type: string;
  detail: string;
  confidence: string;
}

/** A company we sell to. */
export interface Account {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employeeCount: number;
  /** 'prospecting' = actively worked, 'nurture' = deliberately parked. */
  stage: string;
  createdAt: string;
  /** Vendor research on the company: what they run and what they are dealing with. */
  enrichment: {
    summary: string;
    techStack: string[];
    signals: Signal[];
  };
}

/** A person at an account. Belongs to exactly one account. */
export interface Prospect {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  timezone: string;
  /** 'open' = fair game, 'nurture' = parked. Independent of the account's stage. */
  status: string;
  lastContactedAt: string | null;
  /** Vendor research on the person. Free text plus whatever signals were found. */
  enrichment: {
    notes: string;
    signals: Signal[];
  };
}

export interface TranscriptEntry {
  speaker: string;
  text: string;
}

/**
 * One phone attempt. Three separate artifacts: the dialer's outcome code
 * (`disposition`), a written `summary` of what was said, and — for a minority
 * of calls — a `transcript`.
 */
export interface Call {
  id: string;
  prospectId: string;
  accountId: string;
  date: string;
  durationSec: number;
  disposition: string;
  summary: string;
  transcript: TranscriptEntry[] | null;
}

/**
 * One email in the thread with a prospect — sent by the rep (`outbound`) or
 * received from the prospect (`inbound`). The substance is in `body`.
 */
export interface Email {
  id: string;
  prospectId: string;
  accountId: string;
  direction: 'outbound' | 'inbound';
  sentAt: string;
  subject: string;
  body: string;
  /** 'sent' | 'opened' | 'replied' | 'bounced' for outbound, 'received' for inbound. */
  status: string;
}

export interface FixtureData {
  workspace: Workspace;
  accounts: Account[];
  prospects: Prospect[];
  calls: Call[];
  emails: Email[];
}
