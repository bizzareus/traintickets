import { Header } from "@/components/Header";
import { SideAdvert } from "@/components/ads/SideAdvert";

export default function ChartTimesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex justify-center items-start gap-8">
          <main className="w-full max-w-3xl lg:max-w-4xl min-w-0">
            {children}
          </main>
          <div className="hidden xl:block shrink-0 sticky top-20">
            <SideAdvert utmMedium="external_website_chart_times" />
          </div>
        </div>
      </div>
    </div>
  );
}
