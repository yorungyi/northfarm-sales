import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InputPage from './pages/InputPage'
import MonthlyPage from './pages/MonthlyPage'
import DetailPage from './pages/DetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/input" replace />} />
        <Route path="/input" element={<InputPage />} />
        <Route path="/monthly" element={<MonthlyPage />} />
        <Route path="/detail/:date" element={<DetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
