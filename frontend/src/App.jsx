import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ClipboardList,
  CookingPot,
  HandHeart,
  Leaf,
  Menu,
  Search,
  Truck,
  X,
} from 'lucide-react'
import './App.css'

const steps = [
  {
    number: '01',
    icon: ClipboardList,
    title: 'Meal forecasting',
    description:
      'Plan meals around expected attendance and the menu, so kitchens can prepare with a clearer picture of what is needed.',
  },
  {
    number: '02',
    icon: CookingPot,
    title: 'Surplus recording',
    description:
      'Record what was prepared and what is available to share after the meal service.',
  },
  {
    number: '03',
    icon: Search,
    title: 'NGO matching',
    description:
      'Find a suitable NGO by comparing available food with community requirements and receiving capacity.',
  },
  {
    number: '04',
    icon: Truck,
    title: 'Delivery tracking',
    description:
      'Coordinate dispatch and delivery, then confirm the quantities received.',
  },
]

const challenges = [
  {
    icon: CookingPot,
    title: 'Surplus goes unnoticed',
    description:
      'Without a clear record of what was prepared and what remains, good food can be difficult to put to use.',
  },
  {
    icon: Search,
    title: 'The right match is hard to find',
    description:
      'Kitchens need a simple way to find nearby organisations whose needs and capacity fit the food available.',
  },
  {
    icon: Truck,
    title: 'Coordination takes effort',
    description:
      'Donation details, collection plans and delivery confirmation can end up scattered across conversations.',
  },
]

const roles = [
  {
    id: 'kitchen',
    eyebrow: 'For food providers',
    title: 'Kitchens',
    icon: CookingPot,
    description:
      'Turn a good meal into a good opportunity to share with your community.',
    benefits: [
      'Manage meal forecasts',
      'Record food surplus',
      'Connect with NGOs',
      'Coordinate donations',
    ],
    action: 'Register as a Kitchen',
    href: '/register?role=kitchen',
    tone: 'kitchen',
  },
  {
    id: 'ngo',
    eyebrow: 'For community partners',
    title: 'NGOs',
    icon: HandHeart,
    description:
      'Share what your community needs and coordinate food offers in one place.',
    benefits: [
      'Share food requirements',
      'Receive donation offers',
      'Track deliveries',
      'Confirm received quantities',
    ],
    action: 'Register as an NGO',
    href: '/register?role=ngo',
    tone: 'ngo',
  },
]

