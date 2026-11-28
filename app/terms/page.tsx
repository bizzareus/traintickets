import { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service & Refund Rules",
  description:
    "Read LastBerth's Terms of Service covering Indian Railways meta-search usage, user accounts, chart alert subscriptions, and the 50% refund policy.",
  canonical: "/terms",
});

export default function TermsOfServicePage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://lastberth.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Terms of Service",
        item: "https://lastberth.com/terms",
      },
    ],
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Terms of Service</span>
      </nav>
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Terms of Service
        </h1>
        <div className="prose prose-slate max-w-none text-slate-600">
          <p>Last updated: November 26, 2026</p>
          <p>
            Please read these terms and conditions carefully before using Our
            Service.
          </p>

          <h2>1. Acknowledgment</h2>
          <p>
            These are the Terms and Conditions governing the use of this Service
            and the agreement that operates between You and the Company. These
            Terms and Conditions set out the rights and obligations of all users
            regarding the use of the Service.
          </p>
          <p>
            Your access to and use of the Service is conditioned on Your
            acceptance of and compliance with these Terms and Conditions. These
            Terms and Conditions apply to all visitors, users and others who
            access or use the Service.
          </p>
          <p>
            LastBerth is an independently operated meta search engine. Its
            search tools show you options, and bookings are completed by you
            directly on IRCTC. Payments made to LastBerth cover only
            LastBerth&apos;s own services (such as seat alerts) and are not
            train ticket fares.
          </p>

          <h2>2. User Accounts</h2>
          <p>
            When You create an account with Us, You must provide Us information
            that is accurate, complete, and current at all times. Failure to do
            so constitutes a breach of the Terms, which may result in immediate
            termination of Your account on Our Service.
          </p>

          <h2>3. Intellectual Property</h2>
          <p>
            The Service and its original content (excluding Content provided by
            You or other users), features and functionality are and will remain
            the exclusive property of the Company and its licensors. The Service
            is protected by copyright, trademark, and other laws of both the
            Country and foreign countries.
          </p>

          <h2>4. Links to Other Websites</h2>
          <p>
            Our Service may contain links to third-party web sites or services
            that are not owned or controlled by the Company.
          </p>
          <p>
            The Company has no control over, and assumes no responsibility for,
            the content, privacy policies, or practices of any third party web
            sites or services. You further acknowledge and agree that the
            Company shall not be responsible or liable, directly or indirectly,
            for any damage or loss caused or alleged to be caused by or in
            connection with the use of or reliance on any such content, goods or
            services available on or through any such web sites or services.
          </p>

          <h2>5. Limitation of Liability</h2>
          <p>
            Notwithstanding any damages that You might incur, the entire
            liability of the Company and any of its suppliers under any
            provision of this Terms and Your exclusive remedy for all of the
            foregoing shall be limited to the amount actually paid by You
            through the Service or 100 USD if You haven&apos;t purchased
            anything through the Service.
          </p>

          <h2>6. Cancellations &amp; Refunds</h2>
          <p>
            This section applies to paid alert subscriptions and notification
            monitoring services offered directly by LastBerth (such as chart
            vacancy alerts). Because payments made to LastBerth cover automated
            server polling, data aggregation, compute resources, and third-party
            payment gateway processing:
          </p>
          <ul>
            <li>
              <strong>50% Refund Policy:</strong> Approved refund requests for
              chart alert subscriptions are processed at{" "}
              <strong>50% of the amount paid</strong>. The remaining 50% covers
              non-refundable gateway processing charges and incurred
              infrastructure costs.
            </li>
            <li>
              <strong>How to Request:</strong> Users can submit a refund request
              through our official refund portal at{" "}
              <Link href="/refund" className="text-blue-600 underline">
                lastberth.com/refund
              </Link>{" "}
              by providing their email, train number, journey date, and payment
              transaction ID.
            </li>
            <li>
              <strong>Processing Timeline:</strong> Approved refunds are
              initiated via our payment gateway (Razorpay / Muzobox) back to the
              original payment method and typically reflect within 5–7 business
              days depending on the issuing bank.
            </li>
            <li>
              <strong>Train Ticket Bookings:</strong> Train tickets booked
              directly on IRCTC or third-party booking partners are subject
              strictly to Indian Railways cancellation and refund rules, and are
              not governed by LastBerth.
            </li>
          </ul>

          <h2>7. Changes to These Terms and Conditions</h2>
          <p>
            We reserve the right, at Our sole discretion, to modify or replace
            these Terms at any time. If a revision is material We will make
            reasonable efforts to provide at least 30 days&apos; notice prior to
            any new terms taking effect. What constitutes a material change will
            be determined at Our sole discretion.
          </p>
        </div>
      </div>
    </div>
  );
}
