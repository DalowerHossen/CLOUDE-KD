# Changelog

All notable changes are listed here. The project follows semantic versioning once `v1.0.0` is tagged.

## Unreleased

### STEP 01 - Foundation, contracts and guardrails

- Fixed after the first CI run: pinned all GitHub Actions to commit SHAs, split the deploy workflow, corrected the Trivy action version, added Dependabot cooldown and major-update rules, replaced the nginx `$host` forwarding with an explicit `APP_DOMAIN` template, made the Lighthouse job wait for the home page.
- Upgraded to Next.js 16.4.1, React 19, Node 22, ESLint 9 (flat config), Sentry 11, nodemailer 10, sharp 0.35, tiptap 3, @react-pdf/renderer 4, @googleapis/drive 26. `npm audit --omit=dev` reports 0 vulnerabilities.

- Added the Next.js 16 (React 19, Node 22) scaffold with strict TypeScript, ESLint 9 flat config, Prettier and Husky hooks.
- Added guard scripts for language, tests, unfinished markers, path comments, `any`, console, card data, brand names, money arithmetic, secrets, migrations, dead links, ownership and commit messages.
- Added generators for barrels, `.env.example` and design token exports.
- Added the service container, all cross-STEP contracts, domain event names and the `withApi` request pipeline.
- Added the design system (tokens, themes, shadcn/ui components), the route group shells and the interface preview pages.
- Added CI/CD workflows, Docker and Netlify configuration, backup, restore and deploy scripts.
