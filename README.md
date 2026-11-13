# aurorascharff.no

Aurora Scharff's personal site and blog: practical guides on React, Next.js, and modern web development, plus a speaking archive. Live at [aurorascharff.no](https://aurorascharff.no).

Built with [Astro](https://astro.build), based on the [AstroPaper](https://github.com/satnaing/astro-paper) theme with a custom design.

## Commands

| Command        | Action                                       |
| -------------- | -------------------------------------------- |
| `pnpm install` | Install dependencies                         |
| `pnpm dev`     | Start the dev server at `localhost:4321`     |
| `pnpm build`   | Build to `./dist/` and optimize with jampack |
| `pnpm preview` | Preview the build locally                    |
| `pnpm lint`    | Lint                                         |
| `pnpm format`  | Format with Prettier                         |

## Structure

```text
src/
  config.ts               # Site metadata and social links
  content/
    blog/                 # Blog posts (.md, .mdx for interactive demos)
    speaking/             # Speaking events
  components/             # Astro/React components (incl. examples/ for MDX demos)
  layouts/                # Page layouts
  pages/                  # Routes, RSS, OG image endpoints
  assets/                 # Post images and GIFs
public/                   # Static assets
.agents/skills/           # Writing skills (see below)
```

## Writing posts

Posts live in `src/content/blog/`. The writing conventions are encoded as skills:

- [`.agents/skills/tech-writing/`](.agents/skills/tech-writing/SKILL.md) — general voice, prose and snippet rules, review framework
- [`.agents/skills/blog-writing/`](.agents/skills/blog-writing/SKILL.md) — post structure, frontmatter scaffold, MDX demo mechanics

Set `draft: true` in frontmatter until a post is ready, and add `modDatetime` when updating a published post. Dynamic OG images are generated per post.

## License

MIT — theme originally by [Sat Naing](https://github.com/satnaing/astro-paper), see [LICENSE](LICENSE).
