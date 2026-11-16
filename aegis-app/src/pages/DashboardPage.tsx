import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  hr_manager: 'HR Manager',
  recruiter: 'Recruiter',
  employee: 'Employee',
}

export default function DashboardPage() {
  const { account, roles, session, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const displayName = account?.display_name || account?.username || session?.user.email || 'Team member'

  async function handleSignOut() {
    setSignOutError(null)
    try {
      await signOut()
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">A</span><span>AEGIS</span></div>
        <div className="topbar-right">
          <span className="workspace-label">HRIS WORKSPACE</span>
          <button className="text-button" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <section className="workspace-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h1>Welcome, {displayName}</h1>
            <p className="page-subtitle">Your AEGIS workspace is connected and your account permissions have been loaded.</p>
          </div>
          <span className="connection-status"><span /> Connected</span>
        </div>

        {signOutError && <p className="form-error" role="alert">{signOutError}</p>}

        <section className="account-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACCOUNT ACCESS</p>
              <h2>Your access profile</h2>
            </div>
            <span className="active-pill">Active account</span>
          </div>
          <dl className="account-details">
            <div><dt>Display name</dt><dd>{displayName}</dd></div>
            <div><dt>Email address</dt><dd>{session?.user.email ?? '—'}</dd></div>
            <div><dt>Employee record</dt><dd>{account?.employee_id ? 'Linked' : 'Not linked'}</dd></div>
            <div>
              <dt>Assigned roles</dt>
              <dd className="role-list">
                {roles.map((role) => <span className="role-chip" key={role}>{roleLabels[role] ?? role}</span>)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="next-stage-panel">
          <p className="eyebrow">AVAILABLE MODULE</p>
          <h2>Employee directory is ready for initial use.</h2>
          <p>Browse employee records, search by name or organization assignment, and maintain employee profiles when your role allows it. Supabase row-level security remains the authority for which records can be read or changed.</p>
          <Link className="primary-button compact-button employee-directory-link" to="/employees">Open employee directory <span>→</span></Link>
        </section>
        <section className="next-stage-panel upcoming-modules">
          <p className="eyebrow">NEXT DEVELOPMENT STAGES</p>
          <h2>Recruitment, leave, compensation, and document workflows.</h2>
          <p>These modules will be added against the approved functional requirements, with database authorization and automated tests verified as each workflow is delivered.</p>
        </section>
      </section>
    </main>
  )
}
