import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminApp from './AdminApp'
import ResidentApp from './ResidentApp'
import './index.css'

// Route by hostname: admin.yesilyakasupilates.com → admin console (login-gated);
// the apex/www domain → resident booking. `?admin=1` and `admin.localhost`
// let you reach the admin build in local dev.
const host = window.location.hostname
const params = new URLSearchParams(window.location.search)
const isAdmin = host.startsWith('admin.') || params.get('admin') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isAdmin ? <AdminApp /> : <ResidentApp />}</React.StrictMode>,
)
