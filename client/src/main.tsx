import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PokerTable from './pages/table/poker-table.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <App /> */}
    <PokerTable/>
  </StrictMode>,
)
