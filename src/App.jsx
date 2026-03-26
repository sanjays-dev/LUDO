import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [setupStep, setSetupStep] = useState('mode') // mode | create | join | settings
  const [playMode, setPlayMode] = useState(null) // local | room
  const [playerCount, setPlayerCount] = useState(4)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinStatus, setJoinStatus] = useState('idle') // idle | loading | success | error
  const [joinedPlayers, setJoinedPlayers] = useState(1)
  const [colorsTaken, setColorsTaken] = useState([])
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
  const playersRef = useRef(players)
  const animatingRef = useRef(false)
  const finishedRef = useRef([])
  const phaseRef = useRef(phase)
  const gameOverRef = useRef(gameOver)
  const diceVisibleUntilRef = useRef(0)
  const diceClearTimerRef = useRef(null)

  const activeColors = useMemo(() => {
    return COLOR_ORDER.filter((color) => selectedColors.includes(color))
  }, [selectedColors])

  const availableColors = useMemo(() => {
    if (playerCount === 2) return ['green', 'red']
    if (playerCount === 3) return ['green', 'yellow', 'blue']
    return COLOR_ORDER
  }, [playerCount])

  useEffect(() => {
    const seen = localStorage.getItem('ludo_tutorial_seen')
    if (!seen) {
      setShowTutorial(true)
    }
  }, [])

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

  useEffect(() => {
    if (playMode !== 'room' || !roomCode || !myColor) return
    const currentName = playerNames[myColor]
    if (!currentName) return
    try {
      const stored = localStorage.getItem(`ludo_room_${roomCode}`)
      if (!stored) return
      const parsed = JSON.parse(stored)
      localStorage.setItem(
        `ludo_room_${roomCode}`,
        JSON.stringify({
          ...parsed,
          namesByColor: {
            ...(parsed.namesByColor || {}),
            [myColor]: currentName,
          },
        })
      )
    } catch (err) {
      // ignore
    }
  }, [playerNames, playMode, roomCode, myColor])

  useEffect(() => {
    if (playMode !== 'room' || setupStep !== 'create' || !roomCode) return
    try {
      const taken = myColor ? [myColor] : []
      localStorage.setItem(
        `ludo_room_${roomCode}`,
        JSON.stringify({
          playerCount,
          joinedPlayers: taken.length || joinedPlayers,
          colorsTaken: taken,
          namesByColor: myColor && myName ? { [myColor]: myName } : {},
          createdAt: Date.now(),
        })
      )
      setColorsTaken(taken)
    } catch (err) {
      // Storage is optional; ignore if blocked.
    }
  }, [playMode, setupStep, roomCode, playerCount, joinedPlayers, myColor, myName])

  useEffect(() => {
    if (!roomCode || playMode !== 'room') return
    function handleStorage(e) {
      if (e.key !== `ludo_room_${roomCode}` || !e.newValue) return
      try {
        const data = JSON.parse(e.newValue)
        if (data?.joinedPlayers) {
          setJoinedPlayers(Math.min(data.joinedPlayers, data.playerCount || playerCount))
        }
        if (Array.isArray(data?.colorsTaken)) {
          setColorsTaken(data.colorsTaken)
        }
        if (data?.namesByColor) {
          setPlayerNames((prev) => ({ ...prev, ...data.namesByColor }))
        }
      } catch (err) {
        // ignore
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [roomCode, playMode, playerCount])

  useEffect(() => {
    if (!roomCode || playMode !== 'room' || phase !== 'playing') return
    try {
      const stored = localStorage.getItem(`ludo_chat_${roomCode}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setChatMessages(parsed)
        }
      }
    } catch (err) {
      // ignore
    }
  }, [roomCode, playMode, phase])
  

  useEffect(() => {
    if (!roomCode || playMode !== 'room' || phase !== 'playing') return
    try {
      localStorage.setItem(`ludo_chat_${roomCode}`, JSON.stringify(chatMessages))
    } catch (err) {
      // ignore
    }
  }, [chatMessages, roomCode, playMode, phase])

  useEffect(() => {
    if (!roomCode || playMode !== 'room' || phase !== 'playing') return
    function handleChatStorage(e) {
      if (e.key !== `ludo_chat_${roomCode}` || !e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue)
        if (Array.isArray(parsed)) {
          setChatMessages(parsed)
        }
      } catch (err) {
        // ignore
      }
    }
    window.addEventListener('storage', handleChatStorage)
    return () => window.removeEventListener('storage', handleChatStorage)
  }, [roomCode, playMode, phase])

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

  const winner = useMemo(() => {
    if (!finishedOrder.length) return null
    return players.find((player) => player.id === finishedOrder[0]) || null
  }, [players, finishedOrder])

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

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }

  function chooseMode(mode) {
    if (mode === 'local') {
      setPlayMode('local')
      setSetupStep('settings')
      setJoinedPlayers(playerCount)
      return
    }
    if (mode === 'room') {
      const code = generateRoomCode()
      setPlayMode('room')
      setRoomCode(code)
      setJoinedPlayers(1)
      setColorsTaken(['green'])
      setMyColor('green')
      setMyName('Player 1')
      try {
        localStorage.setItem(
          `ludo_room_${code}`,
          JSON.stringify({
            playerCount,
            joinedPlayers: 1,
            colorsTaken: ['green'],
            namesByColor: { green: 'Player 1' },
            createdAt: Date.now(),
          })
        )
      } catch (err) {
        // Storage is optional; ignore if blocked.
      }
      setSetupStep('create')
    }
  }

  function handleJoinRoom() {
    if (!joinCode.trim()) {
      toast.error('Enter a room code to join.')
      return
    }
    const incoming = joinCode.trim().toUpperCase()
    if (!myColor) {
      toast.error('Choose a color to join.')
      setJoinStatus('error')
      return
    }
    const stored = localStorage.getItem(`ludo_room_${incoming}`)
    if (!stored) {
      toast.error('Room not found. Check the code and try again.')
      setJoinStatus('error')
      playSfx('error')
      return
    }
    setJoinStatus('loading')
    setTimeout(() => {
      let parsed = null
      try {
        parsed = JSON.parse(stored)
      } catch (err) {
        parsed = null
      }
      if (!parsed || !parsed.playerCount) {
        setJoinStatus('error')
        toast.error('Room data is corrupted. Try again.')
        playSfx('error')
        return
      }
      const taken = Array.isArray(parsed.colorsTaken) ? parsed.colorsTaken : []
      if (taken.includes(myColor)) {
        setJoinStatus('error')
        toast.error('That color is already taken.')
        playSfx('error')
        return
      }
      const nextTaken = [...taken, myColor]
      const nextJoined = Math.min(nextTaken.length, parsed.playerCount)
      try {
        localStorage.setItem(
          `ludo_room_${incoming}`,
          JSON.stringify({
            playerCount: parsed.playerCount,
            joinedPlayers: nextJoined,
            colorsTaken: nextTaken,
            namesByColor: {
              ...(parsed.namesByColor || {}),
              [myColor]: myName || `Player ${nextJoined}`,
            },
            createdAt: parsed.createdAt || Date.now(),
          })
        )
      } catch (err) {
        // ignore
      }
      setRoomCode(incoming)
      setPlayerCount(parsed.playerCount)
      setJoinedPlayers(nextJoined)
      setColorsTaken(nextTaken)
      setPlayerNames((prev) => ({
        ...prev,
        ...(parsed.namesByColor || {}),
        [myColor]: myName || `Player ${nextJoined}`,
      }))
      setJoinStatus('success')
      toast.success('Room joined!')
      playSfx('join')
      setSetupStep('settings')
    }, 1100)
  }

  function handleBackToMode() {
    setPlayMode(null)
    setSetupStep('mode')
    setJoinStatus('idle')
    setJoinedPlayers(1)
    setColorsTaken([])
    setMyColor(null)
    setMyName('')
  }

  function handleBackToSetup() {
    setPhase('setup')
    setSetupStep('mode')
    setPlayMode(null)
    setJoinStatus('idle')
    setJoinedPlayers(1)
    setColorsTaken([])
    setMyColor(null)
    setMyName('')
  }

  function startGame() {
    if (activeColors.length < 2 || activeColors.length !== playerCount) {
      toast.info(`Choose exactly ${playerCount} colors to start.`)
      return
    }
    const allowBotFill =
      playMode === 'room' && playerCount === 4 && joinedPlayers === 3
    if (playMode === 'room' && joinedPlayers < playerCount && !allowBotFill) {
      toast.info('Wait for all players to join.')
      return
    }
    const botByColor = {}
    const names = { ...playerNames }
    if (allowBotFill) {
      const botColor =
        activeColors.find((color) => !colorsTaken.includes(color)) ||
        activeColors[activeColors.length - 1]
      botByColor[botColor] = true
      names[botColor] = names[botColor] || 'Bot'
    }
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

  function rollDice() {
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

  async function handleMoveToken(tokenId) {
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

  function chooseMove(value) {
    if (phase !== 'playing' || hasRolled || gameOver || moveMode !== 'choose' || isAnimating)
      return
    setSelectedMove(value)
    setDice(value)
    setLastRoll(value)
    diceVisibleUntilRef.current = Date.now() + 3000
    setHasRolled(true)
    playTone({ frequency: 520, type: 'triangle', duration: 0.1, volume: 0.1 })

    const player = players[currentPlayer]
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
            {setupStep === 'mode' ? (
              <>
                <h1>Play Mode</h1>
                <p>Start local play or create a room to play with friends.</p>
                <div className="mode-grid">
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('local')}
                  >
                    <strong>Local</strong>
                    <span>Play on the same device.</span>
                  </button>
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => chooseMode('room')}
                  >
                    <strong>Create Room</strong>
                    <span>Get a code and play with friends.</span>
                  </button>
                  <button
                    className="mode-card"
                    type="button"
                    onClick={() => {
                      setPlayMode('room')
                      setSetupStep('join')
                      setJoinStatus('idle')
                    }}
                  >
                    <strong>Join Room</strong>
                    <span>Enter a code to join a room.</span>
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'create' ? (
              <>
                <h1>Create Room</h1>
                <p>Choose player count first. Then share the code with friends.</p>
                <div className="player-count">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`count-chip ${playerCount === count ? 'active' : ''}`}
                      onClick={() => {
                        setPlayerCount(count)
                        setJoinedPlayers((prev) => Math.min(prev, count))
                      }}
                    >
                      {count} Players
                    </button>
                  ))}
                </div>
                <div className="room-card">
                  <span className="room-label">Room Code</span>
                  <div className="room-code">{roomCode || '------'}</div>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      const code = generateRoomCode()
                      setRoomCode(code)
                      setJoinedPlayers(1)
                      try {
                        localStorage.setItem(
                          `ludo_room_${code}`,
                          JSON.stringify({ playerCount, joinedPlayers: 1, createdAt: Date.now() })
                        )
                      } catch (err) {
                        // Storage is optional; ignore if blocked.
                      }
                      toast.success('New room code generated.')
                    }}
                  >
                    Generate New Code
                  </button>
                </div>
                <div className="room-join">
                  <label>
                    Your name
                    <input
                      type="text"
                      value={myName}
                      onChange={(e) => setMyName(e.target.value)}
                      placeholder="Enter name"
                    />
                  </label>
                </div>
                <div className="color-grid">
                  {availableColors.map((color) => {
                    const selected = myColor === color
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`color-card ${color} ${selected ? 'selected' : ''}`}
                        onClick={() => setMyColor(color)}
                      >
                        <span className={`color-token ${color}`} />
                        <strong>{COLOR_NAMES[color]}</strong>
                        <span className="color-meta">{selected ? 'Selected' : 'Tap to choose'}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="room-status">
                  <span>
                    Players joined: {Math.min(joinedPlayers, playerCount)}/{playerCount}
                  </span>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      const nextJoined = Math.min(joinedPlayers + 1, playerCount)
                      setJoinedPlayers(nextJoined)
                      try {
                        localStorage.setItem(
                          `ludo_room_${roomCode}`,
                          JSON.stringify({
                            playerCount,
                            joinedPlayers: nextJoined,
                            createdAt: Date.now(),
                          })
                        )
                      } catch (err) {
                        // ignore
                      }
                    }}
                  >
                    Mark Player Joined
                  </button>
                </div>
                <div className="setup-actions">
                  <button className="btn" onClick={() => setSetupStep('settings')}>
                    Continue
                  </button>
                  <button className="btn ghost" onClick={handleBackToMode}>
                    Back
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'join' ? (
              <>
                <h1>Join Room</h1>
                <p>Enter the room code shared by your friend.</p>
                <div className="room-join">
                  <label>
                    Your name
                    <input
                      type="text"
                      value={myName}
                      onChange={(e) => setMyName(e.target.value)}
                      placeholder="Enter name"
                    />
                  </label>
                  <label>
                    Room code
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value)
                        setJoinStatus('idle')
                      }}
                      placeholder="Enter code"
                    />
                  </label>
                  <button className="btn" onClick={handleJoinRoom} disabled={joinStatus === 'loading'}>
                    {joinStatus === 'loading' ? 'Joining...' : 'Join Room'}
                  </button>
                </div>
                <div className="color-grid">
                  {availableColors.map((color) => {
                    const selected = myColor === color
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`color-card ${color} ${selected ? 'selected' : ''}`}
                        onClick={() => setMyColor(color)}
                      >
                        <span className={`color-token ${color}`} />
                        <strong>{COLOR_NAMES[color]}</strong>
                        <span className="color-meta">{selected ? 'Selected' : 'Tap to choose'}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="join-status">
                  {joinStatus === 'loading' ? (
                    <>
                      <span className="loader" />
                      <span>Verifying code, please wait...</span>
                    </>
                  ) : null}
                  {joinStatus === 'success' ? <span>Room joined. Waiting to start...</span> : null}
                  {joinStatus === 'error' ? (
                    <span className="error-text">Invalid code. Check and try again.</span>
                  ) : null}
                </div>
                <div className="setup-actions">
                  <button className="btn ghost" onClick={handleBackToMode}>
                    Back
                  </button>
                </div>
              </>
            ) : null}

            {setupStep === 'settings' ? (
              <>
                <h1>Choose Players & Colors</h1>
                <p>
                  {playMode === 'room'
                    ? 'Room player count is locked. Choose colors.'
                    : 'Select player count, then choose colors.'}
                </p>
                <div className="player-count">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`count-chip ${playerCount === count ? 'active' : ''}`}
                      onClick={() => {
                        if (playMode === 'room') return
                        setPlayerCount(count)
                      }}
                      disabled={playMode === 'room'}
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
                <div className="name-list">
                  {activeColors.map((color, idx) => (
                    <label
                      key={color}
                      className={`name-row ${
                        playMode === 'room' && myColor !== color ? 'locked' : ''
                      }`}
                    >
                      <span className={`legend-dot ${color}`} />
                      <span className="name-label">Player {idx + 1}</span>
                      <input
                        type="text"
                        value={playerNames[color] || `Player ${idx + 1}`}
                        onChange={(e) =>
                          setPlayerNames((prev) => ({
                            ...prev,
                            [color]: e.target.value,
                          }))
                        }
                        placeholder="Enter name"
                        disabled={playMode === 'room' && myColor !== color}
                      />
                      {playMode === 'room' && myColor !== color ? (
                        <span className="name-lock">Locked</span>
                      ) : (
                        <span className="name-lock editable">Editable</span>
                      )}
                    </label>
                  ))}
                </div>
                <div className="setup-actions">
                  <button
                    className="btn"
                    onClick={startGame}
                    disabled={
                      activeColors.length !== playerCount ||
                      (playMode === 'room' &&
                        !(
                          joinedPlayers >= playerCount ||
                          (playerCount === 4 && joinedPlayers === 3)
                        ))
                    }
                  >
                    Start Game
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setSelectedColors(COLOR_ORDER.slice(0, playerCount))}
                  >
                    Select {playerCount}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      if (playMode === 'room') {
                        setSetupStep('create')
                      } else {
                        handleBackToMode()
                      }
                    }}
                  >
                    Back
                  </button>
                </div>
                {playMode === 'room' ? (
                  <div className="setup-note">
                    Waiting for players: {Math.min(joinedPlayers, playerCount)}/{playerCount}
                  </div>
                ) : null}
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
              <li>In room mode, 4 players can start with 3 and a bot joins.</li>
            </ul>
          </div>
          <div className="setup-card rules-card">
            <h2>Rules Summary</h2>
            <ul>
              <li>Only the selected player count can join a room.</li>
              <li>Players pick their own color in room mode.</li>
              <li>Player names are editable only by that player.</li>
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
                <div className="turn">
                  <span className={`turn-indicator ${current.color}`} />
                  <div>
                    <strong>{current.name}</strong>
                    <p className="turn-message">{message}</p>
                  </div>
                </div>
                {playMode === 'room' ? (
                  <div className="room-pill">
                    Players joined: {Math.min(joinedPlayers, playerCount)}/{playerCount}
                  </div>
                ) : null}
                <div className="setup-actions">
                  <button className="btn ghost" onClick={handleBackToSetup}>
                    Back to Setup
                  </button>
                </div>
              </div>
              {playMode === 'room' ? (
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
              ) : null}
            </aside>
          </main>
        </>
      )}
    </div>
  )
}

export default App
