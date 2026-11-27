import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Leaf, LockKeyhole, Mail, UserRound } from 'lucide-react'
import api from '../services/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import './AuthPage.css'

function getErrorMessage(error) {
  const detail = error.response?.data?.detail

  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  return 'We couldn’t complete that request. Please try again.'
}

function AuthPage({ mode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { login, logout } = useAuth()
  const isRegister = mode === 'register'
  const requestedRole = new URLSearchParams(location.search).get('role')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(requestedRole === 'ngo' ? 'NGO_MANAGER' : 'KITCHEN_STAFF')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(
    location.state?.expired ? 'Your session expired. Please log in again.' : '',
  )
  const [registered, setRegistered] = useState(false)
  const [signedInUser, setSignedInUser] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (isRegister) {
        await api.post('/api/v1/auth/register', {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
        })
        setRegistered(true)
      } else {
        const user = await login(email.trim(), password)
        const rolePrefix = {
          KITCHEN_STAFF: '/kitchen',
          NGO_MANAGER: '/ngo',
          ADMIN: '/admin',
        }[user.role]
        const requestedPath = location.state?.from
        const destination = rolePrefix && requestedPath?.startsWith(rolePrefix)
          ? requestedPath
          : rolePrefix
        if (destination) {
          navigate(destination, { replace: true })
          return
        }
        if (user.role === 'NGO_MANAGER') {
          navigate('/ngo/donations', { replace: true })
          return
        }
        setSignedInUser(user)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  function signOut() {
    logout()
    setSignedInUser(null)
    setPassword('')
  }

  return (
    <main className="auth-page">
      <aside className="auth-story">
        <Link className="auth-brand" to="/" aria-label="AnnaChakra home">
          <span className="auth-brand-mark"><Leaf size={21} /></span>
          <span>Anna<span>Chakra</span></span>
        </Link>

        <div className="auth-story-content">
          <span className="auth-kicker"><span /> FOOD SHARED WITH PURPOSE</span>
          <h1>Good food brings us <em>together.</em></h1>
          <p>
            Join the kitchens and community partners making sure good food finds its way to
            the people who need it.
          </p>
          <div className="auth-story-note">
            <span className="auth-note-icon"><Check size={18} /></span>
            <span><strong>One thoughtful connection</strong><small>can make a meaningful difference.</small></span>
          </div>
        </div>

        <div className="auth-story-footer">
          <span>PLAN WITH CARE</span><i /><span>SHARE WITH PURPOSE</span>
        </div>
      </aside>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-top">
          <Link className="auth-back-link" to="/"><ArrowLeft size={16} /> Back to home</Link>
          <p>
            {isRegister ? 'Already have an account?' : 'New to AnnaChakra?'}
            {' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Log in' : 'Create account'}
            </Link>
          </p>
        </div>

        <div className="auth-form-wrap">
          <span className="auth-form-icon"><Leaf size={20} /></span>
          {signedInUser ? (
            <div className="auth-success-state">
              <p className="auth-form-eyebrow">WELCOME BACK</p>
              <h2 id="auth-heading">You’re signed in.</h2>
              <p className="auth-subtitle">
                Welcome, {signedInUser.name}. Your AnnaChakra account is ready.
              </p>
              <div className="auth-account-card">
                <span className="auth-account-avatar">{signedInUser.name?.charAt(0)?.toUpperCase()}</span>
                <span><strong>{signedInUser.name}</strong><small>{signedInUser.email}</small></span>
              </div>
              <Link className="auth-submit auth-home-button" to="/">
                Continue to AnnaChakra <ArrowRight size={17} />
              </Link>
              <button className="auth-signout" type="button" onClick={signOut}>Sign out</button>
            </div>
          ) : registered ? (
            <div className="auth-success-state">
              <p className="auth-form-eyebrow">ACCOUNT CREATED</p>
              <h2 id="auth-heading">Welcome to the circle.</h2>
              <p className="auth-subtitle">
                Your account is ready. Log in to continue to AnnaChakra.
              </p>
              <Link className="auth-submit auth-home-button" to="/login">
                Go to log in <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <>
              <p className="auth-form-eyebrow">{isRegister ? 'JOIN THE CIRCLE' : 'WELCOME BACK'}</p>
              <h2 id="auth-heading">{isRegister ? 'Create your account' : 'Log in to your account'}</h2>
              <p className="auth-subtitle">
                {isRegister
                  ? 'A few details and you’re ready to get started.'
                  : 'Pick up where your community left off.'}
              </p>

              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister && (
                  <>
                    <label className="auth-label" htmlFor="auth-name">Your name</label>
                    <div className="auth-input-wrap">
                      <UserRound size={17} aria-hidden="true" />
                      <input
                        id="auth-name"
                        type="text"
                        name="name"
                        autoComplete="name"
                        placeholder="e.g. Maya Sharma"
                        maxLength={150}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                      />
                    </div>

                    <label className="auth-label" htmlFor="auth-role">I’m joining as</label>
                    <select
                      className="auth-select"
                      id="auth-role"
                      name="role"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                    >
                      <option value="KITCHEN_STAFF">Kitchen staff</option>
                      <option value="NGO_MANAGER">NGO manager</option>
                    </select>
                  </>
                )}

                <label className="auth-label" htmlFor="auth-email">Email address</label>
                <div className="auth-input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    id="auth-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={255}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                <label className="auth-label" htmlFor="auth-password">Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                    minLength={isRegister ? 8 : 1}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {error && <p className="auth-error" role="alert">{error}</p>}

                <button className="auth-submit" type="submit" disabled={submitting}>
                  {submitting
                    ? (isRegister ? 'Creating account…' : 'Logging in…')
                    : (isRegister ? 'Create account' : 'Log in')}
                  {!submitting && <ArrowRight size={17} aria-hidden="true" />}
                </button>
              </form>

              <p className="auth-privacy-note">
                Your information is used only to support food sharing in your community.
              </p>
            </>
          )}
        </div>

        <div className="auth-panel-footer">
          <span>© {new Date().getFullYear()} AnnaChakra</span>
          <span>Every meal matters <Leaf size={13} /></span>
        </div>
      </section>
    </main>
  )
}

export default AuthPage
