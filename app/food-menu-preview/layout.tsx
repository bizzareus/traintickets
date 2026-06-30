import { Header } from "@/components/Header";

export default function FoodMenuPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-white text-gray-900 antialiased">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:max-w-4xl">
        {children}
      </main>
    </div>
  );
}
