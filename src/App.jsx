import { useEffect, useMemo, useRef, useState } from 'react'
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
const P2P_SIGNAL_TIMEOUT_MS = 8000

const P2P_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

function getAvailableColorsForCount(count) {
  if (count === 2) return ['green', 'red']
  if (count === 3) return ['green', 'yellow', 'blue']
  return COLOR_ORDER
}

function base64UrlEncode(text) {
  // SDP is ASCII, safe for btoa/atob.
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlDecode(base64Url) {
  // Only strip whitespace. Do NOT strip '-', since '-' is part of base64url.
  const cleaned = String(base64Url || '').trim().replace(/\s+/g, '')
  const padLen = (4 - (cleaned.length % 4)) % 4
  const padded = cleaned + '='.repeat(padLen)
  return atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
}

function encodeSignal(desc) {
  const type = desc?.type
  const sdp = desc?.sdp
  if (type !== 'offer' && type !== 'answer') throw new Error('Invalid signal type')
  if (!sdp || typeof sdp !== 'string') throw new Error('Invalid signal sdp')
  const normalizedSdp = sdp.trim().replaceAll('\r\n', '\n')
  const typeChar = type === 'offer' ? 'o' : 'a'
  return `1${typeChar}${base64UrlEncode(normalizedSdp)}`
}

function decodeSignal(code) {
  // Only strip whitespace. Do NOT strip '-', since '-' is part of base64url.
  const cleaned = String(code || '').trim().replace(/\s+/g, '')
  if (cleaned.length < 4) throw new Error('Invalid code')
  const version = cleaned[0]
  const typeChar = cleaned[1]
  if (version !== '1') throw new Error('Unsupported code version')
  const type = typeChar === 'o' ? 'offer' : typeChar === 'a' ? 'answer' : null
  if (!type) throw new Error('Invalid code type')
  const normalizedSdp = base64UrlDecode(cleaned.slice(2))
  const sdp = String(normalizedSdp || '').replaceAll('\n', '\r\n')
  return { type, sdp }
}

function formatGroupedCode(code, groupSize = 6, groupsPerLine = 4) {
  // Only strip whitespace. '-' is valid base64url, so don't remove it.
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
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
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

function parseSignalInput(input, queryParamName) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  try {
    const maybeUrl = new URL(raw)
    const extracted = maybeUrl.searchParams.get(queryParamName)
    if (extracted) return extracted
  } catch {
    // Not a URL; treat input as raw signal code.
  }
  return raw
}

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function waitForIceGatheringCompleteOrTimeout(pc, timeoutMs = 1200) {
  return Promise.race([
    waitForIceGatheringComplete(pc),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
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
  const [setupStep, setSetupStep] = useState('entry') // entry | mode | settings | ready
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
  const [moveMode, setMoveMode] = useState('roll') // roll | choose
  const [selectedMove, setSelectedMove] = useState(null)
  const [finishedOrder, setFinishedOrder] = useState([])
  const [eliminatedId, setEliminatedId] = useState(null)
  const [showElimination, setShowElimination] = useState(false)
  const [capturedInfo, setCapturedInfo] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [captureCredits, setCaptureCredits] = useState({})
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [p2pStatus, setP2pStatus] = useState('idle') // idle | creating | waiting_answer | answer_ready | connecting | connected | error
  const [isHost, setIsHost] = useState(false)
  const [showHostJoinPaste, setShowHostJoinPaste] = useState(false)
  const [showFullRoomCode, setShowFullRoomCode] = useState(false)
  const [showFullJoinCode, setShowFullJoinCode] = useState(false)
  const playersRef = useRef(players)
  const animatingRef = useRef(false)
  const finishedRef = useRef([])
  const phaseRef = useRef(phase)
  const gameOverRef = useRef(gameOver)
  const currentPlayerRef = useRef(currentPlayer)
  const diceVisibleUntilRef = useRef(0)
  const diceClearTimerRef = useRef(null)
  const pcRef = useRef(null)
  const dataChannelRef = useRef(null)
  const p2pSendTimerRef = useRef(null)
  const intentionalCloseRef = useRef(false)
  const rollDiceRef = useRef(null)
  const chooseMoveRef = useRef(null)
  const handleMoveTokenRef = useRef(null)
  const applyRemoteStateRef = useRef(null)
  const lastCopiedRef = useRef({ room: '', join: '' })
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
      setJoinCode('')
      setRoomCodeInput(room)
      setShowHostJoinPaste(false)
      setShowFullRoomCode(false)
      setShowFullJoinCode(false)
      toast.info('Room code loaded. Tap "Generate Join Code".')
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
    currentPlayerRef.current = currentPlayer
  }, [currentPlayer])

  const isP2pConnected = playMode === 'p2p' && p2pStatus === 'connected' && dataChannelRef.current
  const localColor = playMode === 'p2p' ? (isHost ? P2P_HOST_COLOR : P2P_GUEST_COLOR) : null
  const remoteColor = playMode === 'p2p' ? (isHost ? P2P_GUEST_COLOR : P2P_HOST_COLOR) : null

  function sendP2pJson(payload) {
    const channel = dataChannelRef.current
    if (!channel || channel.readyState !== 'open') return false
    try {
      channel.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  function scheduleP2pStateSync() {
    if (!isHost || !isP2pConnected) return
    if (p2pSendTimerRef.current) return
    p2pSendTimerRef.current = setTimeout(() => {
      p2pSendTimerRef.current = null
      sendP2pJson({
        t: 'state',
        s: {
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
          moveMode,
          selectedMove,
          message,
          finishedOrder: finishedRef.current,
          eliminatedId,
          showElimination,
          capturedInfo,
          captureCredits,
          gameOver,
        },
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
    if (typeof next.currentPlayer === 'number') setCurrentPlayer(next.currentPlayer)
    if (typeof next.dice !== 'undefined') setDice(next.dice)
    if (typeof next.lastRoll !== 'undefined') setLastRoll(next.lastRoll)
    if (typeof next.hasRolled === 'boolean') setHasRolled(next.hasRolled)
    if (typeof next.isRolling === 'boolean') setIsRolling(next.isRolling)
    if (typeof next.rollingValue !== 'undefined') setRollingValue(next.rollingValue)
    if (typeof next.moveMode === 'string') setMoveMode(next.moveMode)
    if (typeof next.selectedMove !== 'undefined') setSelectedMove(next.selectedMove)
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
      dataChannelRef.current?.close?.()
    } catch {
      // ignore
    }
    try {
      pcRef.current?.close?.()
    } catch {
      // ignore
    }
    dataChannelRef.current = null
    pcRef.current = null
    setRoomCode('')
    setRoomCodeInput('')
    setJoinCode('')
    setP2pStatus('idle')
    setIsHost(false)
    setShowHostJoinPaste(false)
    setShowFullRoomCode(false)
    setShowFullJoinCode(false)
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
        if (!next[color] || !next[color].trim()) {
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
        name: myName?.trim() || (localColor ? playerNames[localColor] : '') || 'You',
        text,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      sendP2pJson({ t: 'chat', m: msg })
      setChatMessages((prev) => [...prev, msg].slice(-80))
      setChatInput('')
      return
    }
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: current?.name || 'You',
        text,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
      setChatInput('')
  }

  async function startP2pHost() {
    cleanupP2p()
    if (typeof RTCPeerConnection === 'undefined') {
      toast.error('Multiplayer is not supported on this browser/device.')
      return
    }
    setPlayMode('p2p')
    setIsHost(true)
    setMyColor(P2P_HOST_COLOR)
    const hostName = (myName || 'Host').trim() || 'Host'
    setPlayerNames((prev) => ({ ...prev, [P2P_HOST_COLOR]: hostName }))
    setPlayerCount(2)
    setSelectedColors([P2P_HOST_COLOR, P2P_GUEST_COLOR])
    setPlayers(
      createPlayers([P2P_HOST_COLOR, P2P_GUEST_COLOR], {
        ...playerNames,
        [P2P_HOST_COLOR]: hostName,
      })
    )
    setP2pStatus('creating')
    try {
      const expectedRemoteColor = P2P_GUEST_COLOR
      const pc = new RTCPeerConnection({ iceServers: P2P_ICE_SERVERS })
      pcRef.current = pc
      const channel = pc.createDataChannel('ludo')
      dataChannelRef.current = channel

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'failed' || state === 'disconnected') {
          setP2pStatus('error')
          toast.error('Connection failed. Try creating a new room.')
        }
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          setP2pStatus('error')
          toast.error('ICE failed (network blocked). Try a different network.')
        }
      }

      channel.onopen = () => {
        setP2pStatus('connected')
        toast.success('Connected!')
        setSetupStep('settings')
        sendP2pJson({ t: 'hello', name: myName?.trim() || 'Host' })
      }
      channel.onclose = () => {
        if (intentionalCloseRef.current) return
        toast.info('Disconnected.')
        cleanupP2p()
        setSetupStep('mode')
        setPlayMode(null)
      }
      channel.onerror = () => {
        setP2pStatus('error')
      }
      channel.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data || ''))
          if (msg?.t === 'chat' && msg?.m) {
            setChatMessages((prev) => [...prev, msg.m].slice(-80))
          }
          if (msg?.t === 'action') {
            const action = msg?.a
            const payload = msg?.p || {}
            if (action === 'set_name' && typeof payload?.name === 'string') {
              const name = payload.name.trim() || 'Guest'
              setPlayerNames((prev) => ({ ...prev, [expectedRemoteColor]: name }))
              return
            }
            if (phaseRef.current !== 'playing') return
            const currentTurn = playersRef.current[currentPlayerRef.current]
            if (!currentTurn || currentTurn.id !== expectedRemoteColor) return
            if (action === 'roll') rollDiceRef.current?.('remote')
            if (action === 'choose' && typeof payload?.value === 'number')
              chooseMoveRef.current?.(payload.value, 'remote')
            if (action === 'move' && typeof payload?.tokenId === 'string')
              handleMoveTokenRef.current?.(payload.tokenId, 'remote')
          }
          if (msg?.t === 'hello' && typeof msg?.name === 'string') {
            const name = msg.name.trim() || 'Guest'
            setPlayerNames((prev) => ({ ...prev, [expectedRemoteColor]: name }))
          }
        } catch {
          // ignore
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceGatheringCompleteOrTimeout(pc, P2P_SIGNAL_TIMEOUT_MS)
      const localDesc = pc.localDescription
      if (!localDesc?.sdp || localDesc.type !== 'offer') throw new Error('Offer not ready.')
      setRoomCode(encodeSignal(localDesc))
      setP2pStatus('waiting_answer')
      toast.success('Room code generated. Share it with your friend.')
      playSfx('join')
    } catch (err) {
      console.error(err)
      setP2pStatus('error')
      toast.error(err?.message ? `Unable to create room: ${err.message}` : 'Unable to create room.')
      cleanupP2p()
      setPlayMode(null)
    }
  }

  async function acceptP2pAnswer() {
    if (!joinCode.trim()) {
      toast.error('Paste the join code first.')
      return
    }
    const pc = pcRef.current
    if (!pc) return
    setP2pStatus('connecting')
    try {
      const decoded = decodeSignal(parseSignalInput(joinCode, 'join'))
      if (!decoded?.sdp || decoded?.type !== 'answer') throw new Error('Invalid join code')
      await pc.setRemoteDescription(decoded)
    } catch (err) {
      console.error(err)
      setP2pStatus('error')
      toast.error(err?.message ? `Invalid join code: ${err.message}` : 'Invalid join code.')
    }
  }

  async function startP2pGuest() {
    cleanupP2p()
    if (typeof RTCPeerConnection === 'undefined') {
      toast.error('Multiplayer is not supported on this browser/device.')
      return
    }
    setPlayMode('p2p')
    setIsHost(false)
    setMyColor(P2P_GUEST_COLOR)
    const guestName = (myName || 'Guest').trim() || 'Guest'
    setPlayerNames((prev) => ({ ...prev, [P2P_GUEST_COLOR]: guestName }))
    setPlayerCount(2)
    setSelectedColors([P2P_HOST_COLOR, P2P_GUEST_COLOR])
    setPlayers(
      createPlayers([P2P_HOST_COLOR, P2P_GUEST_COLOR], {
        ...playerNames,
        [P2P_GUEST_COLOR]: guestName,
      })
    )
    setP2pStatus('connecting')
    try {
      const expectedRemoteColor = P2P_HOST_COLOR
      const pc = new RTCPeerConnection({ iceServers: P2P_ICE_SERVERS })
      pcRef.current = pc

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'failed' || state === 'disconnected') {
          setP2pStatus('error')
          toast.error('Connection failed. Try again.')
        }
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          setP2pStatus('error')
          toast.error('ICE failed (network blocked). Try a different network.')
        }
      }

      pc.ondatachannel = (evt) => {
        const channel = evt.channel
        dataChannelRef.current = channel
        channel.onopen = () => {
          setP2pStatus('connected')
          toast.success('Connected!')
          setSetupStep('settings')
          sendP2pJson({ t: 'hello', name: myName?.trim() || 'Guest' })
        }
        channel.onclose = () => {
          if (intentionalCloseRef.current) return
          toast.info('Disconnected.')
          cleanupP2p()
          setSetupStep('mode')
          setPlayMode(null)
        }
        channel.onmessage = (e) => {
          try {
            const msg = JSON.parse(String(e.data || ''))
            if (msg?.t === 'state') applyRemoteStateRef.current?.(msg.s)
            if (msg?.t === 'chat' && msg?.m) {
              setChatMessages((prev) => [...prev, msg.m].slice(-80))
            }
            if (msg?.t === 'hello' && typeof msg?.name === 'string') {
              const name = msg.name.trim() || 'Host'
              setPlayerNames((prev) => ({ ...prev, [expectedRemoteColor]: name }))
            }
          } catch {
            // ignore
          }
        }
      }

      const incoming = parseSignalInput(roomCodeInput, 'room')
      if (!incoming) throw new Error('Paste the room code first.')
      const offerDesc = decodeSignal(incoming)
      if (!offerDesc?.sdp || offerDesc?.type !== 'offer') throw new Error('Invalid room code.')
      await pc.setRemoteDescription(offerDesc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIceGatheringCompleteOrTimeout(pc, P2P_SIGNAL_TIMEOUT_MS)
      const localDesc = pc.localDescription
      if (!localDesc?.sdp || localDesc.type !== 'answer') throw new Error('Answer not ready.')
      setJoinCode(encodeSignal(localDesc))
      setP2pStatus('answer_ready')
      toast.success('Join code generated. Send it back to the host.')
      playSfx('join')
    } catch (err) {
      console.error(err)
      setP2pStatus('error')
      toast.error(err?.message ? `Unable to join: ${err.message}` : 'Unable to join.')
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
        toast.success(kind === 'join' ? 'Join code copied.' : 'Room code copied.')
      } catch {
        // ignore
      }
    }
    if (setupStep === 'p2p_create' && roomCode && p2pStatus === 'waiting_answer') {
      tryCopy(roomCode, 'room')
    }
    if (setupStep === 'p2p_join' && joinCode && p2pStatus === 'answer_ready') {
      tryCopy(joinCode, 'join')
    }
  }, [roomCode, joinCode, setupStep, p2pStatus])

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

  function startGame() {
    if (playMode === 'p2p') {
      if (!isHost) {
        toast.info('Waiting for host to start the game.')
        return
      }
      if (!isP2pConnected) {
        toast.error('Connect to your friend first.')
        return
      }
    }
    if (activeColors.length < 2 || activeColors.length !== playerCount) {
      toast.info(`Choose exactly ${playerCount} colors to start.`)
      return
    }
    const botByColor = {}
    const names = { ...playerNames }
    setPlayers(createPlayers(activeColors, names, botByColor))
    setPhase('playing')
    phaseRef.current = 'playing'
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
    setMessage(
      `${playerNames[activeColors[0]] || COLOR_NAMES[activeColors[0]]}'s turn. ${
        moveMode === 'choose' ? 'Choose a number.' : 'Roll the dice.'
      }`
    )
    toast.success('Game started!')
    playSfx('start')
  }

  function rollDice(source = 'local') {
    if (playMode === 'p2p' && isP2pConnected && source === 'local' && !isHost) {
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== localColor) return
      sendP2pJson({ t: 'action', a: 'roll' })
      return
    }
    if (playMode === 'p2p' && isP2pConnected) {
      const expected = source === 'remote' ? remoteColor : localColor
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== expected) return
    }
    if (
      phase !== 'playing' ||
      hasRolled ||
      gameOver ||
      moveMode !== 'roll' ||
      isAnimating ||
      isRolling
    )
      return
    const value = Math.floor(Math.random() * 6) + 1
    setHasRolled(true)
    setSelectedMove(null)
    setIsRolling(true)
    setDice(null)
    setLastRoll(null)
    setRollingValue(Math.floor(Math.random() * 6) + 1)
    playTone({ frequency: 540, type: 'triangle', duration: 0.14, volume: 0.12 })

    const player = players[currentPlayer]
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
    let next = currentPlayer
    const total = playersState.length
    let guard = 0
    do {
      next = (next + 1) % total
      guard += 1
      if (guard > total) break
    } while (playersState[next].tokens.every((t) => t.steps === 58))

    setCurrentPlayer(next)
    scheduleDiceClear()
    setLastRoll(null)
    setHasRolled(false)
    setSelectedMove(null)
    setMessage(
      `${playersState[next].name}'s turn. ${
        moveMode === 'choose' ? 'Choose a number.' : 'Roll the dice.'
      }`
    )
  }

  function setMoveModeSafe(nextMode) {
    if (playMode === 'p2p' && !isHost) {
      toast.info('Only the host can change the move mode in multiplayer.')
      return
    }
    if (moveMode === nextMode) return
    if (phase !== 'playing' || gameOver || isAnimating || isRolling) return
    if (hasRolled) {
      toast.info('Finish the current move before switching mode.')
      return
    }
    setMoveMode(nextMode)
    setSelectedMove(null)
    setDice(null)
    setLastRoll(null)
    setHasRolled(false)
    const currentPlayerInfo = players[currentPlayer]
    if (currentPlayerInfo) {
      setMessage(
        `${currentPlayerInfo.name}'s turn. ${
          nextMode === 'choose' ? 'Choose a number.' : 'Roll the dice.'
        }`
      )
    }
  }

  function resetGame() {
    if (isAnimating) return
    const colors = activeColors.length >= 2 ? activeColors : COLOR_ORDER
    setPlayers(createPlayers(colors, playerNames))
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
    setMessage(
      `${playerNames[colors[0]] || COLOR_NAMES[colors[0]]}'s turn. ${
        moveMode === 'choose' ? 'Choose a number.' : 'Roll the dice.'
      }`
    )
    setSelectedMove(null)
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

  async function handleMoveToken(tokenId, source = 'local') {
    if (playMode === 'p2p' && isP2pConnected && source === 'local' && !isHost) {
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== localColor) return
      sendP2pJson({ t: 'action', a: 'move', p: { tokenId } })
      return
    }
    if (playMode === 'p2p' && isP2pConnected) {
      const expected = source === 'remote' ? remoteColor : localColor
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== expected) return
    }
    if (phase !== 'playing' || !hasRolled || gameOver || !movableTokenIds.has(tokenId))
      return
    if (animatingRef.current || isAnimating) return

    const moveValue = moveMode === 'choose' ? selectedMove : lastRoll ?? dice
    if (!moveValue) return

    animatingRef.current = true
    setIsAnimating(true)
    try {
      await animateTokenMove(tokenId, moveValue)

      const movedPlayer = playersRef.current[currentPlayer]
      const movedToken = movedPlayer.tokens.find((t) => t.id === tokenId)

      let updatedPlayers = playersRef.current
      const captured = []
      if (movedToken.steps >= 0 && movedToken.steps < 52) {
        const trackIndex = getTrackIndex(movedPlayer.color, movedToken.steps)
        if (!SAFE_INDICES.has(trackIndex)) {
          updatedPlayers = playersRef.current.map((opponent, oppIdx) => {
            if (oppIdx === currentPlayer) return opponent
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
        setMessage(
          `${movedPlayer.name} ${
            moveMode === 'choose' ? 'chose' : 'rolled'
          } a 6! ${moveMode === 'choose' ? 'Choose again.' : 'Roll again.'}`
        )
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

  function chooseMove(value, source = 'local') {
    if (playMode === 'p2p' && isP2pConnected && source === 'local' && !isHost) {
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== localColor) return
      sendP2pJson({ t: 'action', a: 'choose', p: { value } })
      return
    }
    if (playMode === 'p2p' && isP2pConnected) {
      const expected = source === 'remote' ? remoteColor : localColor
      const currentTurn = players[currentPlayer]
      if (!currentTurn || currentTurn.id !== expected) return
    }
    if (phase !== 'playing' || hasRolled || gameOver || moveMode !== 'choose' || isAnimating)
      return
    setSelectedMove(value)
    setDice(value)
    setLastRoll(value)
    diceVisibleUntilRef.current = Date.now() + 3000
    setHasRolled(true)
    playTone({ frequency: 520, type: 'triangle', duration: 0.1, volume: 0.1 })

    const player = players[currentPlayer]
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
      setMessage(`${player.name} chose ${value}. No moves available.`)
      setTimeout(() => {
        if (phaseRef.current === 'playing' && !gameOverRef.current) {
          advanceTurn(playersRef.current)
        }
      }, 700)
    } else {
      setMessage(`${player.name} chose ${value}. Choose a token to move.`)
    }
  }

  useEffect(() => {
    chooseMoveRef.current = chooseMove
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

  const current = players[currentPlayer]
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
              <li>Roll or choose a number, then tap a highlighted token.</li>
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
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                  <div style={{
                    fontSize: '80px',
                    marginBottom: '20px',
                    animation: 'bounce 2s infinite',
                  }}>
                    🎲
                  </div>
                </div>
                <h1>Enter Ludo</h1>
                <p>The classic board game for 2-4 players.</p>
                <div className="mode-grid">
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => setSetupStep('mode')}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.05)'
                      e.target.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)'
                      e.target.style.boxShadow = 'none'
                    }}
                  >
                    <strong>Enter to Ludo world</strong>
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'mode' ? (
              <>
                <h1>Ludo</h1>
                <p>Play on the same device with 2, 3, or 4 players.</p>
                <div className="mode-grid">
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('local')}
                  >
                    <strong>Play</strong>
                    <span>Start a local game.</span>
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
                  <div className="setup-note">
                    Your color: <strong>{localColor === 'green' ? 'Green' : 'Red'}</strong>
                    <br />
                    Connection: {p2pStatus.replaceAll('_', ' ')}
                  </div>
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
                        value={playerNames[color] || `Player ${idx + 1}`}
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
                      (playMode === 'p2p' && (!isHost || !isP2pConnected))
                    }
                  >
                    {playMode === 'p2p' && !isHost ? 'Waiting for host…' : 'Continue'}
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
                        Player {idx + 1}: {playerNames[color] || COLOR_NAMES[color]}
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
                <div className="player-legend" style={{ marginBottom: '24px' }}>
                  {activeColors.map((color, idx) => (
                    <div key={color} className="legend-row" style={{ fontSize: '16px', padding: '12px' }}>
                      <span className={`legend-dot ${color}`} />
                      <span>
                        <strong>Player {idx + 1}: {playerNames[color] || COLOR_NAMES[color]}</strong>
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
                <li>Choose mode lets you pick the move number.</li>
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
                    <h3>{current.name}</h3>
                  </div>
                </div>
                <div className="player-legend compact">
                  {players.map((player, idx) => (
                    <div key={player.id} className="legend-row">
                      <span className={`legend-dot ${player.color}`} />
                      <span>
                        Player {idx + 1}: {player.name}
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
                        moveMode !== 'roll' ||
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
                      moveMode !== 'roll' ||
                      isAnimating ||
                      isRolling
                    }
                  >
                    {isRolling ? 'Rolling...' : 'Roll'}
                  </button>
                </div>
                <div className="mode-toggle">
                  <button
                    type="button"
                    className={`btn ${moveMode === 'roll' ? 'active' : ''}`}
                    onClick={() => setMoveModeSafe('roll')}
                    disabled={
                      phase !== 'playing' || gameOver || isAnimating || isRolling || hasRolled
                    }
                  >
                    Roll Mode
                  </button>
                  <button
                    type="button"
                    className={`btn ${moveMode === 'choose' ? 'active' : ''}`}
                    onClick={() => setMoveModeSafe('choose')}
                    disabled={
                      phase !== 'playing' || gameOver || isAnimating || isRolling || hasRolled
                    }
                  >
                    Choose Mode
                  </button>
                </div>
                {moveMode === 'choose' ? (
                  <div className="choose-row">
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`choose-chip ${current.color} ${
                          selectedMove === value ? 'selected' : ''
                        }`}
                        onClick={() => chooseMove(value)}
                        disabled={
                          phase !== 'playing' || hasRolled || gameOver || isAnimating || isRolling
                        }
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                ) : null}
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
