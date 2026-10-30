import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to verify page for security
  // Admin access is controlled via middleware and ADMIN_PANEL_ENABLED env variable
  redirect('/verify');
}
