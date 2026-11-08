/**
 * CLI commands — blog / piaci összefoglalók.
 *
 * Domain: blog
 * Subcommands:
 *   haszno blog latest [--period <het|honap>] [--limit <n>]
 *
 * Legal: data always aggregated from >= 5 shops; no per-shop info.
 */
import { Command } from 'commander'
import type { HasznoClient, BlogPost } from '../client/index.js'

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    const opts = p.opts<{ json?: boolean }>()
    if (opts.json) return true
    p = p.parent
  }
  return false
}

function printPost(post: BlogPost): void {
  const pub = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' })
    : 'nincs közzétéve'

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${post.title}`)
  console.log(`${pub} · ${post.period === 'het' ? 'Heti' : 'Havi'} összefoglaló`)
  console.log(`${post.periodStart} – ${post.periodEnd}`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`\n${post.summary}\n`)
  if (post.data?.shopsCount != null) {
    console.log(`Adatforrás: ${post.data.shopsCount} bolt aggregált adatai`)
  }
  if (post.data?.rankedCategories?.length) {
    console.log(`\nTop kategóriák:`)
    for (const c of post.data.rankedCategories.slice(0, 5)) {
      const bar = '█'.repeat(Math.round(c.score * 10))
      console.log(`  ${c.category.padEnd(20)} ${bar}`)
    }
  }
  console.log(`\n${post.bodyMd}`)
}

export function registerBlogCommands(program: Command, client: HasznoClient): void {
  const blog = program
    .command('blog')
    .description('Haszno piaci blog összefoglalók')

  blog
    .command('latest')
    .description('Legfrissebb piaci összefoglaló(k) megjelenítése')
    .option('--period <időszak>', 'Időszak: het (heti) vagy honap (havi)')
    .option('--limit <n>', 'Megjelenítendő bejegyzések száma (alapértelmezett 1)', (v) => parseInt(v, 10), 1)
    .action(async (opts, cmd) => {
      try {
        const result = await client.blog.list({
          period: opts.period as 'het' | 'honap' | undefined,
          page: 1,
          perPage: opts.limit ?? 1,
        })

        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(result))
        } else {
          if (result.posts.length === 0) {
            console.log('Nincs közzétett bejegyzés.')
            return
          }
          for (const post of result.posts) {
            printPost(post)
          }
          if (result.total > result.posts.length) {
            console.log(`\n... és még ${result.total - result.posts.length} régebbi bejegyzés. Használd a --limit kapcsolót.`)
          }
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })
}
