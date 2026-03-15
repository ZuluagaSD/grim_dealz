import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'

const ogTitle = 'Blog — Warhammer Buying Guides & Deals'
const ogDesc =
  'Buying guides, price analysis, and deal tips for Warhammer 40K, Age of Sigmar, and Horus Heresy. Save money on your next army.'

export const metadata: Metadata = {
  title: ogTitle,
  description: ogDesc,
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    siteName: 'GrimDealz',
    title: ogTitle,
    description: ogDesc,
  },
  twitter: {
    card: 'summary_large_image',
    title: ogTitle,
    description: ogDesc,
  },
}

export default function BlogIndex() {
  const posts = getAllPosts()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-cinzel text-3xl font-bold text-bone">Blog</h1>
      <p className="mt-2 text-bone-muted">
        Buying guides, price analysis, and deal tips for Warhammer hobbyists.
      </p>

      <div className="mt-10 space-y-8">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="rounded-lg border border-ink-rim bg-ink-card p-6 transition-all hover:border-ink-high"
          >
            <div className="flex flex-wrap gap-2 mb-3">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-ink-raised px-2 py-0.5 text-xs text-bone-faint"
                >
                  {tag}
                </span>
              ))}
            </div>
            <Link href={`/blog/${post.slug}`}>
              <h2 className="text-xl font-bold text-bone transition-colors hover:text-gold">
                {post.title}
              </h2>
            </Link>
            <p className="mt-2 text-sm leading-relaxed text-bone-muted">
              {post.description}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <time className="text-xs text-bone-faint" dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <Link
                href={`/blog/${post.slug}`}
                className="text-sm font-medium text-gold transition-colors hover:text-gold-light"
              >
                Read more →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
