# KUHS Papers & Study Notes

A professional KUHS MBBS study site built around the official Medical UG question-paper archive and a structured notes library.

## What is included

- 831 KUHS Medical UG paper records in the supplied master index.
- 779 paper records with extracted question text.
- 52 PDF-only records retained in the catalog with their official KUHS links.
- Subject, phase, year, scheme, search, bookmarks, question-bank and paper-reader views.
- Original-PDF access through the site's Vercel server route.
- Four structured study-note sets covering Anatomy, Ophthalmology and ENT.
- Note reader with year navigation, nested lists, Markdown tables, code/ASCII blocks, formulas, external links, zoom and browser PDF/print output.
- No login, database or application API key is required.

## Stack

TanStack Start + TanStack Router, React, Vite, Tailwind CSS, Nitro/Vercel, Lucide icons and static JSON data.

The production Vercel target is configured explicitly as TanStack Start. Vercel's current TanStack Start guidance supports deployment through Nitro and Git integration. See the official docs linked below.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:8080`.

Production build:

```bash
npm run build
npm run preview
```

Content/data validation:

```bash
npm test
```

## GitHub + Vercel deployment

Use **one GitHub repository** and **one Vercel project** for this site.

Recommended repository name:

`KUHS-Papers-Study-Notes`

Recommended Vercel project name:

`kuhs-papers-study-notes`

Keep the repository root as the Vercel Root Directory (`./`). The `main` branch should be the production branch. Vercel's Git integration creates deployments from the connected repository; pushes to the production branch update the production deployment.

See [`PUSH_TO_GITHUB.md`](./PUSH_TO_GITHUB.md) for the Push Bridge v5.1 workflow.

## Data and attribution

The paper catalog and extracted text shipped here come from the supplied KUHS Medical UG dataset. The application links back to the Kerala University of Health Sciences source for original PDFs.

The notes are a separate study-note dataset. They should be used as study material alongside the official paper PDFs and the learner's normal textbooks/syllabus.

## Security

Do not commit GitHub personal access tokens, Vercel tokens, webhook secrets or other private credentials. This repository is intended to contain only the application and its public/static data.

## Official deployment references

- TanStack Start hosting guide: https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- Vercel Git Integration: https://vercel.com/kb/git-integration
