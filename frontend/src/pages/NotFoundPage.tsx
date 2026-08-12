// ─────────────────────────────────────────────────────────────────────────────
// pages/NotFoundPage.tsx — 404 fallback page.
// Shown for any unmatched route. Provides links back to Home and Login.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft } from "lucide-react"

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Byte — TeachScript robot mascot in confused/searching pose */}
        <svg width="140" height="170" viewBox="0 0 140 170" fill="none" className="mx-auto mb-6">

          {/* Cable hanging from top */}
          <line x1="70" y1="0" x2="70" y2="10" stroke="#3D2A90" strokeWidth="3" strokeLinecap="round" />
          <rect x="63" y="10" width="14" height="6" rx="2" fill="#3D2A90" />

          {/* HEAD — rounded square */}
          <rect x="32" y="18" width="76" height="64" rx="14" fill="#6040C0" />
          {/* Head highlight */}
          <rect x="37" y="23" width="66" height="26" rx="10" fill="#9B7EE8" fillOpacity="0.2" />

          {/* VISOR / SCREEN */}
          <rect x="38" y="26" width="64" height="38" rx="8" fill="#0D0D1A" />
          <rect x="40" y="28" width="60" height="34" rx="7" fill="#111133" />

          {/* LEFT EYE — looking sideways (confused) */}
          <ellipse cx="57" cy="45" rx="11" ry="10" fill="#9B7EE8" />
          <ellipse cx="54" cy="45" rx="6" ry="7" fill="white" fillOpacity="0.95" />
          <ellipse cx="52" cy="43" rx="2.5" ry="2" fill="white" />

          {/* RIGHT EYE — looking the other way (confused) */}
          <ellipse cx="83" cy="45" rx="11" ry="10" fill="#9B7EE8" />
          <ellipse cx="86" cy="45" rx="6" ry="7" fill="white" fillOpacity="0.95" />
          <ellipse cx="88" cy="43" rx="2.5" ry="2" fill="white" />

          {/* Confused squiggly "mouth" indicator on screen */}
          <path d="M55 62 Q62 58 70 62 Q78 66 85 62" stroke="#9B7EE8" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* ANTENNA — tilted (confused) */}
          <line x1="70" y1="18" x2="76" y2="8" stroke="#3D2A90" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="77" cy="6" r="3.5" fill="#9B7EE8" />

          {/* EAR PANELS */}
          <rect x="18" y="32" width="14" height="20" rx="4" fill="#3D2A90" />
          <rect x="108" y="32" width="14" height="20" rx="4" fill="#3D2A90" />
          <rect x="21" y="37" width="7" height="4" rx="2" fill="#9B7EE8" fillOpacity="0.7" />
          <rect x="112" y="37" width="7" height="4" rx="2" fill="#9B7EE8" fillOpacity="0.7" />

          {/* NECK */}
          <rect x="60" y="82" width="20" height="12" rx="4" fill="#3D2A90" />

          {/* TORSO */}
          <rect x="33" y="94" width="74" height="56" rx="12" fill="#6040C0" />

          {/* Circuit board pattern */}
          <line x1="70" y1="94" x2="70" y2="150" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
          <line x1="33" y1="122" x2="107" y2="122" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
          <line x1="46" y1="100" x2="46" y2="112" stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" />
          <line x1="46" y1="112" x2="58" y2="112" stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" />
          <line x1="94" y1="100" x2="94" y2="112" stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" />
          <line x1="82" y1="112" x2="94" y2="112" stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" />
          <circle cx="46" cy="100" r="2" fill="#9B7EE8" fillOpacity="0.6" />
          <circle cx="94" cy="100" r="2" fill="#9B7EE8" fillOpacity="0.6" />

          {/* TS emblem on chest */}
          <rect x="57" y="100" width="26" height="18" rx="5" fill="#3D2A90" />
          <text x="70" y="113" textAnchor="middle" fill="white" fontSize="9" fontWeight="800" fontFamily="Inter, Arial, sans-serif">TS</text>

          {/* LEFT ARM — hanging down */}
          <rect x="16" y="96" width="17" height="38" rx="8" fill="#6040C0" />
          <rect x="14" y="130" width="21" height="12" rx="6" fill="#3D2A90" />

          {/* RIGHT ARM — raised to head (searching/confused) */}
          <path d="M107 100 Q120 85 122 68" stroke="#6040C0" strokeWidth="14" strokeLinecap="round" fill="none" />
          <ellipse cx="122" cy="64" rx="8" ry="7" fill="#3D2A90" />

          {/* LEGS */}
          <rect x="44" y="148" width="18" height="20" rx="7" fill="#3D2A90" />
          <rect x="43" y="164" width="20" height="8" rx="4" fill="#6040C0" />
          <rect x="78" y="148" width="18" height="20" rx="7" fill="#3D2A90" />
          <rect x="77" y="164" width="20" height="8" rx="4" fill="#6040C0" />

          {/* Floating question marks */}
          <text x="118" y="52" fill="var(--ts-blue)" fontSize="24" fontWeight="800" fontFamily="Inter, sans-serif">?</text>
          <text x="22" y="62" fill="var(--muted-foreground)" fontSize="16" fontWeight="600" fontFamily="Inter, sans-serif" opacity="0.5">?</text>
        </svg>

        <div className="mb-2 inline-block px-3 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
          404
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2 mt-2">Oops! This page went missing.</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Even Byte couldn't find it.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="rounded-[20px] gap-2 text-sm w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" /> Go back
          </Button>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-[20px] text-sm w-full sm:w-auto text-white px-4 py-2"
            style={{ backgroundColor: "var(--ts-blue)" }}
          >
            <Home className="w-4 h-4" /> Go to homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
