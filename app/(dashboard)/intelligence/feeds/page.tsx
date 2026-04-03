import { Header } from "@/components/layout/header";
import { FeedsClient } from "@/components/intelligence/feeds-client";

export const metadata = { title: "News Feeds" };

export default function FeedsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="News Feeds"
        subtitle="Three-bucket intelligence: fund raises, startup rounds, and M&amp;A signals"
      />
      <FeedsClient />
    </div>
  );
}
