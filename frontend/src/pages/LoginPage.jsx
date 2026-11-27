import { useState } from "react";
import { Eye, EyeOff, Leaf } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthField from "../components/AuthField";
import { getApiErrorMessage, loginUser } from "../services/auth";
import { saveAuthSession } from "../services/authStorage";
import AuthLayout from "./AuthLayout";

const dashboardByRole = {
  KITCHEN_STAFF: "/kitchen/dashboard",
  NGO_MANAGER: "/ngo/dashboard",
  ADMIN: "/admin/dashboard",
};

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const submitLogin = async (event) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();
    let isValid = true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError("Enter a valid email address.");
      isValid = false;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError("Enter your password.");
      isValid = false;
    } else {
      setPasswordError("");
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const response = await loginUser({ email: normalizedEmail, password });
      const destination = dashboardByRole[response.user?.role];

      if (!response.access_token || !destination) {
        setError("The server returned an unexpected login response. Please try again.");
        return;
      }

      saveAuthSession(response.access_token, response.user.role, rememberMe);
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not sign you in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout pageClass="auth-login-page">
      <div className="auth-heading">
        <span className="auth-mobile-mark" aria-hidden="true"><Leaf size={20} /></span>
        <p className="eyebrow"><span className="eyebrow-dot" /> Welcome to the circle</p>
        <h2>Welcome Back!</h2>
        <p>Sign in to continue reducing food waste.</p>
      </div>

      {searchParams.get("registered") === "1" && (
        <div className="auth-notice" role="status">Your account is ready. Sign in to continue.</div>
      )}
      {searchParams.get("forgot") === "1" && (
        <div className="auth-notice" role="status">Password reset is not available yet. Please contact your administrator.</div>
      )}

      <form className="auth-form" onSubmit={submitLogin} noValidate>
        {error && <div className="auth-alert" role="alert">{error}</div>}

        <AuthField id="login-email" label="Email address" error={emailError}>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError("");
            }}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "login-email-error" : undefined}
            required
          />
        </AuthField>

        <AuthField id="login-password" label="Password" error={passwordError}>
          <div className="password-control">
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
              }}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? "login-password-error" : undefined}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </AuthField>

        <div className="auth-form-options">
          <label className="check-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <Link className="auth-text-button" to="/login?forgot=1">
            Forgot password?
          </Link>
        </div>

        <button className="button button-green auth-submit" type="submit" disabled={loading}>
          {loading && <span className="auth-spinner" aria-hidden="true" />}
          {loading ? "Signing in..." : "Log in"}
        </button>
      </form>

      <p className="auth-switch">
        Don’t have an account? <Link to="/register">Register</Link>
      </p>
    </AuthLayout>
  )
}

export default LoginPage
