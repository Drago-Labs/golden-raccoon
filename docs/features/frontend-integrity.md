# Frontend integrity

The monitor records a dApp entry page as text. It extracts script tags, hashes them, and copies four security headers: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, and Referrer-Policy.

An external script is hashed as its URL. An inline script is hashed as its source text. Neither is downloaded further and neither is executed.

A diff lists hashes that appeared or disappeared and headers whose values changed. A new origin that is not the page origin, and any script tag without an integrity attribute, is a finding.

A change means the served bytes or headers differed. It does not by itself mean the site was compromised, and an unchanged hash does not prove the server is honest.
