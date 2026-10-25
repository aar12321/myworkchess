import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
export function getSocket(): Socket {
  if (!socket) socket = io({ withCredentials: true, autoConnect: false })
  if (!socket.connected && !socket.active) socket.connect()
  return socket
}
export function closeSocket() { socket?.disconnect(); socket = null }
