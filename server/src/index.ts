import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
const { server } = createApp()
server.listen(port, () => console.log(`myworkchess server on http://localhost:${port}`))
