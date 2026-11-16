import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="AEGIS introduction">
        <div className="brand-lockup"><span className="brand-mark">A</span><span>AEGIS</span></div>
        <div className="brand-copy">
          <p className="eyebrow">HUMAN RESOURCES · RECRUITMENT</p>
          <h1>People operations,<br />with clarity.</h1>
          <p>A single workspace for employee information, recruitment, and the workflows that connect them.</p>
        </div>
        <p className="brand-footer">AEGIS HRIS · INTERNAL WORKSPACE</p>
      </section>

      <section className="auth-form-panel">
        <div className="login-card">
          <div className="mobile-brand"><span className="brand-mark">A</span><span>AEGIS</span></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to AEGIS</h2>
          <p className="form-intro">Use the account provided by your administrator.</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-footnote">Access is managed by your organization. Public account registration is disabled.</p>
        </div>
      </section>
    </main>
  )
}
