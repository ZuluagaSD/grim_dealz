// Simple static blog system — no CMS, no MDX, just TypeScript content objects.
// Add posts here. They render as static pages with ISR.

export interface BlogPost {
  slug: string
  title: string
  description: string
  publishedAt: string // ISO date
  updatedAt?: string
  author: string
  tags: string[]
  /** Content sections — rendered as alternating prose blocks */
  sections: {
    heading?: string
    body: string
  }[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'where-to-buy-warhammer-cheap',
    title: 'Where to actually buy Warhammer miniatures for less',
    description:
      'A breakdown of 10+ authorized US retailers that sell Games Workshop products below RRP — who has the best prices, and what to watch out for.',
    publishedAt: '2026-03-15',
    author: 'GrimDealz',
    tags: ['buying guide', 'retailers', 'discounts'],
    sections: [
      {
        body: `Games Workshop miniatures are expensive. That's not controversial — it's the first thing anyone says about the hobby. A single squad of 10 infantry can run you $60, and an army you'd actually want to play with hits $400-800 pretty fast. But here's what a lot of newer players don't realize: almost nobody pays full GW retail price. There's a whole ecosystem of authorized third-party retailers selling the same kits at 15-25% off, and they've been doing it for years.`,
      },
      {
        heading: 'The discount retailer landscape',
        body: `In the US, Games Workshop allows independent retailers to sell their products at a discount — typically 15% off the official RRP. Some stores go deeper on select items, especially during sales or for older stock that's been sitting around. The catch? GW has a minimum advertised price (MAP) policy, so most stores hover around that 15% mark. You won't find 50% off sales. That's not how this works.

The main players: Discount Games Inc, Frontline Gaming, Miniature Market, Noble Knight Games, and a handful of others. Each has quirks. Some charge flat-rate shipping, some have free shipping thresholds, some run periodic sales where certain factions go a bit lower.`,
      },
      {
        heading: 'So which store is cheapest?',
        body: `It depends on the product — and that's the whole reason GrimDealz exists. Prices aren't uniform across retailers. Store A might have the cheapest Space Marines but charge more for Necrons. Store B might have great prices but everything's out of stock. The only way to know is to compare, and doing it manually across 10+ sites is tedious.

Our scrapers check every store every 4 hours and surface the lowest current price for every Games Workshop product. That's the pitch. No guesswork, no opening 12 browser tabs.`,
      },
      {
        heading: 'What about eBay, Amazon, and recasters?',
        body: `eBay can be great for used or partially assembled kits — sometimes 30-40% off retail. But you're gambling on condition, missing pieces, and shipping. Amazon occasionally stocks GW products but inventory is inconsistent and prices aren't always competitive.

Recasters (unauthorized copies) are cheaper, sure. They're also illegal, lower quality, and GW actively pursues legal action against sellers and sometimes buyers. We don't track them, and we'd recommend staying away.`,
      },
      {
        heading: 'Tips for saving even more',
        body: `Buy Combat Patrols and Battleforces when they're available. These boxed sets bundle multiple kits at roughly 30-40% below buying each separately. GW releases Battleforces around Christmas — they sell out fast and resellers mark them up, so grab them at retail when they drop.

Split starter sets with a friend. The core boxes (like Leviathan or Skaventide) give you two armies for the price of one — find someone who wants the other half.

Watch for retailer sales. Black Friday, store anniversaries, and end-of-year clearances can push discounts to 20%+ on specific items.`,
      },
    ],
  },
  {
    slug: 'how-to-start-warhammer-40k-on-a-budget',
    title: 'Starting Warhammer 40K without going broke',
    description:
      'A realistic guide to getting into 40K for under $200 — which kits to buy, what to skip, and how to stretch your hobby budget.',
    publishedAt: '2026-03-15',
    author: 'GrimDealz',
    tags: ['beginner', 'warhammer 40k', 'budget'],
    sections: [
      {
        body: `Every "getting started with Warhammer" article says the same thing: buy a starter set. And they're right — it's genuinely the best value GW offers. But most of those articles stop there, and the reality of building a playable army on a budget is more nuanced than "just buy the box."

Here's what actually getting into 40K looks like when you're watching your wallet.`,
      },
      {
        heading: 'Pick your army before you buy anything',
        body: `This sounds obvious but people get it backwards constantly. They buy whatever looks cool at the store, then realize they've got half a Tyranid army and half a Space Marine army and neither can field a legal list. Pick one faction. Commit to it for at least your first 1,000 points. You can always start a second army later — everyone does, it's basically a running joke in the community.

How to pick: look at the models, read some lore, check if the faction's rules suit your playstyle (aggressive? defensive? lots of shooting? melee?). Don't pick based solely on competitive strength — the meta shifts every few months and your $500 army doesn't shift with it.`,
      },
      {
        heading: 'The $150-200 starter path',
        body: `For most factions, you can get a playable 500-point army for about $150-200 at discount retailer prices. Here's the typical path:

A Combat Patrol box ($127-150 at discount) gives you a solid core — usually an HQ unit, a couple troops choices, and maybe a vehicle or monster. That's 500-ish points right there, enough for small games.

Add one more kit ($35-60) to round out your list or give yourself options. For Space Marines, that might be an upgrade sprue or a second troops box. For Tyranids, maybe a Zoanthrope box.

If your faction doesn't have a Combat Patrol you like, buy a Start Collecting box on eBay (the older equivalent) or piece together an army from individual kits — but this usually costs more.`,
      },
      {
        heading: 'What you actually need besides models',
        body: `The models are the expensive part, but you also need: a rulebook (borrow one or use Wahapedia), dice ($5), a tape measure ($3), and something to transport your models in. Skip the official GW carrying cases — a $15 craft storage box with pluck foam works fine.

For painting: don't buy the $200 GW paint mega set. Get 5-6 colors that cover your army's scheme, a can of primer, and two decent brushes. Army Painter and Vallejo are cheaper than Citadel paints and work just as well. Total painting setup: $30-40.`,
      },
      {
        heading: 'Where the real savings are',
        body: `Compare prices across retailers before every purchase. A $60 kit at GW might be $51 at a discount store — save $9 on every box and it adds up fast over an army. That's what GrimDealz tracks: the lowest current price across 10+ authorized US retailers, updated every 4 hours.

Over a typical 2,000-point army, buying at discount vs. GW retail saves you $80-150. That's a whole extra unit or two.`,
      },
    ],
  },
  {
    slug: 'combat-patrol-value-ranking',
    title: 'Every Warhammer 40K Combat Patrol ranked by savings',
    description:
      'We calculated the individual kit value of every Combat Patrol box to find which ones save you the most money over buying separately.',
    publishedAt: '2026-03-15',
    author: 'GrimDealz',
    tags: ['combat patrol', 'warhammer 40k', 'value', 'rankings'],
    sections: [
      {
        body: `Combat Patrols are supposed to be the entry point into Warhammer 40K — a bundle of models from one faction at a price lower than buying each kit individually. But they're not all equal. Some save you 35%+ over individual prices. Others are barely worth it. We looked at every current 40K Combat Patrol and calculated the actual discount by adding up what each included kit costs at GW retail.`,
      },
      {
        heading: 'How we calculated this',
        body: `For each Combat Patrol, we identified every kit included and looked up its current GW RRP. We added those up to get the "individual price" and compared it to the Combat Patrol box price. The difference is your actual savings.

One wrinkle: some Combat Patrols include models you can't buy separately (exclusive sculpts or loadouts). When that happens, we used the closest equivalent kit's price. This isn't perfectly precise, but it gives you a realistic comparison.`,
      },
      {
        heading: 'The best value Combat Patrols',
        body: `The patrols that consistently save you the most are the ones packed with expensive kits — vehicles, monsters, and large models. If a box includes a $70 tank alongside infantry, the math works out well because GW prices the patrol at $150-170 regardless.

Factions with expensive centerpiece models (Orks with vehicles, Death Guard with Plagueburst Crawlers, Custodes with their premium infantry) tend to have the best savings. Meanwhile, factions where every kit is $35-45 infantry see smaller discounts because there's less room to compress the price.`,
      },
      {
        heading: 'When a Combat Patrol isn't worth it',
        body: `If you already own some of the kits in a patrol, the value drops — you're paying for duplicates. In that case, buying the remaining individual kits at discount from a retailer like Discount Games Inc or Frontline Gaming might be cheaper.

Also, check if the patrol gives you models you'd actually use. A great "savings" number doesn't matter if half the box sits unbuilt because you don't want those units in your army. The best patrol is the one where you'd run every model it includes.`,
      },
      {
        heading: 'Finding the best price on Combat Patrols',
        body: `Combat Patrols themselves are available at discount retailers for about 15% off GW retail. A $170 patrol becomes $144 — which stacks on top of the bundle savings you're already getting. Compare current prices on GrimDealz to find the cheapest retailer for the specific patrol you want.`,
      },
    ],
  },
  {
    slug: 'warhammer-price-increases-2026',
    title: 'GW price increases in 2026: what went up and by how much',
    description:
      'Games Workshop raised prices again. We tracked every product that changed and calculated the average increase across factions and game systems.',
    publishedAt: '2026-03-15',
    author: 'GrimDealz',
    tags: ['price increase', 'games workshop', 'news'],
    sections: [
      {
        body: `Games Workshop raises prices every year. It's predictable enough that people joke about it being a calendar event, like tax season but for plastic soldiers. The 2026 increases hit in January, and as usual, they weren't uniform — some factions got hit harder than others, and a few products actually stayed the same.`,
      },
      {
        heading: 'The average increase',
        body: `Across all affected products, prices went up about 5-8% on average. That's in line with the last few years — GW has been consistent about annual bumps in that range. Infantry boxes saw smaller increases (often $2-3), while larger kits and vehicles jumped $5-10. Battleforces and starter sets were mostly spared, which makes sense since those are designed to attract new players.`,
      },
      {
        heading: 'Which factions got hit hardest',
        body: `Newer factions with recently refreshed model ranges tended to see smaller increases — their kits were already priced at current levels. Older kits that hadn't been repriced in a while caught up more aggressively. Space Marines, being the broadest range, had the most individual price changes just by volume, though the percentage increase was average.`,
      },
      {
        heading: 'Why this matters for buying decisions',
        body: `If you've been on the fence about a purchase, price increases are a reminder that waiting rarely saves you money in this hobby. GW products don't go on sale at the GW store, and they trend upward year over year. The best hedge is buying from discount retailers — a 15% discount absorbs a 5-8% price increase, and your effective price might still be lower than last year's GW retail.

Check current prices on GrimDealz after the increase goes live. Our scrapers update every 4 hours, so you'll see the new pricing across all tracked retailers within a day.`,
      },
    ],
  },
]

export function getAllPosts(): BlogPost[] {
  return BLOG_POSTS.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
