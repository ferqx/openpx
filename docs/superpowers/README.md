# Superpowers Docs Policy

This directory exists for compatibility with `superpowers`-related skills and templates.

It is not the top-level documentation authority for the repo.

## Authority Order

When documents conflict, interpret them in this order:

1. `AGENTS.md`
2. `ROADMAP.md`
3. `docs/README.md`
4. `docs/active/`
5. `docs/work-packages/`
6. `docs/historical/`
7. compatibility copies under `docs/superpowers/`

## Required Rules For Superpowers-Generated Docs

Any future document created or updated under `docs/superpowers/` must follow the repo documentation policy.

At minimum:

- include `Date:`
- include `Status: Active | Working | Historical`
- include `Related milestone:` when relevant
- include `Supersedes:` or `Superseded by:` when relevant
- avoid creating a second active baseline for the same topic
- prefer updating an existing active document over creating a parallel redesign

## Canonical Locations

Use these directories as the semantic source of truth:

- `docs/active/` for active baselines
- `docs/work-packages/` for current execution slices
- `docs/historical/` for superseded material

`docs/superpowers/` may temporarily retain compatibility copies or skill-shaped working files, but those files must not override the canonical documents above.

## Migration Rule

If a `superpowers` skill must write into `docs/superpowers/` for compatibility reasons:

- keep the document aligned with the canonical status model
- point to the canonical active or historical document when one exists
- do not treat the `docs/superpowers/` copy as a competing roadmap or baseline

## Practical Default

For future repo work:

- create or update canonical docs first when possible
- use `docs/superpowers/` only when a skill or template requires that path
- if both exist, canonical docs win
