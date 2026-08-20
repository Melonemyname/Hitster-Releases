/**
 * Socket.io-Client-Wrapper.
 * Hält eine einzige Socket-Instanz für die gesamte App.
 */

import { io } from 'socket.io-client'
import { getToken, SERVER_URL } from './authService'

let socket = null

const ACK_TIMEOUT_MS = 15000

export function getSocket () {
  return socket
}

export function connect () {
  if (socket?.connected || socket?.active) return socket

  socket = io(SERVER_URL, {
    auth: { token: getToken() },
    transports: ['polling'],
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Verbindungsfehler:', err.message)
  })

  return socket
}

export function waitForConnect (timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const s = connect()
    if (s.connected) return resolve(s)

    let settled = false
    const settle = (fn, val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      s.off('connect', onConnect)
      s.off('connect_error', onError)
      fn(val)
    }

    const timer = setTimeout(() => {
      settle(reject, new Error('Verbindungs-Timeout: Server nicht erreichbar'))
    }, timeoutMs)

    const onConnect = () => settle(resolve, s)
    const onError = (err) => {
      if (err.message && (err.message.includes('Token') || err.message.includes('abgelaufen'))) {
        settle(reject, err)
      }
    }

    s.once('connect', onConnect)
    s.on('connect_error', onError)
  })
}

export function disconnect () {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function emit (event, data) {
  if (!socket?.connected) {
    console.warn(`[Socket] Nicht verbunden – Event "${event}" konnte nicht gesendet werden`)
    return false
  }
  socket.emit(event, data)
  return true
}

export function emitWithAck (event, data, timeoutMs = ACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`Timeout: Server hat nicht rechtzeitig auf "${event}" geantwortet`))
      }
    }, timeoutMs)

    waitForConnect().then((s) => {
      if (settled) return
      s.emit(event, data, (response) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (response?.error) reject(new Error(response.error))
        else resolve(response)
      })
    }).catch((err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

export function on (event, handler) {
  socket?.on(event, handler)
}

export function off (event, handler) {
  socket?.off(event, handler)
}

export function onReconnect (handler) {
  const s = connect()
  s.io.on('reconnect', handler)
}

export function offReconnect (handler) {
  if (socket) socket.io.off('reconnect', handler)
}
