import App from './App'
import { SetupNotice } from './Notice'
import { isConfigured } from './supabase'
import { useStudio } from './useStudio'

export default function ResidentApp() {
  if (!isConfigured) return <SetupNotice />
  return <ResidentInner />
}

function ResidentInner() {
  const store = useStudio('resident')
  return <App store={store} />
}
