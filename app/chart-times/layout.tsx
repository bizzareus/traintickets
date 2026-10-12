import { Header } from "@/components/Header";
import { SideAdvert } from "@/components/ads/SideAdvert";

export default function ChartTimesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-start justify-center gap-8">
          <main className="w-full min-w-0 max-w-3xl lg:max-w-4xl">
            {children}
          </main>
          <div className="sticky top-20 hidden shrink-0 xl:block">
            <SideAdvert utmMedium="external_website_chart_times" />
          </div>
        </div>
      </div>
    </div>
  );
}
