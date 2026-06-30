# Research Package Review Checklist

Use this checklist before a GPT-researched package becomes generated pages.

## GPT Pro Researcher

- Official or partner-official sources are listed with `checkedAt`, `scope`,
  and `language`.
- Each campaign fact has an `evidenceRefs` entry.
- Each item fact has an `evidenceRefs` entry.
- Public facts have `fieldEvidenceRefs` for the specific field being shown.
- Marketplace search links are not used as official evidence.
- Uncertain details are moved to `unresolvedQuestions`.
- Public caveats are moved to `publicVerificationNotes`.
- Every item has a `pageDecision` and reason.
- Every `pageDecision` includes search value, fact depth, acquisition
  complexity, variant explosion risk, and thin-page risk.
- Generated item pages are limited to goods with clear value.
- Character variants are grouped unless there is a reviewed reason to split.

## Codex Validation

- `node scripts/validate-research-package.mjs <package>` passes.
- The intentionally broken fixture fails validation.
- Source, evidence, asset, and item references resolve.
- Generated item slugs are unique.
- Affiliate and marketplace policies are consistent.
- No official fact is verified only by a marketplace reference.
- `pageGenerationPolicy.itemPages` generated/parent/deferred id lists match
  item `pageDecision` values.
- `publishBlocking: true` unresolved questions fail validation.
- Public notes do not contain internal Codex/GPT instructions.
- Existing repo checks still pass after import/generation.
- Image audit records repeated composite images as an improvement queue item
  instead of silently treating them as final.

## Human Review

- Campaign title, period, and partner names match official sources.
- Item grouping feels useful and not over-split.
- `generate` pages have enough unique value.
- Parent-card-only items do not need separate pages yet.
- Asset use is acceptable for archive/identification purposes.
- Marketplace searches are useful without implying price, stock, or authenticity.
- Original listed prices do not read as current marketplace prices.
- Internal unresolved questions are not visible on public pages.
- Import reports make raw package to generated output changes traceable.
- The generated output is reviewable and rollback-friendly.
- Product images are reviewed after the first generated page exists.
- Official item-specific images are preferred when available.
- Same-item official image cleanup is acceptable, but generated-from-scratch
  product images and collection-image crops are not accepted as routine fixes.

## GPT Review After Pilot

Ask GPT to review:

- whether the package evidence is sufficient,
- whether generated pages are too thin or duplicated,
- whether the schema misses fields needed for future campaigns,
- whether common components are actually generated rather than hand-copied,
- whether the image improvement queue is correctly prioritized,
- what the next generator-hardening step should be.

## Pilot Acceptance

The first pilot is accepted when:

- a golden package validates,
- one broken package fails for the expected reason,
- Codex can explain exactly what will be generated from `pageDecision`,
- generated candidates do not rely on unverified facts,
- the user can review the result without reading every source file manually,
- GPT agrees the workflow is ready for a new researched campaign attempt.