const navigation = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Join Us', href: '#join-us' },
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="nav-wrap">
          <a className="brand" href="#home" onClick={closeMenu} aria-label="AnnaChakra home">
            <span className="brand-mark" aria-hidden="true">
              <Leaf size={21} strokeWidth={2.1} />
            </span>
            <span>Anna<span className="brand-light">Chakra</span></span>
          </a>

          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav
            className={`primary-nav${menuOpen ? ' is-open' : ''}`}
            id="primary-navigation"
            aria-label="Main navigation"
          >
            <div className="nav-links">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu}>
                  {item.label}
                </a>
              ))}
            </div>
            <div className="nav-actions">
              <a className="login-link" href="/login" onClick={closeMenu}>
                Log in
              </a>
              <a className="button button-small button-green" href="/register" onClick={closeMenu}>
                Register
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-inner page-width">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-dot" /> A better way to share food</p>
              <h1>Good food deserves <span>another chance.</span></h1>
              <p className="hero-description">
                AnnaChakra brings kitchens and NGOs together to plan meals, share surplus and
                coordinate donations — so good food can find the people who need it.
              </p>
              <div className="hero-actions">
                <a className="button button-green" href="/register?role=kitchen">
                  Join as Kitchen
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a className="button button-outline" href="/register?role=ngo">
                  Join as NGO
                </a>
              </div>
              <p className="existing-user">
                Already part of the circle? <a href="/login">Log in</a>
              </p>
              <a className="hero-scroll" href="#about">
                Discover AnnaChakra <ArrowDownRight size={15} aria-hidden="true" />
              </a>
            </div>

            <div className="hero-visual" aria-label="A freshly prepared meal ready to be shared">
              <div className="hero-photo">
                <img
                  src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85"
                  alt="A colourful bowl of fresh, thoughtfully prepared food"
                />
              </div>
              <div className="visual-note">
                <span className="visual-note-icon"><HandHeart size={20} /></span>
                <span><strong>Good food, shared</strong><small>From kitchens to communities</small></span>
              </div>
              <div className="visual-leaf visual-leaf-one" aria-hidden="true"><Leaf size={22} /></div>
              <div className="visual-leaf visual-leaf-two" aria-hidden="true"><Leaf size={16} /></div>
              <span className="visual-caption">Nourish more. Waste less.</span>
            </div>
          </div>
          <div className="hero-bottom page-width" aria-hidden="true">
            <span>FOOD WITH PURPOSE</span>
            <span className="hero-bottom-line" />
            <span>COMMUNITY IN MOTION</span>
          </div>
        </section>

        <section className="about-section section-pad" id="about">
          <div className="page-width about-grid">
            <div className="section-intro">
              <p className="eyebrow"><span className="eyebrow-dot" /> About AnnaChakra</p>
              <h2>One thoughtful connection can <span>change the table.</span></h2>
            </div>
            <div className="about-copy">
              <p>
                AnnaChakra is a food redistribution platform built to make the journey from
                kitchen surplus to community need easier to coordinate.
              </p>
              <p>
                Kitchens can plan around expected attendance, record what is available and
                connect with NGOs. Community partners can share their requirements and follow
                each donation through delivery and receipt.
              </p>
              <a className="text-link" href="#how-it-works">
                See how it works <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="page-width">
            <div className="about-ribbon">
              <div className="ribbon-icon" aria-hidden="true"><Leaf size={22} /></div>
              <p><strong>Better planning.</strong> Clearer connections. Food shared with care.</p>
              <span className="ribbon-decoration" aria-hidden="true">01 — 04</span>
            </div>
          </div>
        </section>

        <section className="problem-section section-pad" aria-labelledby="problem-heading">
          <div className="page-width">
            <div className="section-heading centered-heading">
              <p className="eyebrow"><span className="eyebrow-dot" /> Why it matters</p>
              <h2 id="problem-heading">Good intentions need <span>good coordination.</span></h2>
              <p>Sharing food should feel simple. These are the gaps AnnaChakra helps bridge.</p>
            </div>
            <div className="challenge-grid">
              {challenges.map((challenge, index) => {
                const Icon = challenge.icon
                return (
                  <article className="challenge-card" key={challenge.title}>
                    <div className="card-topline">
                      <span className="soft-icon"><Icon size={21} strokeWidth={1.8} /></span>
                      <span className="card-index">0{index + 1}</span>
                    </div>
                    <h3>{challenge.title}</h3>
                    <p>{challenge.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="steps-section section-pad" id="how-it-works">
          <div className="page-width">
            <div className="section-heading">
              <p className="eyebrow"><span className="eyebrow-dot" /> A simple shared journey</p>
              <h2>From the kitchen <span>to the community.</span></h2>
              <p>Each step helps kitchens and NGOs stay in sync from planning to receipt.</p>
            </div>
            <div className="steps-grid">
              {steps.map((step) => {
                const Icon = step.icon
                return (
                  <article className="step-card" key={step.number}>
                    <div className="step-card-top">
                      <span className="step-icon"><Icon size={22} strokeWidth={1.8} /></span>
                      <span className="step-number">{step.number}</span>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                )
              })}
            </div>
            <div className="steps-footnote">
              <span className="footnote-mark" aria-hidden="true"><Leaf size={17} /></span>
              <p>Every handoff is a chance to keep good food moving with care.</p>
            </div>
          </div>
        </section>

        <section className="join-section section-pad" id="join-us">
          <div className="page-width">
            <div className="section-heading centered-heading join-heading">
              <p className="eyebrow"><span className="eyebrow-dot" /> Be part of the circle</p>
              <h2>There’s a place for <span>you at this table.</span></h2>
              <p>Whether you prepare food or bring communities together, let’s make sharing easier.</p>
            </div>
            <div className="role-grid">
              {roles.map((role) => {
                const Icon = role.icon
                return (
                  <article className={`role-card role-card-${role.tone}`} key={role.id} id={`join-${role.id}`}>
                    <div className="role-card-heading">
                      <span className="role-icon"><Icon size={23} strokeWidth={1.8} /></span>
                      <span className="role-eyebrow">{role.eyebrow}</span>
                    </div>
                    <h3>{role.title}</h3>
                    <p className="role-description">{role.description}</p>
                    <ul>
                      {role.benefits.map((benefit) => (
                        <li key={benefit}><Check size={16} aria-hidden="true" />{benefit}</li>
                      ))}
                    </ul>
                    <a className="button button-green role-button" href={role.href}>
                      {role.action}
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="page-width final-cta-inner">
            <div>
              <p className="eyebrow"><span className="eyebrow-dot" /> A little goes a long way</p>
              <h2>Let’s make room for <span>one more meal.</span></h2>
              <p>Join a growing circle of kitchens and NGOs working together to share food with purpose.</p>
            </div>
            <a className="button button-light" href="#join-us">
              Find your place
              <ArrowRight size={17} aria-hidden="true" />
            </a>
            <Leaf className="cta-leaf" size={128} strokeWidth={0.75} aria-hidden="true" />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-main">
          <div className="footer-brand-block">
            <a className="brand footer-brand" href="#home">
              <span className="brand-mark" aria-hidden="true"><Leaf size={20} strokeWidth={2.1} /></span>
              <span>Anna<span className="brand-light">Chakra</span></span>
            </a>
            <p>A shared table starts with a thoughtful connection. Let’s help good food find its way.</p>
          </div>
          <div className="footer-links">
            <span className="footer-label">Explore</span>
            <a href="#about">About</a>
            <a href="#how-it-works">How it works</a>
            <a href="#join-us">Join us</a>
          </div>
          <div className="footer-links">
            <span className="footer-label">Get started</span>
            <a href="/login">Log in</a>
            <a href="/register?role=kitchen">Kitchen registration</a>
            <a href="/register?role=ngo">NGO registration</a>
          </div>
        </div>
        <div className="page-width footer-bottom">
          <span>© {new Date().getFullYear()} AnnaChakra. All rights reserved.</span>
          <span>Food shared with purpose <Leaf size={14} aria-hidden="true" /></span>
        </div>
      </footer>
    </div>
  )
}

export default App
