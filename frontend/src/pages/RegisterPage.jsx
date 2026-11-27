import { useState } from "react";
import { Eye, EyeOff, HandHeart, CookingPot, Leaf } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthField from "../components/AuthField";
import { getApiErrorMessage, registerUser } from "../services/auth";
import AuthLayout from "./AuthLayout";

const roles = [
  { value: "KITCHEN_STAFF", label: "Kitchen", description: "Share surplus food", Icon: CookingPot },
  { value: "NGO_MANAGER", label: "NGO", description: "Receive food donations", Icon: HandHeart },
];

function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedRole = searchParams.get("role")?.toLowerCase();
  const [role, setRole] = useState(requestedRole === "ngo" ? "NGO_MANAGER" : "KITCHEN_STAFF");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateForm = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    const email = form.email.trim();
    const phoneDigits = form.phone.replace(/\D/g, "");

    if (!form.name.trim()) nextErrors.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!/^\+?[0-9\s().-]{7,20}$/.test(form.phone.trim()) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      nextErrors.phone = "Enter a valid phone number.";
    }
    if (form.password.length < 8 || form.password.length > 128) {
      nextErrors.password = "Use a password between 8 and 128 characters.";
    }
    if (!form.confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    if (!termsAccepted) nextErrors.terms = "Please accept the terms to create an account.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await registerUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role,
      });
      navigate("/login?registered=1", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout pageClass="auth-register-page">
      <div className="auth-heading">
        <span className="auth-mobile-mark" aria-hidden="true"><Leaf size={20} /></span>
        <p className="eyebrow"><span className="eyebrow-dot" /> A place at the table</p>
        <h2>Create Your Account</h2>
        <p>Join AnnaChakra and help reduce food waste.</p>
      </div>

      <form className="auth-form register-form" onSubmit={submitRegistration} noValidate>
        {error && <div className="auth-alert" role="alert">{error}</div>}

        <fieldset className="role-picker">
          <legend>Organization role</legend>
          <div className="role-picker-options">
            {roles.map(({ value, label, description, Icon }) => (
              <label className={`role-option${role === value ? " is-selected" : ""}`} key={value}>
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                <span className="role-option-icon"><Icon size={19} aria-hidden="true" /></span>
                <span className="role-option-copy"><strong>{label}</strong><small>{description}</small></span>
                <span className="role-radio" aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        <AuthField id="register-name" label="Full name" error={errors.name}>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={150}
            value={form.name}
            onChange={updateForm("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "register-name-error" : undefined}
            required
          />
        </AuthField>

        <div className="register-field-row">
          <AuthField id="register-email" label="Email address" error={errors.email}>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={updateForm("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "register-email-error" : undefined}
              required
            />
          </AuthField>
          <AuthField
            id="register-phone"
            label="Phone number"
            error={errors.phone}
            hint="Used when setting up your organization."
          >
            <input
              id="register-phone"
              name="tel"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={updateForm("phone")}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "register-phone-error" : "register-phone-hint"}
              required
            />
          </AuthField>
        </div>

        <div className="register-field-row">
          <AuthField id="register-password" label="Password" error={errors.password} hint="At least 8 characters.">
            <div className="password-control">
              <input
                id="register-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                maxLength={128}
                value={form.password}
                onChange={updateForm("password")}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "register-password-error" : "register-password-hint"}
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
          <AuthField id="register-confirm-password" label="Confirm password" error={errors.confirmPassword}>
            <div className="password-control">
              <input
                id="register-confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                maxLength={128}
                value={form.confirmPassword}
                onChange={updateForm("confirmPassword")}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "register-confirm-password-error" : undefined}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </AuthField>
        </div>

        <label className={`check-label terms-label${errors.terms ? " has-error" : ""}`}>
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => {
              setTermsAccepted(event.target.checked);
              setErrors((current) => ({ ...current, terms: "" }));
            }}
          />
          <span>I agree to the <span className="terms-name">Terms and Conditions</span></span>
        </label>
        {errors.terms && <span className="field-error terms-error" role="alert">{errors.terms}</span>}

        <button className="button button-green auth-submit" type="submit" disabled={loading}>
          {loading && <span className="auth-spinner" aria-hidden="true" />}
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </AuthLayout>
  )
}

export default RegisterPage
