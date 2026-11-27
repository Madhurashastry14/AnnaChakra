import { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import AuthPage from './pages/AuthPage.jsx'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import KitchenLayout from './components/kitchen/KitchenLayout.jsx'
import KitchenSetupPage from './pages/kitchen/KitchenSetupPage.jsx'
import KitchenSettingsPage from './pages/kitchen/KitchenSettingsPage.jsx'
import KitchenDashboardPage from './pages/kitchen/KitchenDashboardPage.jsx'
import ForecastPage from './pages/kitchen/ForecastPage.jsx'
import ForecastHistoryPage from './pages/kitchen/ForecastHistoryPage.jsx'
import ForecastDetailPage from './pages/kitchen/ForecastDetailPage.jsx'
import MealRecordsPage from './pages/kitchen/MealRecordsPage.jsx'
import MealRecordFormPage from './pages/kitchen/MealRecordFormPage.jsx'
import MealRecordDetailPage from './pages/kitchen/MealRecordDetailPage.jsx'
import ScannerPage from './pages/kitchen/ScannerPage.jsx'
import WasteLogsPage from './pages/kitchen/WasteLogsPage.jsx'
import WasteLogFormPage from './pages/kitchen/WasteLogFormPage.jsx'
import WasteLogDetailPage from './pages/kitchen/WasteLogDetailPage.jsx'
import AnalyticsPage from './pages/kitchen/AnalyticsPage.jsx'
import PortionRecommendationsPage from './pages/kitchen/PortionRecommendationsPage.jsx'
import DeliveryPage from './pages/kitchen/DeliveryPage.jsx'
import DonationsPage from './pages/kitchen/DonationsPage.jsx'
import SurplusPage from './pages/kitchen/SurplusPage.jsx'
import MatchingPage from './pages/kitchen/MatchingPage.jsx'
import DonationOfferPage from './pages/kitchen/DonationOfferPage.jsx'
import DonationDetailPage from './pages/kitchen/DonationDetailPage.jsx'
import KitchenNotFoundPage from './pages/kitchen/KitchenNotFoundPage.jsx'
import PortalLayout from './components/portal/PortalLayout.jsx'
import NgoSetupPage from './pages/ngo/NgoSetupPage.jsx'
import NgoDashboardPage from './pages/ngo/NgoDashboardPage.jsx'
import NgoProfilePage from './pages/ngo/NgoProfilePage.jsx'
import RequirementsPage from './pages/ngo/RequirementsPage.jsx'
import RequirementFormPage from './pages/ngo/RequirementFormPage.jsx'
import DonationOffersPage from './pages/ngo/DonationOffersPage.jsx'
import NgoDonationDetailPage from './pages/ngo/DonationDetailPage.jsx'
import NgoDeliveriesPage from './pages/ngo/DeliveriesPage.jsx'
import ImpactAnalyticsPage from './pages/ngo/ImpactAnalyticsPage.jsx'
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx'
import OrganizationManagementPage from './pages/admin/OrganizationManagementPage.jsx'
import DonationMonitoringPage from './pages/admin/DonationMonitoringPage.jsx'
import DeliveryMonitoringPage from './pages/admin/DeliveryMonitoringPage.jsx'
import PlatformAnalyticsPage from './pages/admin/PlatformAnalyticsPage.jsx'
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

function HomePage() {
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
              <Link className="login-link" to="/login" onClick={closeMenu}>
                Log in
              </Link>
              <Link className="button button-small button-green" to="/register" onClick={closeMenu}>
                Register
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
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
                <Link className="button button-green" to="/register?role=kitchen">
                  Join as Kitchen
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className="button button-outline" to="/register?role=ngo">
                  Join as NGO
                </Link>
              </div>
              <p className="existing-user">
                Already part of the circle? <Link to="/login">Log in</Link>
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
                    <Link className="button button-green role-button" to={role.href}>
                      {role.action}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
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
            <Link to="/login">Log in</Link>
            <Link to="/register?role=kitchen">Kitchen registration</Link>
            <Link to="/register?role=ngo">NGO registration</Link>
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

function App() {
  const location = useLocation()

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/login"
        element={<AuthPage key={`${location.pathname}${location.search}`} mode="login" />}
      />
      <Route
        path="/register"
        element={<AuthPage key={`${location.pathname}${location.search}`} mode="register" />}
      />
      <Route
        path="/kitchen/setup"
        element={
          <ProtectedRoute roles={["KITCHEN_STAFF"]}>
            <KitchenSetupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute roles={["KITCHEN_STAFF"]}>
            <KitchenLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/kitchen/dashboard" replace />} />
        <Route path="dashboard" element={<KitchenDashboardPage />} />
        <Route path="menu-planner" element={<Navigate to="/kitchen/forecast" replace />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="forecasts" element={<ForecastHistoryPage />} />
        <Route path="forecasts/:id" element={<ForecastDetailPage />} />
        <Route path="meal-records" element={<MealRecordsPage />} />
        <Route path="meal-records/new" element={<MealRecordFormPage />} />
        <Route path="meal-records/:id" element={<MealRecordDetailPage />} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="waste-logs" element={<WasteLogsPage />} />
        <Route path="waste-logs/new" element={<WasteLogFormPage />} />
        <Route path="waste-logs/:id/edit" element={<WasteLogFormPage />} />
        <Route path="waste-logs/:id" element={<WasteLogDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="recommendations" element={<PortionRecommendationsPage />} />
        <Route path="delivery" element={<DeliveryPage />} />
        <Route path="donations" element={<DonationsPage />} />
        <Route path="donations/new" element={<DonationOfferPage />} />
        <Route path="donations/:id" element={<DonationDetailPage />} />
        <Route path="surplus" element={<SurplusPage />} />
        <Route path="matching" element={<MatchingPage />} />
        <Route path="settings" element={<KitchenSettingsPage />} />
        <Route path="*" element={<KitchenNotFoundPage />} />
      </Route>
      <Route
        path="/ngo"
        element={
          <ProtectedRoute roles={["NGO_MANAGER"]}>
            <PortalLayout role="NGO_MANAGER" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/ngo/dashboard" replace />} />
        <Route path="setup" element={<NgoSetupPage />} />
        <Route path="dashboard" element={<NgoDashboardPage />} />
        <Route path="profile" element={<NgoProfilePage />} />
        <Route path="requirements" element={<RequirementsPage />} />
        <Route path="requirements/new" element={<RequirementFormPage />} />
        <Route path="requirements/:id/edit" element={<RequirementFormPage />} />
        <Route path="donations" element={<DonationOffersPage />} />
        <Route path="donations/:id" element={<NgoDonationDetailPage />} />
        <Route path="deliveries" element={<NgoDeliveriesPage />} />
        <Route path="analytics" element={<ImpactAnalyticsPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <PortalLayout role="ADMIN" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="kitchens" element={<OrganizationManagementPage type="kitchens" />} />
        <Route path="ngos" element={<OrganizationManagementPage type="ngos" />} />
        <Route path="donations" element={<DonationMonitoringPage />} />
        <Route path="deliveries" element={<DeliveryMonitoringPage />} />
        <Route path="analytics" element={<PlatformAnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
