import { useEffect, useMemo, useRef, useState } from 'react'
import Peer from 'peerjs'
import { QRCodeCanvas } from 'qrcode.react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/ReactToastify.css'
import './App.css'

const GRID = 15

const PATH = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
]

const START_OFFSETS = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39,
}

const HOME_PATHS = {
  green: [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
  ],
  yellow: [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ],
  blue: [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
    [7, 8],
  ],
  red: [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
    [8, 7],
  ],
}

const BASE_SPOTS = {
  green: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  yellow: [
    [1, 11],
    [1, 13],
    [3, 11],
    [3, 13],
  ],
  blue: [
    [11, 11],
    [11, 13],
    [13, 11],
    [13, 13],
  ],
  red: [
    [11, 1],
    [11, 3],
    [13, 1],
    [13, 3],
  ],
}

const COLOR_ORDER = ['green', 'yellow', 'blue', 'red']
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47])

const COLOR_NAMES = {
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
  red: 'Red',
}

const P2P_HOST_COLOR = 'green'
const P2P_GUEST_COLOR = 'red'
const ROOM_CODE_LENGTH = 6
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function getAvailableColorsForCount(count) {
  if (count === 2) return ['green', 'red']
  if (count === 3) return ['green', 'yellow', 'blue']
  return COLOR_ORDER
}

function formatGroupedCode(code, groupSize = 3, groupsPerLine = 2) {
  const raw = String(code || '').trim().replace(/\s+/g, '')
  if (!raw) return ''
  const groups = []
  for (let i = 0; i < raw.length; i += groupSize) {
    groups.push(raw.slice(i, i + groupSize))
  }
  const lines = []
  for (let i = 0; i < groups.length; i += groupsPerLine) {
    lines.push(groups.slice(i, i + groupsPerLine).join(' '))
  }
  return lines.join('\n')
}

function shortDisplayCodeFromLong(code) {
  const alphabet = ROOM_CODE_CHARS
  const raw = String(code || '').trim()
  if (!raw) return ''
  let hash = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  let x = hash || 1
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out += alphabet[x & 31]
  }
  return out
}

function generateRoomCode(length = ROOM_CODE_LENGTH) {
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

function sanitizeRoomCode(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^A-Z0-9]/g, '')
  const filtered = normalized
    .split('')
    .filter((ch) => ROOM_CODE_CHARS.includes(ch))
    .join('')
  return filtered.slice(0, ROOM_CODE_LENGTH)
}

function parseRoomCodeInput(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  try {
    const maybeUrl = new URL(raw)
    const extracted = maybeUrl.searchParams.get('room')
    if (extracted) return sanitizeRoomCode(extracted)
  } catch {
    // Not a URL. Continue as raw code.
  }
  return sanitizeRoomCode(raw)
}

function createPlayers(colors = COLOR_ORDER, namesByColor = {}, botByColor = {}) {
  return colors.map((color) => ({
    id: color,
    name: namesByColor[color] || COLOR_NAMES[color],
    color,
    isBot: Boolean(botByColor[color]),
    tokens: Array.from({ length: 4 }, (_, idx) => ({
      id: `${color}-${idx}`,
      steps: -1,
    })),
  }))
}

function getTrackIndex(color, steps) {
  const offset = START_OFFSETS[color]
  return (offset + steps) % PATH.length
}

function getTokenCoord(color, token, tokenIndex) {
  if (token.steps === -1) {
    return BASE_SPOTS[color][tokenIndex]
  }
  if (token.steps >= 0 && token.steps < 52) {
    return PATH[getTrackIndex(color, token.steps)]
  }
  if (token.steps >= 52 && token.steps < 58) {
    return HOME_PATHS[color][token.steps - 52]
  }
  return HOME_PATHS[color][5]
}

function getTrackIndicesBetween(color, fromSteps, moveValue) {
  const indices = []
  for (let step = 1; step <= moveValue; step += 1) {
    const nextSteps = fromSteps + step
    if (nextSteps >= 52) break
    indices.push(getTrackIndex(color, nextSteps))
  }
  return indices
}

