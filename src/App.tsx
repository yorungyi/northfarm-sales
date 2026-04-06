import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import InputPage from './pages/InputPage'
import MonthlyPage from './pages/MonthlyPage'
import DetailPage from './pages/DetailPage'
import ClosingPage from './pages/ClosingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<DashboardPage />} />
        <Route path="/input"      element={<InputPage />} />
        <Route path="/monthly"    element={<MonthlyPage />} />
        <Route path="/detail/:date" element={<DetailPage />} />
        <Route path="/closing"    element={<ClosingPage />} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
