import { Layout, PageContent } from "@/components/Layout";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Layout>
      <PageContent>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-8xl font-display font-bold text-border mb-4">404</div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">Page not found</h2>
          <p className="text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
          <Link href="/">
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </PageContent>
    </Layout>
  );
}
