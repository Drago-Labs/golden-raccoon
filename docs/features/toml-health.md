# Stellar.toml Health Audit

## Overview

Read-only audit of stellar.toml: fetch, parse, validate, probe endpoints, check backlinks.

## Method

Validates domain, fetches stellar.toml, parses with line-by-line parser, validates fields, probes endpoints with GET, checks backlinks via public ledger.

## Safety

Read-only. No authenticated requests. No state changes.
