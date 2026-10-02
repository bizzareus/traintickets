import { Header } from "@/components/Header";

export default function TrainDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-900 antialiased selection:bg-emerald-500 selection:text-white">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8 sm:px-6 lg:max-w-6xl lg:px-8">
        {children}
      </main>
    </div>
  );
}
