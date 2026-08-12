// ─────────────────────────────────────────────────────────────────────────────
// components/Footer.tsx — Public site footer with product links and legal info.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "react-router-dom"

export function Footer() {
  return (
    <footer className="bg-card mt-16" style={{ borderTop: "0.5px solid var(--border)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-xs font-medium text-foreground mb-3" style={{ letterSpacing: "0.05em" }}>Product</h4>
            <ul className="flex flex-col gap-2">
              {[["Home", "/"], ["How it works", "/#how-it-works"], ["Curriculum", "/#curriculum"], ["Pricing", "/pricing"]].map(([label, to]) => (
                <li key={to}><Link to={to} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground mb-3">For schools</h4>
            <ul className="flex flex-col gap-2">
              {[["For teachers", "/for-teachers"], ["For principals", "/for-schools"], ["For trustees", "/for-schools"], ["Request demo", "/for-schools"]].map(([label, to]) => (
                <li key={label}><Link to={to} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground mb-3">Legal</h4>
            <ul className="flex flex-col gap-2">
              {[["Privacy policy", "/legal/privacy"], ["Terms of service", "/legal/terms"], ["DPDP Act compliance", "/legal/dpdp"]].map(([label, to]) => (
                <li key={label}><Link to={to} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground mb-3">Contact</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="mailto:hello@teachscript.in" className="text-xs text-muted-foreground hover:text-foreground transition-colors">hello@teachscript.in</a></li>
              <li><a href="https://wa.me/919999999999" className="text-xs text-muted-foreground hover:text-foreground transition-colors">WhatsApp</a></li>
              <li><span className="text-xs text-muted-foreground">Hyderabad, Telangana, India</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2" style={{ borderTop: "0.5px solid var(--border)" }}>
          <p className="text-xs text-muted-foreground">© 2026 TeachScript. Made in India for Indian schools.</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Language:</span>
            <button className="hover:text-foreground transition-colors">EN</button>
            <span>|</span>
            <button className="hover:text-foreground transition-colors">हि</button>
          </div>
        </div>
      </div>
    </footer>
  )
}
