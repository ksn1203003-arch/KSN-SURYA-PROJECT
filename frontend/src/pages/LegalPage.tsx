// ─────────────────────────────────────────────────────────────────────────────
// pages/LegalPage.tsx — Terms of Service and Privacy Policy page (/legal/:type).
// Route param "type" is either "terms" or "privacy". Both are rendered in the
// same page component with different content.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useParams } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { ArrowLeft } from "lucide-react"

const PAGES: Record<string, { title: string; sections: Array<{ heading: string; body: string }> }> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      { heading: "What we collect", body: "We collect your school name, admin contact details, teacher and student accounts (name, phone or email), and lesson progress data. We do not collect behavioral data, browsing history, or any information beyond what is needed to run your school's account." },
      { heading: "How we use it", body: "Your data is used solely to provide the TeachScript service — delivering lessons, generating reports, sending Sunday WhatsApp digests, and issuing certificates. We do not sell, rent, or share your data with third parties for advertising." },
      { heading: "Student data (Classes 3–5)", body: "In compliance with DPDP Act 2023, we do not collect personally identifiable information (PII) from students in Classes 3–5 beyond a roll number and first name. No photos, no location, no behavioral profiling." },
      { heading: "Data storage", body: "All data is stored on Supabase infrastructure with servers in India. Data is encrypted at rest and in transit. Backups are retained for 30 days." },
      { heading: "Data deletion", body: "You may request deletion of all school data at any time by emailing hello@teachscript.in. We will permanently delete all records within 30 days." },
      { heading: "Contact", body: "For privacy questions, email: hello@teachscript.in | TeachScript, Hyderabad, Telangana, India." },
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      { heading: "Subscription", body: "TeachScript is offered as an annual subscription plan. Your subscription begins on the date of payment and renews annually. A 14-day free trial is available for new schools — no credit card required." },
      { heading: "Acceptable use", body: "TeachScript may only be used for legitimate educational purposes within your school. You may not resell, sublicense, or share access credentials outside your institution." },
      { heading: "Content ownership", body: "All lesson content, whisper scripts, quizzes, and activities are owned by TeachScript and protected by copyright. You are granted a non-exclusive licence to use them within your subscription period." },
      { heading: "Refunds", body: "We offer a full refund within 30 days of purchase if you are not satisfied. After 30 days, no refunds are issued for annual subscriptions. Contact hello@teachscript.in for refund requests." },
      { heading: "Termination", body: "We may terminate accounts that violate these terms. You may cancel your subscription at any time — your access continues until the end of the billing period." },
      { heading: "Changes to terms", body: "We may update these terms. We will notify admins by email at least 30 days before changes take effect. Continued use after that date constitutes acceptance." },
    ],
  },
  dpdp: {
    title: "DPDP Act 2023 Compliance",
    sections: [
      { heading: "What is DPDP Act 2023?", body: "The Digital Personal Data Protection Act 2023 (DPDP Act) is India's landmark data privacy law. It governs how organisations collect, process, and store personal data of Indian citizens." },
      { heading: "Our compliance posture", body: "TeachScript is designed from the ground up to comply with DPDP Act 2023. We have appointed a Data Protection Officer (DPO) and maintain a data inventory of all personal data we process." },
      { heading: "Children's data", body: "For students in Classes 3–5 (typically ages 8–11), we apply heightened protections: no PII beyond roll number and first name, no behavioral tracking, no profiling, no third-party sharing. For Classes 6–8, we collect only what is necessary for the service." },
      { heading: "Consent", body: "School admins provide consent on behalf of the institution when signing up. Individual parent consent for students is obtained and managed by the school as the data fiduciary. TeachScript acts as a data processor." },
      { heading: "Data localisation", body: "All personal data is stored on servers located in India, in compliance with DPDP Act data localisation requirements." },
      { heading: "Your rights", body: "Under DPDP Act, you have the right to access, correct, and erase your personal data. To exercise these rights, email hello@teachscript.in. We will respond within 72 hours." },
    ],
  },
}

export function LegalPage() {
  const { type } = useParams<{ type: string }>()
  const content = PAGES[type ?? ""] ?? PAGES.privacy

  return (
    <div className="min-h-screen bg-background pt-14">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-3 h-3" />
          Back to home
        </Link>

        <h1 className="text-2xl font-medium text-foreground mb-2">{content.title}</h1>
        <p className="text-xs text-muted-foreground mb-10">Last updated: January 2026 · TeachScript, Hyderabad, India</p>

        <div className="flex flex-col gap-8">
          {content.sections.map((section) => (
            <div key={section.heading}>
              <h2 className="text-sm font-medium text-foreground mb-2">{section.heading}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-wrap gap-4">
          {type !== "privacy" && <Link to="/legal/privacy" className="text-xs text-ts-blue hover:underline">Privacy Policy</Link>}
          {type !== "terms" && <Link to="/legal/terms" className="text-xs text-ts-blue hover:underline">Terms of Service</Link>}
          {type !== "dpdp" && <Link to="/legal/dpdp" className="text-xs text-ts-blue hover:underline">DPDP Act Compliance</Link>}
        </div>
      </main>
      <Footer />
    </div>
  )
}
