# Push to GitHub — KUHS Papers & Study Notes

This project is prepared as a **new repository** and a **single Vercel application**.

## Names

- GitHub repo: `KUHS-Papers-Study-Notes`
- Vercel project: `kuhs-papers-study-notes`
- Production branch: `main`
- Repository root: this directory

## Push Bridge v5.1 workflow

The same bridge pattern used for MegaPLAN is suitable here: give the bridge the **contents of this ZIP/project root**, let it place the files at the repository root, then push the resulting commit to `main`.

The important detail is that the ZIP already has the application at its root. Do **not** create an extra `kuhs_final_build/` directory inside the GitHub repository.

The intended flow is:

`Push Bridge → GitHub main → Vercel Git Integration → one production deployment`

After the repository is connected to Vercel, normal pushes to the production branch trigger the deployment flow. Vercel also creates preview deployments for branches/PRs through Git integration.

## Manual fallback

From a clean clone of the new repository:

```bash
git clone https://github.com/YOUR_USERNAME/KUHS-Papers-Study-Notes.git
cd KUHS-Papers-Study-Notes
# copy the contents of this project into the repository root

git add .
git commit -m "feat: launch KUHS papers and study notes"
git branch -M main
git push -u origin main
```

Never put a GitHub token in a file, command history, repository URL, or commit.

## Vercel setup

1. In Vercel, choose **Add New → Project** and import `KUHS-Papers-Study-Notes`.
2. Leave **Root Directory** as `./`.
3. Let the repository's TanStack Start configuration be used. `vercel.json` explicitly declares the TanStack Start framework.
4. Connect the project to the GitHub repository and keep `main` as the production branch.
5. Deploy once. After that, Git pushes drive the connected Vercel deployments.

No application environment variables are required for the core site.

## First post-deploy smoke test

Open these routes in the production deployment:

- `/`
- `/notes`
- `/notes/Anatomy`
- `/notes/Ophthalmology`
- `/notes/ENT`
- one `/subject/<subject>` route
- one `/paper/<id>` route
- `/api/pdf?p=<valid KUHS PDF path>`

On a paper page, verify the Questions, Original PDF, Full text, Save and KUHS-link controls. On a notes page, verify a year filter, zoom, outline, tables, code/ASCII blocks, formulas and Print / Save PDF.

## QA already performed before packaging

The source package has been checked for:

- 831 unique paper records.
- 779 full-text records matching `hasText`.
- 52 PDF-only records retained rather than dropped.
- KUHS Medical UG PDF paths/URLs covering all catalog records.
- Four note records with non-empty content.
- Markdown rendering of the supplied notes, including headings, nested lists, tables, fenced code/ASCII blocks, links, `<br>` cells and TeX preservation.
- TypeScript/TSX syntax across the application source.

A full Vite/production browser run could not be executed in this sandbox because the local package installation is incomplete and the package registry is unreachable from the runtime. The package is therefore not being described as having passed a Vercel build from this environment.