function App() {
  const [phase, setPhase] = useState('setup') // setup | playing
  const [setupStep, setSetupStep] = useState('entry') // entry | mode | p2p_create | p2p_join | settings | ready
  const [playMode, setPlayMode] = useState(null) // local | p2p
  const [playerCount, setPlayerCount] = useState(4)
  const [selectedColors, setSelectedColors] = useState(() => [...COLOR_ORDER])
  const [playerNames, setPlayerNames] = useState({})
  const [myColor, setMyColor] = useState(null)
  const [myName, setMyName] = useState('')
  const [players, setPlayers] = useState(() => createPlayers())
  const [currentPlayer, setCurrentPlayer] = useState(0)
  const [dice, setDice] = useState(null)
  const [lastRoll, setLastRoll] = useState(null)
  const [hasRolled, setHasRolled] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [rollingValue, setRollingValue] = useState(null)
  const [message, setMessage] = useState('Roll to start the game.')
  const [moveMode] = useState('roll')
  const [selectedMove, setSelectedMove] = useState(null)
  const [finishedOrder, setFinishedOrder] = useState([])
  const [eliminatedId, setEliminatedId] = useState(null)
  const [showElimination, setShowElimination] = useState(false)
  const [capturedInfo, setCapturedInfo] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [currentTurnColor, setCurrentTurnColor] = useState(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [captureCredits, setCaptureCredits] = useState({})
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [p2pStatus, setP2pStatus] = useState('idle') // idle | creating | waiting_player | joining | connected | error
  const [isHost, setIsHost] = useState(false)
  const [myOnlineColor, setMyOnlineColor] = useState(null)
  const [lobbyVersion, setLobbyVersion] = useState(0)
  const playersRef = useRef(players)
  const animatingRef = useRef(false)
  const finishedRef = useRef([])
  const phaseRef = useRef(phase)
  const gameOverRef = useRef(gameOver)
  const currentPlayerRef = useRef(currentPlayer)
  const currentTurnColorRef = useRef(currentTurnColor)
  const playerCountRef = useRef(playerCount)
  const diceVisibleUntilRef = useRef(0)
  const diceClearTimerRef = useRef(null)
  const peerRef = useRef(null)
  const connectionRef = useRef(null)
  const hostConnectionsRef = useRef({})
  const peerColorMapRef = useRef({})
  const p2pSendTimerRef = useRef(null)
  const intentionalCloseRef = useRef(false)
  const rollDiceRef = useRef(null)
  const handleMoveTokenRef = useRef(null)
  const applyRemoteStateRef = useRef(null)
  const lastCopiedRef = useRef({ room: '' })
  const didLoadRoomFromUrlRef = useRef(false)

  const activeColors = useMemo(() => {
    return COLOR_ORDER.filter((color) => selectedColors.includes(color))
  }, [selectedColors])

  const availableColors = useMemo(() => {
    return getAvailableColorsForCount(playerCount)
  }, [playerCount])

  useEffect(() => {
    const seen = localStorage.getItem('ludo_tutorial_seen')
    if (!seen) {
      setShowTutorial(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (didLoadRoomFromUrlRef.current) return
    try {
      const url = new URL(window.location.href)
      const room = url.searchParams.get('room')
      if (!room) return
      didLoadRoomFromUrlRef.current = true
      setSetupStep('p2p_join')
      setP2pStatus('idle')
      setPlayMode(null)
      setRoomCode('')
      setRoomCodeInput(sanitizeRoomCode(room))
      toast.info('Room code loaded. Tap "Join Room".')
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    // Keep player objects in sync with editable names.
    setPlayers((prev) => {
      const next = prev.map((player) => {
        const nextName = (playerNames[player.id] || '').trim()
        if (!nextName || nextName === player.name) return player
        return { ...player, name: nextName }
      })
      playersRef.current = next
      return next
    })
  }, [playerNames])

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    finishedRef.current = finishedOrder
  }, [finishedOrder])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    gameOverRef.current = gameOver
  }, [gameOver])

  useEffect(() => {
    currentTurnColorRef.current = currentTurnColor
  }, [currentTurnColor])

  useEffect(() => {
    currentPlayerRef.current = currentPlayer
  }, [currentPlayer])

  useEffect(() => {
    playerCountRef.current = playerCount
  }, [playerCount])

  const hostConnectedGuests = useMemo(
    () =>
      Object.values(hostConnectionsRef.current || {}).filter((conn) => Boolean(conn?.open)).length,
    [lobbyVersion, p2pStatus, playerCount]
  )
  const isP2pConnected =
    playMode === 'p2p' &&
    p2pStatus === 'connected' &&
    (isHost
      ? Object.values(hostConnectionsRef.current || {}).some((conn) => Boolean(conn?.open))
      : Boolean(connectionRef.current?.open))
  const localColor = playMode === 'p2p' ? myOnlineColor : null

  function sendP2pJson(payload) {
    if (isHost) {
      const openConnections = Object.values(hostConnectionsRef.current || {}).filter((conn) =>
        Boolean(conn?.open)
      )
      if (!openConnections.length) return false
      let sent = false
      openConnections.forEach((conn) => {
        try {
          conn.send(payload)
          sent = true
        } catch {
          // ignore a single failed peer
        }
      })
      return sent
    }
    const connection = connectionRef.current
    if (!connection || !connection.open) return false
    try {
      connection.send(payload)
      return true
    } catch {
      return false
    }
  }

  function sendP2pJsonToGuests(payload, excludePeerId = null) {
    const entries = Object.entries(hostConnectionsRef.current || {})
    if (!entries.length) return false
    let sent = false
    entries.forEach(([peerId, conn]) => {
      if (excludePeerId && peerId === excludePeerId) return
      if (!conn?.open) return
      try {
        conn.send(payload)
        sent = true
      } catch {
        // ignore per-peer failure
      }
    })
    return sent
  }

  function normalizeChatMessage(msg, fallbackName = 'Player') {
    if (!msg) return null
    const text = String(msg.text || '').trim()
    if (!text) return null
    const safeName = String(msg.name || '').trim() || fallbackName
    return {
      id: String(msg.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      name: safeName,
      text,
      at:
        String(msg.at || '').trim() ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  }

  function appendChatMessage(msg, fallbackName = 'Player') {
    const normalized = normalizeChatMessage(msg, fallbackName)
    if (!normalized) return
    setChatMessages((prev) => {
      if (prev.some((entry) => entry.id === normalized.id)) return prev
      return [...prev, normalized].slice(-80)
    })
  }

  function getP2pStateSnapshot() {
    return {
      phase,
      playerCount,
      selectedColors,
      playerNames,
      players: playersRef.current,
      currentPlayer,
      dice,
      lastRoll,
      hasRolled,
      isRolling,
      rollingValue,
      currentTurnColor,
      moveMode,
      selectedMove,
      message,
      finishedOrder: finishedRef.current,
      eliminatedId,
      showElimination,
      capturedInfo,
      captureCredits,
      gameOver,
    }
  }

  function sendImmediateP2pState(overrides = {}) {
    if (!isHost || !isP2pConnected) return
    sendP2pJson({
      t: 'state',
      s: {
        ...getP2pStateSnapshot(),
        ...overrides,
      },
    })
  }

  function scheduleP2pStateSync() {
    if (!isHost || !isP2pConnected) return
    if (p2pSendTimerRef.current) return
    p2pSendTimerRef.current = setTimeout(() => {
      p2pSendTimerRef.current = null
      sendP2pJson({
        t: 'state',
        s: getP2pStateSnapshot(),
      })
    }, 80)
  }

  useEffect(() => {
    if (!isHost || !isP2pConnected) return
    scheduleP2pStateSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    playerCount,
    selectedColors,
    playerNames,
    players,
    currentPlayer,
    currentTurnColor,
    dice,
    lastRoll,
    hasRolled,
    isRolling,
    rollingValue,
    moveMode,
    selectedMove,
    message,
    eliminatedId,
    showElimination,
    capturedInfo,
    captureCredits,
    gameOver,
    p2pStatus,
    setupStep,
  ])

  function applyRemoteState(next) {
    if (!next) return
    if (next.playerCount) setPlayerCount(next.playerCount)
    if (next.selectedColors) setSelectedColors(next.selectedColors)
    if (next.playerNames) setPlayerNames(next.playerNames)
    if (next.phase) {
      setPhase(next.phase)
      phaseRef.current = next.phase
    }
    if (Array.isArray(next.players)) {
      playersRef.current = next.players
      setPlayers(next.players)
    }
    if (typeof next.currentPlayer === 'number') {
      currentPlayerRef.current = next.currentPlayer
      setCurrentPlayer(next.currentPlayer)
    }
    if (typeof next.dice !== 'undefined') setDice(next.dice)
    if (typeof next.lastRoll !== 'undefined') setLastRoll(next.lastRoll)
    if (typeof next.hasRolled === 'boolean') setHasRolled(next.hasRolled)
    if (typeof next.isRolling === 'boolean') setIsRolling(next.isRolling)
    if (typeof next.rollingValue !== 'undefined') setRollingValue(next.rollingValue)
    if (typeof next.currentTurnColor === 'string') {
      currentTurnColorRef.current = next.currentTurnColor
      setCurrentTurnColor(next.currentTurnColor)
    }
    if (typeof next.moveMode === 'string') {
      // Roll mode is the only supported move mode in this UI.
    }
    if (typeof next.selectedMove !== 'undefined') setSelectedMove(null)
    if (typeof next.message === 'string') setMessage(next.message)
    if (Array.isArray(next.finishedOrder)) {
      finishedRef.current = next.finishedOrder
      setFinishedOrder(next.finishedOrder)
    }
    if (typeof next.eliminatedId !== 'undefined') setEliminatedId(next.eliminatedId)
    if (typeof next.showElimination === 'boolean') setShowElimination(next.showElimination)
    if (typeof next.capturedInfo !== 'undefined') setCapturedInfo(next.capturedInfo)
    if (next.captureCredits) setCaptureCredits(next.captureCredits)
    if (typeof next.gameOver === 'boolean') setGameOver(next.gameOver)
  }

  useEffect(() => {
    applyRemoteStateRef.current = applyRemoteState
  }, [])

  function cleanupP2p() {
    intentionalCloseRef.current = true
    try {
      if (p2pSendTimerRef.current) {
        clearTimeout(p2pSendTimerRef.current)
        p2pSendTimerRef.current = null
      }
      Object.values(hostConnectionsRef.current || {}).forEach((conn) => {
        try {
          conn?.close?.()
        } catch {
          // ignore
        }
      })
      connectionRef.current?.close?.()
    } catch {
      // ignore
    }
    try {
      peerRef.current?.destroy?.()
    } catch {
      // ignore
    }
    connectionRef.current = null
    hostConnectionsRef.current = {}
    peerColorMapRef.current = {}
    peerRef.current = null
    setRoomCode('')
    setRoomCodeInput('')
    setP2pStatus('idle')
    setIsHost(false)
    setMyOnlineColor(null)
    setLobbyVersion(0)
    setTimeout(() => {
      intentionalCloseRef.current = false
    }, 0)
  }

  useEffect(() => {
    return () => cleanupP2p()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedColors((prev) => {
      const filtered = COLOR_ORDER.filter(
        (color) => prev.includes(color) && availableColors.includes(color)
      )
      if (filtered.length === playerCount) return filtered
      return availableColors.slice(0, playerCount)
    })
  }, [playerCount, availableColors])

  useEffect(() => {
    setPlayerNames((prev) => {
      const next = { ...prev }
      activeColors.forEach((color, idx) => {
        if (typeof next[color] === 'undefined') {
          next[color] = `Player ${idx + 1}`
        }
      })
      return next
    })
  }, [activeColors])

  function playTone({ frequency = 440, duration = 0.12, type = 'sine', volume = 0.15 }) {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)()
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.type = type
      osc.frequency.value = frequency
      gain.gain.value = volume
      osc.connect(gain)
      gain.connect(context.destination)
      osc.start()
      osc.stop(context.currentTime + duration)
      osc.onended = () => context.close()
    } catch (err) {
      // Audio is optional; ignore errors on unsupported devices
    }
  }

  function playMoveSound(stepIndex) {
    const base = 560
    const offset = (stepIndex % 3) * 30
    playTone({ frequency: base + offset, type: 'triangle', duration: 0.06, volume: 0.08 })
  }

  function scheduleDiceClear() {
    if (diceClearTimerRef.current) {
      clearTimeout(diceClearTimerRef.current)
      diceClearTimerRef.current = null
    }
    const now = Date.now()
    const delay = Math.max(0, diceVisibleUntilRef.current - now)
    diceClearTimerRef.current = setTimeout(() => {
      setDice(null)
      diceClearTimerRef.current = null
    }, delay)
  }

  function playSfx(type) {
    switch (type) {
      case 'start':
        playTone({ frequency: 520, type: 'triangle', duration: 0.12, volume: 0.12 })
        playTone({ frequency: 660, type: 'triangle', duration: 0.12, volume: 0.12 })
        break
      case 'join':
        playTone({ frequency: 620, type: 'sine', duration: 0.14, volume: 0.12 })
        break
      case 'error':
        playTone({ frequency: 180, type: 'square', duration: 0.2, volume: 0.12 })
        break
      case 'eliminate':
        playTone({ frequency: 260, type: 'sawtooth', duration: 0.22, volume: 0.14 })
        playTone({ frequency: 180, type: 'square', duration: 0.16, volume: 0.12 })
        break
      case 'capture':
        playTone({ frequency: 420, type: 'square', duration: 0.12, volume: 0.12 })
        playTone({ frequency: 300, type: 'triangle', duration: 0.12, volume: 0.1 })
        break
      case 'win':
        playTone({ frequency: 740, type: 'triangle', duration: 0.16, volume: 0.12 })
        playTone({ frequency: 880, type: 'triangle', duration: 0.16, volume: 0.12 })
        break
      default:
        break
    }
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    if (playMode === 'p2p' && isP2pConnected) {
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: (localColor ? playerNames[localColor] : '') || myName?.trim() || 'Player',
        text,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      sendP2pJson({ t: 'chat', m: msg })
      appendChatMessage(msg, 'You')
      setChatInput('')
      return
    }
    appendChatMessage(
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: current?.name || 'You',
        text,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      'You'
    )
    setChatInput('')
  }

  async function copyText(text, label) {
    const value = String(text || '').trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied.`)
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`)
    }
  }

  function readP2pMessage(raw) {
    if (!raw) return null
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    if (typeof raw === 'object') return raw
    return null
  }

  function handleP2pDisconnect() {
    if (intentionalCloseRef.current) return
    toast.info('Disconnected from room.')
    cleanupP2p()
    setSetupStep('mode')
    setPlayMode(null)
  }

