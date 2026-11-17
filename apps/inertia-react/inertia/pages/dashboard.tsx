import Page from '~/components/page'
import { LayoutGrid } from 'lucide-react'
import AppLayout from '~/layouts/app'
import VerifyEmailNotice from '~/components/verify_email_notice'

export default function Dashboard() {
  return (
    <Page title="Dashboard" hideTitle>
      <VerifyEmailNotice />
      <div className="empty">
        <div className="empty__mark">
          <LayoutGrid size={22} />
        </div>
        <h1>Your dashboard is ready</h1>
        <nav aria-label="Examples">
          <a href="/notes">Notes</a> · <a href="/reading-items">Reading list</a> ·{' '}
          <a href="/settings/secure-note">Secure note</a>
        </nav>
      </div>
    </Page>
  )
}

Dashboard.layout = [AppLayout]
