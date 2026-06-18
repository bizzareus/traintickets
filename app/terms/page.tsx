import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | LastBerth',
  description: 'Terms and Conditions governing the use of LastBerth.',
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
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
          <p>Last updated: June 18, 2026</p>
          <p>
            Please read these terms and conditions carefully before using Our Service.
          </p>
          
          <h2>1. Acknowledgment</h2>
          <p>
            These are the Terms and Conditions governing the use of this Service and the agreement that operates
            between You and the Company. These Terms and Conditions set out the rights and obligations of all users
            regarding the use of the Service.
          </p>
          <p>
            Your access to and use of the Service is conditioned on Your acceptance of and compliance with these Terms
            and Conditions. These Terms and Conditions apply to all visitors, users and others who access or use the Service.
          </p>

          <h2>2. User Accounts</h2>
          <p>
            When You create an account with Us, You must provide Us information that is accurate, complete, and current
            at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of
            Your account on Our Service.
          </p>

          <h2>3. Intellectual Property</h2>
          <p>
            The Service and its original content (excluding Content provided by You or other users), features and functionality
            are and will remain the exclusive property of the Company and its licensors. The Service is protected by
            copyright, trademark, and other laws of both the Country and foreign countries.
          </p>

          <h2>4. Links to Other Websites</h2>
          <p>
            Our Service may contain links to third-party web sites or services that are not owned or controlled by the Company.
          </p>
          <p>
            The Company has no control over, and assumes no responsibility for, the content, privacy policies, or practices of
            any third party web sites or services. You further acknowledge and agree that the Company shall not be responsible
            or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with the
            use of or reliance on any such content, goods or services available on or through any such web sites or services.
          </p>

          <h2>5. Limitation of Liability</h2>
          <p>
            Notwithstanding any damages that You might incur, the entire liability of the Company and any of its suppliers
            under any provision of this Terms and Your exclusive remedy for all of the foregoing shall be limited to the amount
            actually paid by You through the Service or 100 USD if You haven't purchased anything through the Service.
          </p>

          <h2>6. Changes to These Terms and Conditions</h2>
          <p>
            We reserve the right, at Our sole discretion, to modify or replace these Terms at any time. If a revision is material
            We will make reasonable efforts to provide at least 30 days' notice prior to any new terms taking effect. What constitutes
            a material change will be determined at Our sole discretion.
          </p>
        </div>
      </div>
    </div>
  );
}
