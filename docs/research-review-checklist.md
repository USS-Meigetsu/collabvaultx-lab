# Research Package Review Checklist

Use this checklist before a GPT-researched package becomes generated pages.

## GPT Pro Researcher

- Official or partner-official sources are listed with `checkedAt`, `scope`,
  and `language`.
- Each campaign fact has an `evidenceRefs` entry.
- Each item fact has an `evidenceRefs` entry.
- Marketplace search links are not used as official evidence.
- Uncertain details are moved to `unresolvedQuestions`.
- Every item has a `pageDecision` and reason.
- Generated item pages are limited to goods with clear value.
- Character variants are grouped unless there is a reviewed reason to split.

## Codex Validation

- `node scripts/validate-research-package.mjs <package>` passes.
- The intentionally broken fixture fails validation.
- Source, evidence, asset, and item references resolve.
- Generated item slugs are unique.
- Affiliate and marketplace policies are consistent.
- No official fact is verified only by a marketplace reference.
- Existing repo checks still pass after import/generation.

## Human Review

- Campaign title, period, and partner names match official sources.
- Item grouping feels useful and not over-split.
- `generate` pages have enough unique value.
- Parent-card-only items do not need separate pages yet.
- Asset use is acceptable for archive/identification purposes.
- Marketplace searches are useful without implying price, stock, or authenticity.
- The generated output is reviewable and rollback-friendly.

## GPT Review After Pilot

Ask GPT to review:

- whether the package evidence is sufficient,
- whether generated pages are too thin or duplicated,
- whether the schema misses fields needed for future campaigns,
- whether common components are actually generated rather than hand-copied,
- what the next generator-hardening step should be.

## Pilot Acceptance

The first pilot is accepted when:

- a golden package validates,
- one broken package fails for the expected reason,
- Codex can explain exactly what will be generated from `pageDecision`,
- generated candidates do not rely on unverified facts,
- the user can review the result without reading every source file manually,
- GPT agrees the workflow is ready for a new researched campaign attempt.
