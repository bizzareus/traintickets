import { Header } from "@/components/Header";
// Nari advert temporarily disabled in favour of Monetag In-Page Push
// import { SideAdvert } from "@/components/ads/SideAdvert";

export default function TrainFoodMenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <main className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-4xl">
          {children}
        </main>
      </div>
    </div>
  );
}
