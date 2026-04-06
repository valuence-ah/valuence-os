// ─── Reddit Sourcing Agent ────────────────────────────────────────────────────
// Fetches new posts from configurable subreddits using the public JSON feed.
// Saves relevant posts as sourcing signals in feed_articles.

import { createClient } from "@/lib/supabase/server";

const DEFAULT_SUBREDDITS = ["materials", "biotech", "cleantech", "chemistry"];

export async function runRedditAgent(subreddits: string[] = DEFAULT_SUBREDDITS): Promise<{ fetched: number; saved: number }> {
  const supabase = await createClient();
  let totalFetched = 0;
  let totalSaved = 0;

  for (const subreddit of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
      const res = await fetch(url, {
        headers: { "User-Agent": "ValuenceOS/1.0 (sourcing-agent; contact@valuence.vc)" },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const children = data?.data?.children ?? [];
      totalFetched += children.length;

      for (const child of children) {
        const post = child.data;
        if (!post?.title || !post?.permalink) continue;

        // Skip deleted or removed posts
        if (post.removed_by_category || post.selftext === "[removed]") continue;

        const postUrl = `https://www.reddit.com${post.permalink}`;
        const publishedDate = new Date(post.created_utc * 1000).toISOString();
        const summary = post.selftext?.substring(0, 500) ?? "";

        const { error } = await supabase
          .from("sourcing_signals")
          .upsert({
            title: post.title,
            url: postUrl,
            summary,
            content: post.selftext?.substring(0, 2000) ?? "",
            source: "reddit",
            signal_type: "forum",
            published_date: publishedDate,
            geography: null,
            sector_tags: [subreddit],
            technology_category: subreddit,
          }, { onConflict: "url", ignoreDuplicates: true });

        if (!error) totalSaved++;
      }
    } catch {
      // Continue for other subreddits
    }
  }

  return { fetched: totalFetched, saved: totalSaved };
}
