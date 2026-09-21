import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider, RequireAuth } from './lib/auth'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

// Marketing is eager (first paint); the app and auth screens load on demand.
const PricingPage = lazy(() => import('./pages/PricingPage'))
const LoginPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.SignupPage })))
const AppLayout = lazy(() => import('./pages/app/AppLayout'))
const Dashboard = lazy(() => import('./pages/app/Dashboard'))
const Capture = lazy(() => import('./pages/app/Capture'))
const Job = lazy(() => import('./pages/app/Job'))
const Documents = lazy(() => import('./pages/app/Documents'))
const DocumentEditor = lazy(() => import('./pages/app/DocumentEditor'))
const Templates = lazy(() => import('./pages/app/Templates'))
const Knowledge = lazy(() => import('./pages/app/Knowledge'))
const Settings = lazy(() => import('./pages/app/Settings'))

function Root() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <Suspense fallback={<div className="min-h-svh bg-paper" />}>
        <Outlet />
      </Suspense>
      <Toaster
        position="bottom-right"
        toastOptions={{ style: { fontFamily: 'var(--font-sans)', borderRadius: '14px', border: '1px solid #D9E1EA' } }}
      />
    </AuthProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      {
        path: '/app',
        element: <RequireAuth><AppLayout /></RequireAuth>,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'capture', element: <Capture /> },
          { path: 'jobs/:id', element: <Job /> },
          { path: 'documents', element: <Documents /> },
          { path: 'documents/:id', element: <DocumentEditor /> },
          { path: 'templates', element: <Templates /> },
          { path: 'knowledge', element: <Knowledge /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
