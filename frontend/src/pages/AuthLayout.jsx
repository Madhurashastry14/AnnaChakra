import { ArrowLeft, Leaf } from "lucide-react";
import { Link } from "react-router-dom";
import "./AuthPages.css";

function AuthLayout({ children, pageClass = "" }) {
  return (
    <main className={`auth-page ${pageClass}`}>
      <section className="auth-story" aria-label="About AnnaChakra">
        <Link className="brand auth-brand" to="/" aria-label="AnnaChakra home">
          <span className="brand-mark" aria-hidden="true"><Leaf size={21} strokeWidth={2.1} /></span>
          <span>Anna<span className="brand-light">Chakra</span></span>
        </Link>
        <div className="auth-story-copy">
          <span className="auth-story-kicker"><span className="eyebrow-dot" /> Nourish more. Waste less.</span>
          <h1>Good food deserves <em>another chance.</em></h1>
          <p>Bringing kitchens and community partners together, one thoughtful connection at a time.</p>
        </div>
        <div className="auth-story-note">
          <span className="auth-note-leaf"><Leaf size={19} aria-hidden="true" /></span>
          <span><strong>Food shared with purpose</strong><small>Better planning. Stronger communities.</small></span>
        </div>
        <span className="auth-story-decoration" aria-hidden="true"><Leaf size={220} strokeWidth={0.55} /></span>
      </section>

      <section className="auth-panel">
        <Link className="auth-back-link" to="/" aria-label="Back to home">
          <ArrowLeft size={16} aria-hidden="true" /> Back to home
        </Link>
        <div className="auth-form-wrap">{children}</div>
        <p className="auth-copyright">© {new Date().getFullYear()} AnnaChakra. Food shared with purpose.</p>
      </section>
    </main>
  )
}

export default AuthLayout
