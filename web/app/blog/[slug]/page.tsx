import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPost, getAllPosts } from '@/lib/blog'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export const revalidate = 86400 // 24h

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const post = getPost(params.slug)
  if (!post) return {}

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      siteName: 'GrimDealz',
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      ...(post.updatedAt && { modifiedTime: post.updatedAt }),
      authors: [post.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

export default function BlogPostPage({
  params,
}: {
  params: { slug: string }
}) {
  const post = getPost(params.slug)
  if (!post) notFound()

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    ...(post.updatedAt && { dateModified: post.updatedAt }),
    author: { '@type': 'Organization', name: 'GrimDealz' },
    publisher: {
      '@type': 'Organization',
      name: 'GrimDealz',
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />

      <nav className="mb-8 text-sm text-bone-faint">
        <Link href="/" className="transition-colors hover:text-gold">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href="/blog" className="transition-colors hover:text-gold">Blog</Link>
        <span className="mx-1.5">/</span>
        <span className="text-bone-muted">{post.title}</span>
      </nav>

      <article>
        <header className="mb-10">
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-ink-raised px-2.5 py-1 text-xs font-medium text-bone-faint"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="font-cinzel text-3xl font-bold leading-tight text-bone sm:text-4xl">
            {post.title}
          </h1>
          <div className="mt-4 flex items-center gap-4 text-sm text-bone-faint">
            <span>By {post.author}</span>
            <span>·</span>
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          </div>
        </header>

        <div className="space-y-8">
          {post.sections.map((section, i) => (
            <section key={i}>
              {section.heading && (
                <h2 className="mb-3 text-xl font-bold text-bone">{section.heading}</h2>
              )}
              {section.body.split('\n\n').map((paragraph, j) => (
                <p
                  key={j}
                  className="mb-4 text-base leading-relaxed text-bone-muted"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>

      {/* CTA */}
      <div className="mt-12 rounded-lg border border-gold/20 bg-ink-card p-6 text-center">
        <h3 className="text-lg font-bold text-bone">Find the cheapest price on any kit</h3>
        <p className="mt-2 text-sm text-bone-muted">
          GrimDealz compares prices across 10+ authorized US retailers, updated every 4 hours.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow"
        >
          Search Products →
        </Link>
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/blog"
          className="text-sm font-medium text-gold transition-colors hover:text-gold-light"
        >
          ← All posts
        </Link>
      </div>
    </div>
  )
}
