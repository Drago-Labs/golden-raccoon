/**
 * Synthetic fixtures for channel continuity.
 *
 * Every URL, handle and source label is an obvious placeholder. Nothing touches
 * a network or a paid social API.
 */
import type { ContinuityRequest } from "@/server/research/channel-continuity/schema";

const SUBJECT_ALPHA = {
  subjectId: "token-alpha",
  chainId: "stellar:pubnet",
  symbol: "ACME",
  issuer: "GALPHAISSUEREXAMPLEXXXXXXXXXXXXXXXXXXXX",
};

const SUBJECT_LOOKALIKE = {
  subjectId: "token-lookalike",
  chainId: "stellar:pubnet",
  symbol: "ACME",
  issuer: "GLOOKALIKEISSUEREXAMPLEXXXXXXXXXXXXXXXX",
};

/** Redirects plus a later domain change on the same canonical subject. */
export const redirectAndDomainChurn: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA],
  observations: [
    {
      observationId: "alpha-web-1",
      subjectId: "token-alpha",
      channelKind: "website",
      channelKey: "home",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
      sourceSnapshot: "Official site for ACME on Stellar",
      crossLinks: ["https://twitter.com/acme_official"],
    },
    {
      observationId: "alpha-web-2",
      subjectId: "token-alpha",
      channelKind: "website",
      channelKey: "home",
      observedAt: "2026-02-01T00:00:00.000Z",
      url: "https://www.acme-project.example/home",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "redirected",
      redirectChain: ["https://acme-project.example/", "https://www.acme-project.example/home"],
      sourceSnapshot: "Site moved behind www redirect",
      crossLinks: ["https://twitter.com/acme_official", "https://t.me/acme_channel"],
    },
    {
      observationId: "alpha-web-3",
      subjectId: "token-alpha",
      channelKind: "website",
      channelKey: "home",
      observedAt: "2026-02-15T00:00:00.000Z",
      url: "https://acme-docs.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
      sourceSnapshot: "Domain changed to docs subdomain",
      crossLinks: ["https://twitter.com/acme_official"],
    },
    {
      observationId: "alpha-tw-1",
      subjectId: "token-alpha",
      channelKind: "twitter",
      channelKey: "main",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://twitter.com/acme_official",
      handle: "acme_official",
      displayName: "ACME Project",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
    },
    {
      observationId: "alpha-tw-2",
      subjectId: "token-alpha",
      channelKind: "twitter",
      channelKey: "main",
      observedAt: "2026-02-20T00:00:00.000Z",
      url: "https://twitter.com/acme_hq",
      handle: "acme_hq",
      displayName: "ACME HQ",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
    },
  ],
};

/** Same ticker, different issuer — must stay on separate identity keys. */
export const sameSymbolSeparateIssuers: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA, SUBJECT_LOOKALIKE],
  observations: [
    {
      observationId: "alpha-site",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-02-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Directory A",
      fetchOutcome: "ok",
    },
    {
      observationId: "lookalike-site",
      subjectId: "token-lookalike",
      channelKind: "website",
      observedAt: "2026-02-01T00:00:00.000Z",
      url: "https://acme-proiect.example/",
      claimKind: "ambiguous",
      sourceLabel: "User tip",
      fetchOutcome: "ok",
      sourceSnapshot: "Lookalike domain using similar branding",
    },
  ],
};

/** Missing archive and source failure stay listed, not invented as channel state. */
export const missingArchiveAndSourceFailure: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA],
  observations: [
    {
      observationId: "alpha-ok",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Archive Mirror",
      fetchOutcome: "ok",
    },
    {
      observationId: "alpha-missing",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-15T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Archive Mirror",
      fetchOutcome: "missing_archive",
    },
    {
      observationId: "alpha-failed",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-20T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Live Probe",
      fetchOutcome: "source_failed",
    },
  ],
};

/** Private-network and localhost targets must be blocked without fetching. */
export const unsafePrivateRedirect: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA],
  observations: [
    {
      observationId: "alpha-safe",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
    },
    {
      observationId: "alpha-ssrf",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-10T00:00:00.000Z",
      url: "http://127.0.0.1/admin",
      claimKind: "user_supplied",
      sourceLabel: "User tip",
      redirectChain: ["https://acme-project.example/", "http://169.254.169.254/latest/meta-data/"],
      fetchOutcome: "redirected",
    },
  ],
};

/** Broken link after a healthy observation. */
export const brokenLinkSeries: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA],
  observations: [
    {
      observationId: "alpha-live",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "ok",
    },
    {
      observationId: "alpha-broken",
      subjectId: "token-alpha",
      channelKind: "website",
      observedAt: "2026-02-01T00:00:00.000Z",
      url: "https://acme-project.example/",
      claimKind: "canonical_reference",
      sourceLabel: "Issuer TOML",
      fetchOutcome: "broken",
    },
  ],
};

export const emptySample: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [],
  observations: [],
};

/** Hostile markup in snapshots and display names. */
export const hostileMarkup: ContinuityRequest = {
  observedAt: "2026-03-01T12:00:00.000Z",
  subjects: [SUBJECT_ALPHA],
  observations: [
    {
      observationId: "hostile-1",
      subjectId: "token-alpha",
      channelKind: "twitter",
      observedAt: "2026-01-01T00:00:00.000Z",
      url: "https://twitter.com/acme_official",
      handle: "acme_official",
      displayName: "<script>alert(1)</script>ACME",
      claimKind: "ambiguous",
      sourceLabel: "Scraped tip",
      fetchOutcome: "ok",
      sourceSnapshot: "Hello <b>world</b>\u202e sneaky",
    },
  ],
};
