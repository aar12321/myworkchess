import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  // Honour the OS "reduce motion" setting for the JS-driven animations too.
  <MotionConfig reducedMotion="user"><App /></MotionConfig>
)
