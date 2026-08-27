/**
 * Mock Nooks client.
 *
 * In production the assistant's tools call the Nooks API. In this repo they
 * call this in-memory client, backed by `fixtures/data.json`. It is read-only
 * and deterministic — the same query returns the same records every time, so two
 * runs of the same request are comparable.
 *
 * The client is intentionally a thin, faithful data layer.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Account,
  Call,
  Email,
  FixtureData,
  Prospect,
  Workspace,
} from './types';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'data.json');

export class NooksClient {
  private data: FixtureData;

  constructor(fixturePath: string = FIXTURE_PATH) {
    this.data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  getWorkspace(): Workspace {
    return this.data.workspace;
  }

  // ---- Accounts ----

  getAccount(accountId: string): Account | null {
    return this.data.accounts.find((a) => a.id === accountId) ?? null;
  }

  /**
   * Resolve a name or domain to an account.
   *
   * An exact name or domain match wins outright. Otherwise this falls back to a
   * substring match and returns **every** hit, so the caller can report the
   * ambiguity rather than silently working on the wrong company.
   *
   * Returns the account, an array of candidates when more than one matches, or
   * null when nothing does.
   */
  findAccountByName(name: string): Account | Account[] | null {
    const needle = name.trim().toLowerCase();
    const exact = this.data.accounts.find(
      (a) => a.name.toLowerCase() === needle || a.domain.toLowerCase() === needle,
    );
    if (exact) return exact;

    const partial = this.data.accounts.filter((a) =>
      a.name.toLowerCase().includes(needle),
    );
    if (partial.length === 0) return null;
    return partial.length === 1 ? partial[0] : partial;
  }

  listAccounts(filter?: { stage?: string }): Account[] {
    return this.data.accounts.filter(
      (a) => !filter?.stage || a.stage === filter.stage,
    );
  }

  // ---- Prospects ----

  getProspect(prospectId: string): Prospect | null {
    return this.data.prospects.find((p) => p.id === prospectId) ?? null;
  }

  listProspects(accountId: string): Prospect[] {
    return this.data.prospects.filter((p) => p.accountId === accountId);
  }

  // ---- Calls ----

  getCall(callId: string): Call | null {
    return this.data.calls.find((c) => c.id === callId) ?? null;
  }

  listCalls(accountId: string): Call[] {
    return this.data.calls.filter((c) => c.accountId === accountId);
  }

  // ---- Emails ----

  getEmail(emailId: string): Email | null {
    return this.data.emails.find((e) => e.id === emailId) ?? null;
  }

  listEmails(accountId: string): Email[] {
    return this.data.emails.filter((e) => e.accountId === accountId);
  }

}