function createHostPeer(maxAttempts = 5) {
    const attemptCreate = (attempt) =>
      new Promise((resolve, reject) => {
        const candidateCode = generateRoomCode()
        const peer = new Peer(candidateCode)
        const onOpen = (id) => {
          peer.off('error', onError)
          resolve({ peer, roomCode: String(id || candidateCode).trim() || candidateCode })
        }
        const onError = (err) => {
          peer.off('open', onOpen)
          peer.destroy()
          if (err?.type === 'unavailable-id' && attempt < maxAttempts) {
            resolve(attemptCreate(attempt + 1))
            return
          }
          reject(err)
        }
        peer.once('open', onOpen)
        peer.once('error', onError)
      })
    return attemptCreate(1)
  }

  function getAvailableGuestColorForRoom() {
    const roomColors = getAvailableColorsForCount(playerCountRef.current || 2)
    const usedColors = new Set(Object.values(peerColorMapRef.current || {}))
    return roomColors.find((color) => color !== P2P_HOST_COLOR && !usedColors.has(color)) || null
  }

  function releasePeerSlot(peerId) {
    if (!peerId) return
    const releasedColor = peerColorMapRef.current[peerId]
    if (!releasedColor) return
    const nextMap = { ...peerColorMapRef.current }
    delete nextMap[peerId]
    peerColorMapRef.current = nextMap
    setLobbyVersion((prev) => prev + 1)
    setPlayerNames((prev) => {
      if (typeof prev[releasedColor] === 'undefined') return prev
      const next = { ...prev }
      next[releasedColor] = COLOR_NAMES[releasedColor]
      return next
    })
  }

  function attachHostConnectionHandlers(connection) {
    const peerId = connection?.peer
    if (!peerId) {
      connection.close()
      return
    }
    const assignedColor = getAvailableGuestColorForRoom()
    if (!assignedColor) {
      connection.send({ t: 'room_full' })
      connection.close()
      return
    }
    hostConnectionsRef.current = {
      ...hostConnectionsRef.current,
      [peerId]: connection,
    }
    peerColorMapRef.current = {
      ...peerColorMapRef.current,
      [peerId]: assignedColor,
    }
    setLobbyVersion((prev) => prev + 1)
    let didInitConnection = false
    const handleConnectionReady = () => {
      if (didInitConnection) return
      didInitConnection = true
      setP2pStatus('connected')
      toast.success(`${COLOR_NAMES[assignedColor]} joined your room.`)
      setSetupStep('settings')
      connection.send({
        t: 'welcome',
        color: assignedColor,
        playerCount: playerCountRef.current || 2,
        selectedColors: getAvailableColorsForCount(playerCountRef.current || 2),
      })
      connection.send({ t: 'hello', name: myName?.trim() || 'Host' })
      sendImmediateP2pState()
    }
    connection.on('open', handleConnectionReady)
    if (connection.open) {
      handleConnectionReady()
    }
    connection.on('close', () => {
      const nextConnections = { ...hostConnectionsRef.current }
      delete nextConnections[peerId]
      hostConnectionsRef.current = nextConnections
      setLobbyVersion((prev) => prev + 1)
      releasePeerSlot(peerId)
      if (!intentionalCloseRef.current) {
        toast.info(`${COLOR_NAMES[assignedColor]} disconnected.`)
      }
    })
    connection.on('error', () => {
      setP2pStatus('error')
      playSfx('error')
      releasePeerSlot(peerId)
    })
    connection.on('data', (raw) => {
      const msg = readP2pMessage(raw)
      if (!msg) return
      if (msg?.t === 'chat' && msg?.m) {
        const normalized = normalizeChatMessage(msg.m, playerNames[assignedColor] || COLOR_NAMES[assignedColor])
        if (!normalized) return
        appendChatMessage(normalized, COLOR_NAMES[assignedColor])
        sendP2pJsonToGuests({ t: 'chat', m: normalized }, peerId)
      }
      if (msg?.t === 'action') {
        const action = msg?.a
        const payload = msg?.p || {}
        if (action === 'set_name' && typeof payload?.name === 'string') {
          const name = String(payload.name).slice(0, 24)
          setPlayerNames((prev) => ({ ...prev, [assignedColor]: name }))
          return
        }
        if (phaseRef.current !== 'playing') return
        const currentTurn = playersRef.current[currentPlayerRef.current]
        if (!currentTurn || currentTurn.id !== assignedColor) return
        if (action === 'roll') {
          rollDiceRef.current?.('remote', assignedColor)
          return
        }
        if (action === 'move' && typeof payload?.tokenId === 'string') {
          handleMoveTokenRef.current?.(payload.tokenId, 'remote', assignedColor)
        }
      }
      if (msg?.t === 'hello' && typeof msg?.name === 'string') {
        const name = String(msg.name).slice(0, 24)
        setPlayerNames((prev) => ({ ...prev, [assignedColor]: name }))
      }
    })
  }

  function attachGuestConnectionHandlers(connection) {
    connectionRef.current = connection
    connection.on('open', () => {
      setP2pStatus('connected')
      toast.success('Joined room successfully.')
      setSetupStep('settings')
      sendP2pJson({ t: 'hello', name: String(myName || '').slice(0, 24) })
    })
    connection.on('close', handleP2pDisconnect)
    connection.on('error', () => {
      setP2pStatus('error')
      playSfx('error')
    })
    connection.on('data', (raw) => {
      const msg = readP2pMessage(raw)
      if (!msg) return
      if (msg?.t === 'state') applyRemoteStateRef.current?.(msg.s)
      if (msg?.t === 'chat' && msg?.m) {
        appendChatMessage(msg.m)
      }
      if (msg?.t === 'welcome' && typeof msg?.color === 'string') {
        setMyOnlineColor(msg.color)
        setMyColor(msg.color)
        setPlayerNames((prev) => ({
          ...prev,
          [msg.color]: String(myName || '').slice(0, 24),
        }))
        if (typeof msg?.playerCount === 'number') setPlayerCount(msg.playerCount)
        if (Array.isArray(msg?.selectedColors)) setSelectedColors(msg.selectedColors)
      }
      if (msg?.t === 'hello' && typeof msg?.name === 'string') {
        const name = String(msg.name).slice(0, 24)
        setPlayerNames((prev) => ({ ...prev, [P2P_HOST_COLOR]: name }))
      }
      if (msg?.t === 'room_full') {
        toast.error('Room is full. Ask host to increase player count or try another room.')
        cleanupP2p()
        setPlayMode(null)
      }
    })
  }

  async function startP2pHost() {
    cleanupP2p()
    if (typeof window === 'undefined') {
      toast.error('Multiplayer is not supported on this browser/device.')
      return
    }
    setPlayMode('p2p')
    setIsHost(true)
    setMyColor(P2P_HOST_COLOR)
    setMyOnlineColor(P2P_HOST_COLOR)
    const hostName = String(myName || '').slice(0, 24)
    setPlayerNames((prev) => ({ ...prev, [P2P_HOST_COLOR]: hostName }))
    setSelectedColors(getAvailableColorsForCount(playerCount))
    setPlayers(createPlayers(getAvailableColorsForCount(playerCount), { ...playerNames, [P2P_HOST_COLOR]: hostName }))
    setP2pStatus('creating')
    try {
      const { peer, roomCode: createdCode } = await createHostPeer()
      peerRef.current = peer
      setRoomCode(createdCode)
      setP2pStatus('waiting_player')
      toast.success(`Room ${createdCode} created. Share this code.`)
      playSfx('join')
      peer.on('connection', (connection) => {
        attachHostConnectionHandlers(connection)
      })
      peer.on('disconnected', () => {
        if (intentionalCloseRef.current) return
        setP2pStatus('error')
        toast.error('Room connection dropped.')
      })
      peer.on('error', (err) => {
        if (intentionalCloseRef.current) return
        setP2pStatus('error')
        toast.error(err?.message ? `Room error: ${err.message}` : 'Room connection error.')
      })
    } catch (err) {
      console.error(err)
      setP2pStatus('error')
      toast.error(err?.message ? `Unable to create room: ${err.message}` : 'Unable to create room.')
      cleanupP2p()
      setPlayMode(null)
    }
  }

  async function startP2pGuest() {
    cleanupP2p()
    if (typeof window === 'undefined') {
      toast.error('Multiplayer is not supported on this browser/device.')
      return
    }
    setPlayMode('p2p')
    setIsHost(false)
    setMyColor(null)
    setMyOnlineColor(null)
    const guestName = String(myName || '').slice(0, 24)
    setPlayerNames((prev) => ({ ...prev, guest: guestName }))
    setP2pStatus('joining')
    try {
      const room = parseRoomCodeInput(roomCodeInput)
      if (room.length !== ROOM_CODE_LENGTH) {
        throw new Error(
          `Enter a valid ${ROOM_CODE_LENGTH}-character room code (A-Z, 2-9; no I/L/O/0/1).`
        )
      }
      const guestPeer = new Peer()
      peerRef.current = guestPeer
      await new Promise((resolve, reject) => {
        guestPeer.once('open', resolve)
        guestPeer.once('error', reject)
      })
      guestPeer.on('error', (err) => {
        if (intentionalCloseRef.current) return
        setP2pStatus('error')
        toast.error(err?.message ? `Connection error: ${err.message}` : 'Connection error.')
      })
      guestPeer.on('disconnected', () => {
        if (intentionalCloseRef.current) return
        setP2pStatus('error')
      })
      const connection = guestPeer.connect(room, { reliable: true })
      attachGuestConnectionHandlers(connection)
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Room did not respond. Check the code and make sure host is online.'))
        }, 9000)
        connection.once('open', () => {
          clearTimeout(timeoutId)
          resolve()
        })
        connection.once('error', (err) => {
          clearTimeout(timeoutId)
          reject(err)
        })
      })
      setRoomCode(room)
    } catch (err) {
      console.error(err)
      setP2pStatus('error')
      const raw = String(err?.message || '')
      const friendly =
        /Could not connect to peer|peer-unavailable/i.test(raw)
          ? 'Unable to join room. Check the room code and ensure the host has created the room and is online.'
          : raw || 'Unable to join.'
      toast.error(`Unable to join: ${friendly}`)
      cleanupP2p()
      setPlayMode(null)
    }
  }

  const winner = useMemo(() => {
    if (!finishedOrder.length) return null
    return players.find((player) => player.id === finishedOrder[0]) || null
  }, [players, finishedOrder])

  useEffect(() => {
    const tryCopy = async (text, kind) => {
      if (!text) return
      if (lastCopiedRef.current[kind] === text) return
      lastCopiedRef.current[kind] = text
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Room code copied.')
      } catch {
        // ignore
      }
    }
    if (setupStep === 'p2p_create' && roomCode && p2pStatus === 'waiting_player') {
      tryCopy(roomCode, 'room')
    }
  }, [roomCode, setupStep, p2pStatus])

  const eliminatedPlayer = useMemo(() => {
    if (!eliminatedId) return null
    return players.find((player) => player.id === eliminatedId) || null
  }, [players, eliminatedId])

  const finishedNames = useMemo(() => {
    return finishedOrder
      .map((id) => players.find((player) => player.id === id)?.name)
      .filter(Boolean)
  }, [players, finishedOrder])

  const pathMap = useMemo(() => {
    const map = new Map()
    PATH.forEach(([r, c], idx) => {
      map.set(`${r},${c}`, idx)
    })
    return map
  }, [])

  const homeMap = useMemo(() => {
    const map = new Map()
    Object.entries(HOME_PATHS).forEach(([color, coords]) => {
      coords.forEach(([r, c]) => {
        map.set(`${r},${c}`, color)
      })
    })
    return map
  }, [])

  const baseSpotMap = useMemo(() => {
    const map = new Map()
    Object.entries(BASE_SPOTS).forEach(([color, coords]) => {
      coords.forEach(([r, c]) => {
        map.set(`${r},${c}`, color)
      })
    })
    return map
  }, [])

  const tokensByCell = useMemo(() => {
    const map = new Map()
    players.forEach((player) => {
      player.tokens.forEach((token, index) => {
        const [r, c] = getTokenCoord(player.color, token, index)
        const key = `${r},${c}`
        if (!map.has(key)) {
          map.set(key, [])
        }
        map.get(key).push({
          ...token,
          color: player.color,
          playerId: player.id,
        })
      })
    })
    return map
  }, [players])

  const movableTokenIds = useMemo(() => {
    if (phase !== 'playing' || !hasRolled || gameOver || isAnimating) return new Set()
    const player = players[currentPlayer]
    const rollValue = lastRoll ?? dice
    if (!rollValue) return new Set()
    const hasCapture = Boolean(captureCredits[player.id])
    const enemyTrackIndices = new Set()
    players.forEach((p, idx) => {
      if (idx === currentPlayer) return
      p.tokens.forEach((t) => {
        if (t.steps >= 0 && t.steps < 52) {
          enemyTrackIndices.add(getTrackIndex(p.color, t.steps))
        }
      })
    })
    const result = new Set()
    player.tokens.forEach((token) => {
      if (token.steps === -1) {
        if (rollValue === 6) result.add(token.id)
        return
      }
      if (token.steps >= 0 && token.steps < 58 && token.steps + rollValue <= 58) {
        const entersHome = token.steps < 52 && token.steps + rollValue >= 52
        if (entersHome && !hasCapture) return
        if (token.steps < 52) {
          const pathIndices = getTrackIndicesBetween(player.color, token.steps, rollValue)
          const blocked = pathIndices.some((idx) => enemyTrackIndices.has(idx))
          if (blocked) return
        }
        result.add(token.id)
      }
    })
    return result
  }, [players, currentPlayer, hasRolled, dice, lastRoll, captureCredits, gameOver, phase, isAnimating])

  function toggleColor(color) {
    if (phase !== 'setup') return
    if (!availableColors.includes(color)) return
    setSelectedColors((prev) => {
      if (prev.includes(color)) {
        if (prev.length <= 2) {
          toast.info('Select at least two colors to play.')
          return prev
        }
        return prev.filter((c) => c !== color)
      }
      if (prev.length >= playerCount) {
        toast.error(`Only ${playerCount} players allowed.`)
        return prev
      }
      const next = [...prev, color]
      return COLOR_ORDER.filter((c) => next.includes(c))
    })
  }

  function chooseMode(mode) {
    if (mode === 'local') {
      if (playMode === 'p2p') cleanupP2p()
      setPlayMode('local')
      setSetupStep('settings')
      return
    }
    if (mode === 'p2p_create') {
      if (playMode === 'p2p') cleanupP2p()
      setPlayMode(null)
      setP2pStatus('idle')
      setRoomCode('')
      setRoomCodeInput('')
      setSetupStep('p2p_create')
      return
    }
    if (mode === 'p2p_join') {
      if (playMode === 'p2p') cleanupP2p()
      setPlayMode(null)
      setP2pStatus('idle')
      setRoomCode('')
      setSetupStep('p2p_join')
    }
  }

  function handleCreateRoomPlayerCountChange(nextCount) {
    if (setupStep !== 'p2p_create') return
    if (p2pStatus === 'creating' || p2pStatus === 'joining') return
    setPlayerCount(nextCount)
    setSelectedColors(getAvailableColorsForCount(nextCount))
  }

  function handleOnlinePlayerCountChange(nextCount) {
    if (playMode !== 'p2p' || !isHost) return
    const connectedGuests = Object.values(hostConnectionsRef.current || {}).filter((conn) =>
      Boolean(conn?.open)
    ).length
    if (connectedGuests > nextCount - 1) {
      toast.info(`Cannot switch to ${nextCount} players while ${connectedGuests} guests are connected.`)
      return
    }
    setPlayerCount(nextCount)
    setSelectedColors(getAvailableColorsForCount(nextCount))
  }

  function handleBackToMode() {
    if (playMode === 'p2p') cleanupP2p()
    setPlayMode(null)
    setSetupStep('mode')
    setMyColor(null)
    setMyName('')
  }

  function handleBackToSetup() {
    setPhase('setup')
    setSetupStep('mode')
    if (playMode === 'p2p') cleanupP2p()
    setPlayMode(null)
    setMyColor(null)
    setMyName('')
  }

  function getTurnRollMessage(playerName) {
    return `${playerName}'s turn. Roll the dice.`
  }

  function startGame() {
    let colorsForGame = [...activeColors]
    if (playMode === 'p2p') {
      if (!isHost) {
        toast.info('Waiting for host to start the game.')
        return
      }
      const connectedGuests = Object.values(hostConnectionsRef.current || {}).filter((conn) =>
        Boolean(conn?.open)
      ).length
      if (connectedGuests < playerCount - 1) {
        toast.error(`Need ${playerCount - 1} connected guest(s) to start ${playerCount}-player game.`)
        return
      }
      const connectedColors = Object.values(peerColorMapRef.current || {})
      const onlineColors = [P2P_HOST_COLOR, ...connectedColors]
      const allowed = getAvailableColorsForCount(playerCount)
      colorsForGame = allowed.filter((color) => onlineColors.includes(color))
      if (colorsForGame.length < 2) {
        toast.error('Not enough connected players to start.')
        return
      }
      if (colorsForGame.length !== playerCount) {
        toast.error(`Expected ${playerCount} connected players, got ${colorsForGame.length}.`)
        return
      }
      setSelectedColors(colorsForGame)
    }
    if (colorsForGame.length < 2 || colorsForGame.length !== playerCount) {
      toast.info(`Choose exactly ${playerCount} colors to start.`)
      return
    }
    const botByColor = {}
    const names = { ...playerNames }
    setPlayers(createPlayers(colorsForGame, names, botByColor))
    setPhase('playing')
    phaseRef.current = 'playing'
    currentPlayerRef.current = 0
    currentTurnColorRef.current = colorsForGame[0]
    setCurrentTurnColor(colorsForGame[0])
    setCurrentPlayer(0)
    setDice(null)
    setLastRoll(null)
    setCaptureCredits({})
    if (diceClearTimerRef.current) {
      clearTimeout(diceClearTimerRef.current)
      diceClearTimerRef.current = null
    }
    setHasRolled(false)
    setSelectedMove(null)
    setFinishedOrder([])
    setEliminatedId(null)
    setGameOver(false)
    finishedRef.current = []
    gameOverRef.current = false
    setMessage(getTurnRollMessage(playerNames[colorsForGame[0]] || COLOR_NAMES[colorsForGame[0]]))
    toast.success('Game started!')
    playSfx('start')
    sendImmediateP2pState({
      phase: 'playing',
      currentPlayer: 0,
      currentTurnColor: colorsForGame[0],
      dice: null,
      lastRoll: null,
      hasRolled: false,
      isRolling: false,
      rollingValue: null,
      selectedMove: null,
      message: getTurnRollMessage(playerNames[colorsForGame[0]] || COLOR_NAMES[colorsForGame[0]]),
      finishedOrder: [],
      eliminatedId: null,
      showElimination: false,
      capturedInfo: null,
      gameOver: false,
    })
  }

  function rollDice(source = 'local', actorColor = null) {
    const activeTurnIndex = currentPlayerRef.current
    const turnColor = currentTurnColorRef.current || playersRef.current[activeTurnIndex]?.color || null
    const currentTurn =
      playersRef.current.find((player) => player.color === turnColor) ||
      playersRef.current[activeTurnIndex]
    if (!currentTurn) return
    if (playMode === 'p2p' && isP2pConnected) {
      if (source === 'local') {
        if (!myOnlineColor || currentTurn.id !== myOnlineColor) {
          toast.info(`Waiting for ${currentTurn.name} to roll.`)
          return
        }
        if (!isHost) {
          sendP2pJson({ t: 'action', a: 'roll' })
          return
        }
      }
      if (source === 'remote') {
        if (!actorColor || currentTurn.id !== actorColor) return
      }
    }
    if (phase !== 'playing' || hasRolled || gameOver || isAnimating || isRolling)
      return
    const value = Math.floor(Math.random() * 6) + 1
    setHasRolled(true)
    setSelectedMove(null)
    setIsRolling(true)
    setDice(null)
    setLastRoll(null)
    setRollingValue(Math.floor(Math.random() * 6) + 1)
    playTone({ frequency: 540, type: 'triangle', duration: 0.14, volume: 0.12 })

    const player = playersRef.current[activeTurnIndex]
    const hasCapture = Boolean(captureCredits[player.id])
    const enemyTrackIndices = new Set()
    playersRef.current.forEach((p, idx) => {
      if (idx === activeTurnIndex) return
      p.tokens.forEach((t) => {
        if (t.steps >= 0 && t.steps < 52) {
          enemyTrackIndices.add(getTrackIndex(p.color, t.steps))
        }
      })
    })
    const canMove = player.tokens.some((token) => {
      if (token.steps === -1) return value === 6
      if (token.steps >= 0 && token.steps < 58 && token.steps + value <= 58) {
        const entersHome = token.steps < 52 && token.steps + value >= 52
        if (entersHome && !hasCapture) return false
        if (token.steps < 52) {
          const pathIndices = getTrackIndicesBetween(player.color, token.steps, value)
          const blocked = pathIndices.some((idx) => enemyTrackIndices.has(idx))
          if (blocked) return false
        }
        return true
      }
      return false
    })

    if (!canMove) {
      setMessage(`${player.name} rolled a ${value}. No moves available.`)
      setTimeout(() => {
        if (phaseRef.current === 'playing' && !gameOverRef.current) {
          advanceTurn(playersRef.current)
        }
      }, 700)
    } else {
      setMessage(`${player.name} rolled a ${value}. Choose a token to move.`)
    }

    const intervalId = setInterval(() => {
      setRollingValue(Math.floor(Math.random() * 6) + 1)
    }, 90)

    setTimeout(() => {
      clearInterval(intervalId)
      setRollingValue(null)
      setDice(value)
      setLastRoll(value)
      diceVisibleUntilRef.current = Date.now() + 3000
      setIsRolling(false)
    }, 450)
  }

  useEffect(() => {
    rollDiceRef.current = rollDice
  })

  function advanceTurn(playersState) {
    let next = currentPlayerRef.current
    const total = playersState.length
    let guard = 0
    do {
      next = (next + 1) % total
      guard += 1
      if (guard > total) break
    } while (playersState[next].tokens.every((t) => t.steps === 58))

    currentPlayerRef.current = next
    setCurrentPlayer(next)
    const nextPlayer = playersState[next]
    currentTurnColorRef.current = nextPlayer.color
    setCurrentTurnColor(nextPlayer.color)
    scheduleDiceClear()
    setLastRoll(null)
    setHasRolled(false)
    setSelectedMove(null)
    const nextMessage = getTurnRollMessage(nextPlayer.name)
    setMessage(nextMessage)
    sendImmediateP2pState({
      currentPlayer: next,
      currentTurnColor: nextPlayer.color,
      lastRoll: null,
      hasRolled: false,
      selectedMove: null,
      message: nextMessage,
      dice: null,
      rollingValue: null,
      isRolling: false,
    })
  }

  function resetGame() {
    if (isAnimating) return
    const colors = activeColors.length >= 2 ? activeColors : COLOR_ORDER
    setPlayers(createPlayers(colors, playerNames))
    currentPlayerRef.current = 0
    setCurrentPlayer(0)
    setDice(null)
    setLastRoll(null)
    setCaptureCredits({})
    if (diceClearTimerRef.current) {
      clearTimeout(diceClearTimerRef.current)
      diceClearTimerRef.current = null
    }
    setHasRolled(false)
    setFinishedOrder([])
    setEliminatedId(null)
    setGameOver(false)
    finishedRef.current = []
    gameOverRef.current = false
    currentTurnColorRef.current = colors[0]
    setCurrentTurnColor(colors[0])
    setMessage(getTurnRollMessage(playerNames[colors[0]] || COLOR_NAMES[colors[0]]))
    setSelectedMove(null)
    sendImmediateP2pState({
      phase: 'setup',
      currentPlayer: 0,
      currentTurnColor: colors[0],
      dice: null,
      lastRoll: null,
      hasRolled: false,
      isRolling: false,
      rollingValue: null,
      selectedMove: null,
      finishedOrder: [],
      eliminatedId: null,
      showElimination: false,
      capturedInfo: null,
      gameOver: false,
      message: getTurnRollMessage(playerNames[colors[0]] || COLOR_NAMES[colors[0]]),
    })
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function animateTokenMove(tokenId, moveValue) {
    let initialSteps = null
    for (const player of playersRef.current) {
      const found = player.tokens.find((token) => token.id === tokenId)
      if (found) {
        initialSteps = found.steps
        break
      }
    }

    if (initialSteps === null) return
    const stepsToMove = initialSteps === -1 ? 1 : moveValue

    for (let step = 0; step < stepsToMove; step += 1) {
      setPlayers((prev) => {
        const nextPlayers = prev.map((player) => ({
          ...player,
          tokens: player.tokens.map((token) => {
            if (token.id !== tokenId) return token
            if (token.steps === -1) return { ...token, steps: 0 }
            return { ...token, steps: token.steps + 1 }
          }),
        }))
        playersRef.current = nextPlayers
        return nextPlayers
      })
      playMoveSound(step)
      await sleep(120)
    }
  }

  async function handleMoveToken(tokenId, source = 'local', actorColor = null) {
    const activeTurnIndex = currentPlayerRef.current
    const turnColor = currentTurnColorRef.current || playersRef.current[activeTurnIndex]?.color || null
    const currentTurn =
      playersRef.current.find((player) => player.color === turnColor) ||
      playersRef.current[activeTurnIndex]
    if (!currentTurn) return
    if (playMode === 'p2p' && isP2pConnected) {
      if (source === 'local') {
        if (!myOnlineColor || currentTurn.id !== myOnlineColor) return
        if (!isHost) {
          sendP2pJson({ t: 'action', a: 'move', p: { tokenId } })
          return
        }
      }
      if (source === 'remote') {
        if (!actorColor || currentTurn.id !== actorColor) return
      }
    }
    if (phase !== 'playing' || !hasRolled || gameOver || !movableTokenIds.has(tokenId))
      return
    if (animatingRef.current || isAnimating) return

    const moveValue = lastRoll ?? dice
    if (!moveValue) return

    animatingRef.current = true
    setIsAnimating(true)
    try {
      await animateTokenMove(tokenId, moveValue)

      const movedPlayer = playersRef.current[activeTurnIndex]
      const movedToken = movedPlayer.tokens.find((t) => t.id === tokenId)

      let updatedPlayers = playersRef.current
      const captured = []
      if (movedToken.steps >= 0 && movedToken.steps < 52) {
        const trackIndex = getTrackIndex(movedPlayer.color, movedToken.steps)
        if (!SAFE_INDICES.has(trackIndex)) {
          updatedPlayers = playersRef.current.map((opponent, oppIdx) => {
            if (oppIdx === activeTurnIndex) return opponent
            return {
              ...opponent,
              tokens: opponent.tokens.map((token) => {
                if (token.steps < 0 || token.steps >= 52) return token
                const opponentIndex = getTrackIndex(opponent.color, token.steps)
                if (opponentIndex === trackIndex) {
                  captured.push(opponent.color)
                  return { ...token, steps: -1 }
                }
                return token
              }),
            }
          })
        }
      }

      if (updatedPlayers !== playersRef.current) {
        playersRef.current = updatedPlayers
        setPlayers(updatedPlayers)
      }

      if (captured.length) {
        const unique = [...new Set(captured)]
        const names = unique
          .map((color) => playerNames[color] || COLOR_NAMES[color])
          .join(', ')
        toast.info(`${movedPlayer.name} captured ${names}!`)
        playTone({ frequency: 220, type: 'square', duration: 0.18, volume: 0.12 })
        setCapturedInfo({ colors: unique, by: movedPlayer.name, victims: names })
        playSfx('capture')
        setTimeout(() => setCapturedInfo(null), 1200)
        setCaptureCredits((prev) => ({ ...prev, [movedPlayer.id]: true }))
      }

      const finishedNow = movedPlayer.tokens.every((t) => t.steps === 58)
      let nextFinishedOrder = finishedRef.current

      if (finishedNow && !finishedRef.current.includes(movedPlayer.id)) {
        nextFinishedOrder = [...finishedRef.current, movedPlayer.id]
        finishedRef.current = nextFinishedOrder
        setFinishedOrder(nextFinishedOrder)
        if (updatedPlayers.length === 4) {
          toast.success(`${movedPlayer.name} finished!`)
        }
      }

      if (updatedPlayers.length === 4) {
        if (nextFinishedOrder.length >= updatedPlayers.length - 1) {
          const eliminated = updatedPlayers.find(
            (player) => !nextFinishedOrder.includes(player.id)
          )
          if (eliminated && eliminated.id !== eliminatedId) {
            setEliminatedId(eliminated.id)
            toast.error(`${eliminated.name} eliminated!`)
            setShowElimination(true)
            playSfx('eliminate')
            setTimeout(() => setShowElimination(false), 1700)
          }
          const winnerName =
            updatedPlayers.find((player) => player.id === nextFinishedOrder[0])?.name
          if (winnerName) {
            toast.success(`${winnerName} wins!`)
            playSfx('win')
          }
          setGameOver(true)
          setMessage('Game over.')
          return
        }
      } else if (finishedNow) {
        toast.success(`${movedPlayer.name} wins!`)
        playSfx('win')
        setGameOver(true)
        setMessage(`${movedPlayer.name} wins!`)
        return
      }

      if (moveValue === 6 && !finishedNow) {
        setDice(null)
        setLastRoll(null)
        setHasRolled(false)
        setSelectedMove(null)
        setMessage(`${movedPlayer.name} rolled a 6! Roll again.`)
        return
      }

      advanceTurn(updatedPlayers)
    } finally {
      setIsAnimating(false)
      animatingRef.current = false
    }
  }

  useEffect(() => {
    handleMoveTokenRef.current = handleMoveToken
  })

  function cellClassFor(r, c) {
    const key = `${r},${c}`

    if (r <= 5 && c <= 5) return 'base green'
    if (r <= 5 && c >= 9) return 'base yellow'
    if (r >= 9 && c >= 9) return 'base blue'
    if (r >= 9 && c <= 5) return 'base red'

    if (homeMap.has(key)) {
      return `home ${homeMap.get(key)}`
    }

    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
      return 'center'
    }

    if (pathMap.has(key)) {
      const idx = pathMap.get(key)
      if (SAFE_INDICES.has(idx)) {
        const color = COLOR_ORDER.find((clr) => START_OFFSETS[clr] === idx)
        if (color) {
          return `path start ${color}`
        }
        return 'path safe'
      }
      return 'path'
    }

    return 'void'
  }

  const roomCodeShort = sanitizeRoomCode(roomCode) || shortDisplayCodeFromLong(roomCode)
  const roomShareUrl =
    typeof window === 'undefined' || !roomCode
      ? ''
      : `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomCode)}`
  const lobbyPlayers = useMemo(() => {
    const colors = getAvailableColorsForCount(playerCount)
    return colors.map((color) => {
      const isHostSlot = color === P2P_HOST_COLOR
      const connected = isHostSlot || Object.values(peerColorMapRef.current || {}).includes(color)
      const defaultName = isHostSlot ? (myName?.trim() || 'Host') : COLOR_NAMES[color]
      return {
        color,
        connected,
        isHostSlot,
        name: (playerNames[color] || defaultName || COLOR_NAMES[color]).trim(),
      }
    })
  }, [playerCount, playerNames, myName, lobbyVersion])
  const currentTurnIndex = currentPlayerRef.current
  const current =
    playersRef.current.find((player) => player.color === currentTurnColorRef.current) ||
    playersRef.current[currentTurnIndex] ||
    players[currentPlayer]
  const isMyColor = (color) => Boolean(playMode === 'p2p' && myOnlineColor && color === myOnlineColor)
  const isOnlineTurnMine =
    playMode !== 'p2p' || !current ? true : Boolean(myOnlineColor && current.id === myOnlineColor)
  const canRollInCurrentContext =
    playMode !== 'p2p' || !isP2pConnected ? true : isOnlineTurnMine
  const isTwoPlayer = phase === 'playing' && players.length === 2

  return (
    <div className={`app ${isTwoPlayer ? 'two-player' : ''}`}>
      <ToastContainer
        position="top-center"
        autoClose={2000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        toastClassName="toast-card"
        bodyClassName="toast-body"
        progressClassName="toast-progress"
      />
      {showTutorial ? (
        <div className="tutorial-overlay">
          <div className="tutorial-card">
            <h2>Welcome to Ludo</h2>
            <ol>
              <li>Pick colors on the setup screen and start a game.</li>
              <li>Roll the dice, then tap a highlighted token.</li>
              <li>Capture opponents by landing on their tokens.</li>
            </ol>
            <button
              className="btn"
              onClick={() => {
                localStorage.setItem('ludo_tutorial_seen', 'yes')
                setShowTutorial(false)
              }}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {showElimination && eliminatedPlayer ? (
        <div className="elim-overlay">
          <div className="elim-card">
            <div className={`elim-crew ${eliminatedPlayer.color}`} />
            <h2>{eliminatedPlayer.name} Eliminated</h2>
            <p>Better luck next round.</p>
          </div>
        </div>
      ) : null}

      {capturedInfo ? (
        <div className="capture-overlay">
          <div className="capture-card">
            <div className="capture-row">
              {capturedInfo.colors.map((color) => (
                <span key={color} className={`capture-dot ${color}`} />
              ))}
            </div>
            <h2>Captured!</h2>
            <p>
              {capturedInfo.by} captured {capturedInfo.victims}.
            </p>
          </div>
        </div>
      ) : null}

      {phase === 'setup' ? (
        <div className="setup">
          <div className="setup-card">
            {setupStep === 'entry' ? (
              <>
                <div className="entry-hero">
                  <div className="entry-ludo-stage" aria-hidden="true">
                    <div className="entry-ludo-ring" />
                    <div className="entry-ludo-center" />
                    <div className="entry-ludo-token green" />
                    <div className="entry-ludo-token yellow" />
                    <div className="entry-ludo-token blue" />
                    <div className="entry-ludo-token red" />
                    <div className="entry-ludo-dice">
                      <span className="pip p1" />
                      <span className="pip p2" />
                      <span className="pip p3" />
                      <span className="pip p4" />
                      <span className="pip p5" />
                      <span className="pip p6" />
                    </div>
                  </div>
                </div>
                <h1>Enter Ludo</h1>
                <p>The classic board game for 2-4 players.</p>
                <div className="mode-grid">
                  <button
                    className="mode-card mode-card-enter"
                    type="button"
                    onClick={() => setSetupStep('mode')}
                  >
                    <strong>Enter Ludo World</strong>
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'mode' ? (
              <>
                <h1>Ludo</h1>
                <p>Choose local or online multiplayer.</p>
                <div className="mode-grid">
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('local')}
                  >
                    <strong>Local Play</strong>
                    <span>Start a local game.</span>
                  </button>
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('p2p_create')}
                  >
                    <strong>Online: Create Room</strong>
                    <span>Host a game and share room code.</span>
                  </button>
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('p2p_join')}
                  >
                    <strong>Online: Join Room</strong>
                    <span>Enter a host room code and connect.</span>
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'p2p_create' ? (
              <>
                <h1>Create Online Room</h1>
                <p>Create a room code and share it. Your friend can join using this code.</p>
                <div className="room-join">
                  <label>
                    Your name
                    <input
                      type="text"
                      value={myName}
                      onChange={(e) => setMyName(e.target.value)}
                      placeholder="Host name"
                    />
                  </label>
                </div>
                <div className="player-count player-count-tight">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`count-chip ${playerCount === count ? 'active' : ''}`}
                      onClick={() => handleCreateRoomPlayerCountChange(count)}
                    >
                      {count} Players
                    </button>
                  ))}
                </div>
                <div className="setup-actions setup-actions-tight">
                  <button
                    className="btn"
                    type="button"
                    onClick={startP2pHost}
                    disabled={p2pStatus === 'creating' || p2pStatus === 'joining'}
                  >
                    {roomCode ? 'Create New Room Code' : 'Create Room Code'}
                  </button>
                </div>
                <div className="join-status">
                  {(p2pStatus === 'creating' || p2pStatus === 'joining') ? (
                    <>
                      <span className="loader" />
                      <span>Preparing room...</span>
                    </>
                  ) : null}
                  {p2pStatus === 'waiting_player' ? <span>Room created. Waiting for player to join.</span> : null}
                  {p2pStatus === 'connected' ? <span>Connected. Continue to setup.</span> : null}
                  {p2pStatus === 'error' ? <span className="error-text">Connection error. Try again.</span> : null}
                </div>
                {roomCode ? (
                  <div className="room-card">
                    <div className="room-label">Room Code</div>
                    <div className="room-code">{roomCodeShort || 'ROOM'}</div>
                    <div className="setup-actions">
                      <button className="btn small" type="button" onClick={() => copyText(roomCode, 'Room code')}>
                        Copy Room Code
                      </button>
                      {roomShareUrl ? (
                        <button
                          className="btn small ghost"
                          type="button"
                          onClick={() => copyText(roomShareUrl, 'Room link')}
                        >
                          Copy Room Link
                        </button>
                      ) : null}
                    </div>
                    {roomShareUrl ? (
                      <div className="qr-box">
                        <QRCodeCanvas value={roomShareUrl} size={140} />
                        <span className="room-label">Scan to load room code</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {isHost && roomCode ? (
                  <div className="player-legend lobby-legend">
                    <div className="legend-row">
                      <strong>
                        Lobby Players ({1 + hostConnectedGuests}/{playerCount})
                      </strong>
                    </div>
                    {lobbyPlayers.map((entry, idx) => (
                      <div key={entry.color} className="legend-row">
                        <span className={`legend-dot ${entry.color}`} />
                        <span>
                          Slot {idx + 1}: {entry.name}{' '}
                          {entry.isHostSlot ? '(Host)' : entry.connected ? '(Joined)' : '(Waiting)'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="setup-actions">
                  <button className="btn ghost" type="button" onClick={handleBackToMode}>
                    Back
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'p2p_join' ? (
              <>
                <h1>Join Online Room</h1>
                <p>Enter the host room code and connect instantly.</p>
                <div className="room-join">
                  <label>
                    Your name
                    <input
                      type="text"
                      value={myName}
                      onChange={(e) => setMyName(e.target.value)}
                      placeholder="Guest name"
                    />
                  </label>
                  <label>
                    Room code from host
                    <input
                      type="text"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(sanitizeRoomCode(e.target.value))}
                      placeholder="Enter 6-character code (ex: HTTPQ7)"
                    />
                  </label>
                </div>
                <div className="setup-note setup-note-tip">
                  Tip: room codes use A-Z and 2-9 only (no I, L, O, 0, 1).
                </div>
                <div className="setup-actions setup-actions-tight">
                  <button
                    className="btn"
                    type="button"
                    onClick={startP2pGuest}
                    disabled={p2pStatus === 'creating' || p2pStatus === 'joining'}
                  >
                    Join Room
                  </button>
                </div>
                <div className="join-status">
                  {(p2pStatus === 'creating' || p2pStatus === 'joining') ? (
                    <>
                      <span className="loader" />
                      <span>Joining room...</span>
                    </>
                  ) : null}
                  {p2pStatus === 'connected' ? <span>Connected. Continue to setup.</span> : null}
                  {p2pStatus === 'error' ? <span className="error-text">Connection error. Check room code.</span> : null}
                </div>
                <div className="setup-actions">
                  <button className="btn ghost" type="button" onClick={handleBackToMode}>
                    Back
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'settings' ? (
              <>
                <h1>{playMode === 'p2p' ? 'Multiplayer Setup' : 'Choose Players & Colors'}</h1>
                <p>
                  {playMode === 'p2p'
                    ? 'Connected P2P. Each player can edit only their own name.'
                    : 'Select player count, then choose colors.'}
                </p>
                {playMode === 'p2p' ? (
                  <>
                    <div className="setup-note">
                      Your color: <strong>{localColor ? COLOR_NAMES[localColor] : 'Assigning...'}</strong>
                      <br />
                      Connection: {p2pStatus.replaceAll('_', ' ')}
                      {isHost ? (
                        <>
                          <br />
                          Connected guests: {hostConnectedGuests}
                        </>
                      ) : null}
                    </div>
                    {isHost ? (
                      <div className="player-count">
                        {[2, 3, 4].map((count) => (
                          <button
                            key={count}
                            type="button"
                            className={`count-chip ${playerCount === count ? 'active' : ''}`}
                            onClick={() => handleOnlinePlayerCountChange(count)}
                          >
                            {count} Players
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="player-count">
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`count-chip ${playerCount === count ? 'active' : ''}`}
                          onClick={() => setPlayerCount(count)}
                        >
                          {count} Players
                        </button>
                      ))}
                    </div>
                    <div className="color-grid">
                      {COLOR_ORDER.map((color) => {
                        const selected = selectedColors.includes(color)
                        const disabled = !availableColors.includes(color)
                        return (
                          <button
                            key={color}
                            type="button"
                            className={`color-card ${color} ${selected ? 'selected' : ''} ${
                              disabled ? 'disabled' : ''
                            }`}
                            onClick={() => toggleColor(color)}
                            disabled={disabled}
                          >
                            <span className={`color-token ${color}`} />
                            <strong>{COLOR_NAMES[color]}</strong>
                            <span className="color-meta">
                              {selected ? 'Selected' : disabled ? 'Unavailable' : 'Tap to add'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="name-list">
                  {activeColors.map((color, idx) => (
                    <label
                      key={color}
                      className="name-row"
                    >
                      <span className={`legend-dot ${color}`} />
                      <span className="name-label">Player {idx + 1}</span>
                      <input
                        type="text"
                        value={
                          Object.prototype.hasOwnProperty.call(playerNames, color)
                            ? playerNames[color]
                            : `Player ${idx + 1}`
                        }
                        onChange={(e) => {
                          const nextName = e.target.value
                          setPlayerNames((prev) => ({
                            ...prev,
                            [color]: nextName,
                          }))
                          if (playMode === 'p2p' && isP2pConnected && !isHost && color === localColor) {
                            sendP2pJson({ t: 'action', a: 'set_name', p: { name: nextName } })
                          }
                        }}
                        placeholder="Enter name"
                        disabled={playMode === 'p2p' ? color !== localColor : false}
                      />
                      <span className="name-lock editable">
                        {playMode === 'p2p' && color !== localColor ? 'Locked' : 'Editable'}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="setup-actions">
                  <button
                    className="btn"
                    onClick={() => setSetupStep('ready')}
                    disabled={
                      activeColors.length !== playerCount ||
                      (playMode === 'p2p' &&
                        (!isHost || hostConnectedGuests < playerCount - 1 || !isP2pConnected))
                    }
                  >
                    {playMode === 'p2p' && !isHost
                      ? 'Waiting for host...'
                      : playMode === 'p2p' && hostConnectedGuests < playerCount - 1
                        ? `Need ${playerCount - 1} guests`
                        : 'Continue'}
                  </button>
                  {playMode !== 'p2p' ? (
                    <button
                      className="btn ghost"
                      onClick={() => setSelectedColors(COLOR_ORDER.slice(0, playerCount))}
                    >
                      Select {playerCount}
                    </button>
                  ) : null}
                  <button
                    className="btn ghost"
                    onClick={() => {
                      handleBackToMode()
                    }}
                  >
                    {playMode === 'p2p' ? 'Disconnect' : 'Back'}
                  </button>
                </div>
                <div className="setup-note">
                  Players: {playerCount}
                  <br />
                  Selected: {activeColors.map((c) => COLOR_NAMES[c]).join(', ')}
                </div>
                <div className="player-legend">
                  {activeColors.map((color, idx) => (
                    <div key={color} className="legend-row">
                      <span className={`legend-dot ${color}`} />
                      <span>
                        Player {idx + 1}: {playerNames[color] || COLOR_NAMES[color]}{isMyColor(color) ? ' (You)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {setupStep === 'ready' ? (
              <>
                <h1>Ready to Start?</h1>
                <p>Here are your players:</p>
                <div className="player-legend ready-legend">
                  {activeColors.map((color, idx) => (
                    <div key={color} className="legend-row ready-legend-row">
                      <span className={`legend-dot ${color}`} />
                      <span>
                        <strong>Player {idx + 1}: {playerNames[color] || COLOR_NAMES[color]}{isMyColor(color) ? ' (You)' : ''}</strong>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="setup-actions">
                  <button
                    className="btn"
                    onClick={startGame}
                  >
                    Start Game
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setSetupStep('settings')}
                  >
                    Back
                  </button>
                </div>
              </>
            ) : null}
          </div>
            <div className="setup-card tip-card">
              <h2>How to Play</h2>
              <ul>
                <li>Play with 2, 3, or 4 players.</li>
                <li>Roll a 6 to leave base.</li>
                <li>Landing on an enemy sends it back (except safe starts).</li>
                <li>You cannot jump over an enemy coin.</li>
                <li>Capture at least one coin before entering the home path.</li>
                <li>Rolling a 6 gives an extra roll.</li>
              </ul>
            </div>
            <div className="setup-card rules-card">
              <h2>Rules Summary</h2>
              <ul>
                <li>Captured coins return to base.</li>
                <li>No jumping over enemy coins on the track.</li>
                <li>Capture required before entering home path.</li>
                <li>Extra turn on rolling a 6.</li>
              </ul>
            </div>
        </div>
      ) : (
        <>
          <main className="game-shell main">
            <section className="board-wrapper">
              <div className="board">
                <div className="board-center" />
                {Array.from({ length: GRID * GRID }, (_, idx) => {
                  const r = Math.floor(idx / GRID)
                  const c = idx % GRID
                  const key = `${r},${c}`
                  const tokens = tokensByCell.get(key) || []
                  const baseSpot = baseSpotMap.get(key)
                  return (
                    <div
                      key={key}
                      className={`cell ${cellClassFor(r, c)} ${
                        baseSpot ? `base-spot ${baseSpot}` : ''
                      }`}
                    >
                      <div className="token-stack">
                        {tokens.map((token, tokenIdx) => (
                          <button
                            key={token.id}
                            type="button"
                            className={`token ${token.color} ${
                              movableTokenIds.has(token.id) ? 'movable' : ''
                            } ${token.steps === 58 ? 'finished' : ''}`}
                            style={{
                              '--stack-index': tokenIdx,
                            }}
                            onClick={() => handleMoveToken(token.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
            <aside className="panel">
              <div className="panel-card dice-panel">
                <div className="turn-banner">
                  <span className={`turn-dot ${current.color}`} />
                  <div>
                    <p className="turn-label">Current Turn</p>
                    <h3>{current.name}{isMyColor(current.color) ? ' (You)' : ''}</h3>
                  </div>
                </div>
                <div className="player-legend compact">
                  {players.map((player, idx) => (
                    <div key={player.id} className="legend-row">
                      <span className={`legend-dot ${player.color}`} />
                      <span>
                        Player {idx + 1}: {player.name}
                        {isMyColor(player.color) ? ' (You)' : ''}
                        {player.isBot ? ' (Bot)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <h2>Dice</h2>
                <div className="roll-cluster">
                  <div className="dice-box">
                    <button
                      type="button"
                      className={`dice ${isRolling ? 'rolling' : ''}`}
                      onClick={rollDice}
                      disabled={
                        phase !== 'playing' ||
                        hasRolled ||
                        gameOver ||
                        !canRollInCurrentContext ||
                        isAnimating ||
                        isRolling
                      }
                    >
                      {isRolling ? (
                        <strong>{rollingValue ?? 1}</strong>
                      ) : dice ? (
                        <strong>{dice}</strong>
                      ) : (
                        <span>Roll</span>
                      )}
                    </button>
                  </div>
                  <button
                    className="btn"
                    onClick={rollDice}
                    disabled={
                      phase !== 'playing' ||
                      hasRolled ||
                      gameOver ||
                      !canRollInCurrentContext ||
                      isAnimating ||
                      isRolling
                    }
                  >
                    {isRolling ? 'Rolling...' : 'Roll'}
                  </button>
                </div>
                <div className="turn">
                  <span className={`turn-indicator ${current.color}`} />
                  <div>
                    <strong>{current.name}</strong>
                    <p className="turn-message">{message}</p>
                  </div>
                </div>
                <div className="setup-actions">
                  <button className="btn ghost" onClick={handleBackToSetup}>
                    Back to Setup
                  </button>
                </div>
              </div>
              <div className="panel-card chat-panel">
                <h2>Chat</h2>
                <div className="chat-window">
                  {chatMessages.length === 0 ? (
                    <p className="chat-empty">Say hello to start the chat.</p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="chat-msg">
                        <div className="chat-meta">
                          <strong>{msg.name}</strong>
                          <span>{msg.at}</span>
                        </div>
                        <div className="chat-text">{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-input">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendChat()
                    }}
                  />
                  <button className="btn" onClick={sendChat}>
                    Send
                  </button>
                </div>
              </div>
            </aside>
          </main>
        </>
      )}
    </div>
  )
}

export default App
