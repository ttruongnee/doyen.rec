// ─────────────────────────────────────────────────────────────────────────────
//  TutorSchedule – App.jsx   (updated)
//  Deps: npm install xlsx
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, X, Download, Copy,
  Settings, BookOpen, DollarSign, Calendar, Trash2,
  GripVertical, Check, AlertCircle, Pencil, Clock,
  Sun, Moon, AlertTriangle, Eye, EyeOff,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

const PALETTE = [
  '#FF6B6B', '#FF8E53', '#FAB005', '#51CF66',
  '#20C997', '#339AF0', '#5C7CFA', '#CC5DE8',
  '#E64980', '#38BDF8', '#A9E34B', '#F06595',
]

// DEFAULT_CLASSES — times use new "HH:MM-HH:MM" format
const DEFAULT_CLASSES = [
  { id: 'meoc', name: 'Mèo Con', times: ['05:00-07:00', '04:45-06:45', '07:00-09:00'], color: '#FF6B6B' },
  { id: 'gautru', name: 'Gấu Trúc', times: ['06:30-08:30', '05:00-07:00'], color: '#51CF66' },
  { id: 'cavoi', name: 'Cá Voi', times: ['07:00-09:00'], color: '#339AF0' },
  { id: 'nguavan', name: 'Ngựa Vằn', times: ['04:30-06:30', '05:00-07:00'], color: '#FAB005' },
]

// ─── Themes ───────────────────────────────────────────────────────────────────
const T = {
  dark: {
    bg: '#0D1117', surface: '#161B22', s2: '#1C2230', s3: '#21283A',
    border: '#30363D', border2: '#21262D',
    text: '#E6EDF3', text2: '#CDD9E5', muted: '#8B949E',
    accent: '#38BDF8', accentBg: '#38BDF815',
    green: '#3FB950', red: '#F85149', yellow: '#F0B429',
  },
  light: {
    bg: '#F6F8FA', surface: '#FFFFFF', s2: '#EFF1F3', s3: '#E8EAED',
    border: '#D0D7DE', border2: '#E2E8F0',
    text: '#1F2328', text2: '#374151', muted: '#6E7781',
    accent: '#0969DA', accentBg: '#0969DA12',
    green: '#1A7F37', red: '#CF222E', yellow: '#9A6700',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat('vi-VN').format(n)
const mk = (y, m) => `${y}-${String(m).padStart(2, '0')}`
const dk = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dim = (y, m) => new Date(y, m, 0).getDate()
const fdo = (y, m) => new Date(y, m - 1, 1).getDay()
const dayName = (y, m, d) => WEEKDAYS[new Date(y, m - 1, d).getDay()]
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }

/** Strip leading zero from hour: "05:00-07:00" → "5:00-7:00" */
const fmtTime = t => t
  ? t.replace(/^0(\d)/, '$1').replace(/-0(\d)/, '-$1')
  : t

/**
 * Returns array of weeks, each week is array of day numbers (1-based).
 * Week index matches the calendar grid row.
 */
function getMonthWeeks(y, m) {
  const dc = dim(y, m)
  const firstDay = fdo(y, m) // 0=Sun
  const weeks = []
  for (let d = 1; d <= dc; d++) {
    const wi = Math.floor((firstDay + d - 1) / 7)
    if (!weeks[wi]) weeks[wi] = []
    weeks[wi].push(d)
  }
  return weeks
}

// ─── Time migration (old "5-7h" → new "HH:MM-HH:MM") ─────────────────────────
function migrateTimeStr(t) {
  if (!t) return '05:00-07:00'
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(t)) return t  // already new format
  const m = t.trim().match(/^(\d+)(?:h(\d+)?)?-(\d+)(?:h(\d+)?)?h?$/)
  if (!m) return '05:00-07:00'
  const sh = parseInt(m[1]), sm = m[2] ? parseInt(m[2]) : 0
  const eh = parseInt(m[3]), em = m[4] ? parseInt(m[4]) : 0
  return `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}-${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

const migrateClass = c => ({
  ...c,
  times: (c.times || (c.defaultTime ? [c.defaultTime] : ['05:00-07:00'])).map(migrateTimeStr),
})

function migrateSchedules(schedules) {
  const result = {}
  for (const [mk, monthSched] of Object.entries(schedules)) {
    result[mk] = {}
    for (const [dayKey, sessions] of Object.entries(monthSched)) {
      result[mk][dayKey] = sessions.map(s => ({ ...s, time: migrateTimeStr(s.time) }))
    }
  }
  return result
}

// ─── ② Time-overlap detection (new format "HH:MM-HH:MM") ─────────────────────
function parseTime(str) {
  if (!str) return null
  const idx = str.indexOf('-')
  if (idx < 0) return null
  const [sh, sm] = str.slice(0, idx).split(':').map(Number)
  const [eh, em] = str.slice(idx + 1).split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null
  return { s: sh * 60 + sm, e: eh * 60 + em }
}

const timesOverlap = (a, b) => {
  const ra = parseTime(a), rb = parseTime(b)
  return !!(ra && rb && ra.s < rb.e && rb.s < ra.e)
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const globalCSS = (theme) => `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif;
    background: ${theme.bg}; color: ${theme.text}; font-size: 14px; line-height: 1.5;
  }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
  input[type=number] { -moz-appearance: textfield; }
  input[type=time] { color-scheme: dark; }
  .day-cell:hover { filter: brightness(1.04); }
  .session-pill { transition: transform 0.1s, opacity 0.1s; }
  .session-pill:hover { transform: scale(1.03); opacity: 0.8; }
  .drag-item { transition: all 0.12s; }
  .drag-item:hover { transform: translateY(-1px); }
  .tab-btn { transition: all 0.12s; }
  .tab-btn:hover { opacity: 0.9; }
  .cls-card { transition: all 0.1s; }
  .cls-card:hover { filter: brightness(1.05); }
  .time-chip { transition: all 0.1s; }
  .time-chip:hover:not(:disabled) { transform: translateY(-1px) scale(1.04); }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  .fadeIn { animation: fadeIn 0.18s ease; }
  @keyframes slideIn { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:none; } }
  .slideIn { animation: slideIn 0.22s ease; }
  @keyframes shake { 0%,100%{transform:none} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
  .shake { animation: shake 0.25s ease; }
`

// ─── Toast System ─────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove, S: s }) {
  return (
    <div style={{
      position: 'fixed', top: 68, right: 18, zIndex: 999,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} className="slideIn" style={{
          pointerEvents: 'all',
          background: s.surface,
          border: `1.5px solid ${t.type === 'error' ? s.red : s.green}`,
          borderLeft: `4px solid ${t.type === 'error' ? s.red : s.green}`,
          borderRadius: 11, padding: '11px 15px',
          boxShadow: '0 6px 28px rgba(0,0,0,0.28)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          maxWidth: 340, color: s.text, fontSize: 13, fontWeight: 600,
        }}>
          <AlertTriangle size={15} color={t.type === 'error' ? s.red : s.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t.msg}</span>
          <button onClick={() => onRemove(t.id)} style={{
            background: 'none', border: 'none', color: s.muted, cursor: 'pointer', padding: 2,
            display: 'flex', flexShrink: 0,
          }}><X size={13} /></button>
        </div>
      ))}
    </div>
  )
}

function useToasts() {
  const [toasts, setToasts] = useState([])
  const addToast = useCallback((msg, type = 'error') => {
    const id = uid()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3800)
  }, [])
  const removeToast = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])
  return { toasts, addToast, removeToast }
}

// ─── MoneyInput ───────────────────────────────────────────────────────────────
function MoneyInput({ label, value, onChange, step = 10000, hint, theme: s }) {
  const [raw, setRaw] = useState(String(value || 0))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setRaw(String(value || 0)) }, [value, focused])
  const commit = () => { const n = parseInt(raw.replace(/\D/g, '')) || 0; onChange(n); setRaw(String(n)) }
  const display = focused ? raw : fmt(value || 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</label>}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1.5px solid ${focused ? s.accent : s.border}`,
        borderRadius: 10, overflow: 'hidden', background: focused ? `${s.accent}08` : s.s2,
        transition: 'all 0.15s', boxShadow: focused ? `0 0 0 3px ${s.accent}20` : 'none',
      }}>
        <button onClick={() => { const n = Math.max(0, (value || 0) - step); onChange(n); setRaw(String(n)) }}
          style={{ padding: '0 12px', height: 40, background: 'none', border: 'none', borderRight: `1px solid ${s.border}`, color: s.muted, cursor: 'pointer', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>−</button>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input type={focused ? 'number' : 'text'} value={display}
            onFocus={() => { setFocused(true); setRaw(String(value || 0)) }}
            onBlur={() => { setFocused(false); commit() }}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{ width: '100%', height: 40, padding: '0 8px 0 10px', background: 'none', border: 'none', outline: 'none', color: s.text, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textAlign: 'right' }} />
          <span style={{ color: s.muted, fontSize: 13, paddingRight: 10, flexShrink: 0 }}>₫</span>
        </div>
        <button onClick={() => { const n = (value || 0) + step; onChange(n); setRaw(String(n)) }}
          style={{ padding: '0 12px', height: 40, background: 'none', border: 'none', borderLeft: `1px solid ${s.border}`, color: s.accent, cursor: 'pointer', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>+</button>
      </div>
      {hint && <p style={{ fontSize: 11, color: s.muted }}>{hint}</p>}
    </div>
  )
}

// ─── TimeRangePicker — two <input type="time"> ────────────────────────────────
// value: "HH:MM-HH:MM"   onChange: (newValue: string) => void
function TimeRangePicker({ value, onChange, S: s, style = {} }) {
  const parseRange = v => {
    if (!v) return ['05:00', '07:00']
    const i = v.indexOf('-')
    if (i < 0) return [v.slice(0, 5) || '05:00', '07:00']
    return [v.slice(0, i), v.slice(i + 1)]
  }
  const [start, end] = parseRange(value)

  const inp = {
    padding: '7px 10px', borderRadius: 8,
    border: `1.5px solid ${s.border}`, background: s.s2,
    color: s.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <input type="time" value={start}
        onChange={e => onChange(`${e.target.value}-${end}`)}
        onFocus={e => e.target.style.borderColor = s.accent}
        onBlur={e => e.target.style.borderColor = s.border}
        style={inp}
      />
      <span style={{ color: s.muted, fontWeight: 700, fontSize: 14, userSelect: 'none' }}>→</span>
      <input type="time" value={end}
        onChange={e => onChange(`${start}-${e.target.value}`)}
        onFocus={e => e.target.style.borderColor = s.accent}
        onBlur={e => e.target.style.borderColor = s.border}
        style={inp}
      />
    </div>
  )
}

// ─── Reusable Components ──────────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'ghost', style = {}, disabled, S: s, ...rest }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
    fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'all 0.12s', flexShrink: 0,
  }
  const V = {
    primary: { background: s.accent, color: s.bg },
    danger: { background: s.red, color: '#fff' },
    ghost: { background: 'transparent', color: s.muted, border: `1.5px solid ${s.border}` },
    subtle: { background: s.s2, color: s.text, border: `1.5px solid ${s.border}` },
  }
  return <button style={{ ...base, ...V[variant], ...style }} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

function TextInput({ label, S: s, style = {}, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</label>}
      <input style={{
        width: '100%', padding: '9px 12px', borderRadius: 9,
        border: `1.5px solid ${focused ? s.accent : s.border}`,
        background: s.s2, color: s.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
        transition: 'all 0.15s', boxShadow: focused ? `0 0 0 3px ${s.accent}20` : 'none', ...style,
      }}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        {...props}
      />
    </div>
  )
}

function Modal({ title, children, onClose, S: s, width = 440 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div className="fadeIn" style={{
        background: s.surface, border: `1.5px solid ${s.border}`,
        borderRadius: 16, padding: 24, width, maxWidth: '95vw', maxHeight: '90vh',
        overflowY: 'auto', position: 'relative',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: s.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: s.muted, cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex' }}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── ColorPicker — palette + hex input + native color wheel ──────────────────
function ColorPicker({ value, onChange, S: s }) {
  const [hexInput, setHexInput] = useState(value || PALETTE[0])
  useEffect(() => setHexInput(value || PALETTE[0]), [value])

  const isValidHex = v => /^#[0-9A-Fa-f]{6}$/.test(v)

  const tryApply = v => {
    const clean = v.startsWith('#') ? v : `#${v}`
    setHexInput(clean)
    if (isValidHex(clean)) onChange(clean)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Preset swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PALETTE.map(c => (
          <div key={c} onClick={() => { onChange(c); setHexInput(c) }} style={{
            width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
            border: value === c ? '3px solid #fff' : '3px solid transparent',
            boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
            transition: 'all 0.12s', transform: value === c ? 'scale(1.15)' : 'scale(1)',
          }} />
        ))}
      </div>

      {/* Custom color row: native picker swatch + hex input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Native color picker trigger */}
        <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, background: value || '#FF6B6B',
            border: `2px solid ${s.border}`,
            boxShadow: isValidHex(value || '') ? `0 0 0 2px ${value}60` : 'none',
            transition: 'all 0.15s',
          }} />
          <input type="color" value={isValidHex(value || '') ? value : '#FF6B6B'}
            onChange={e => { onChange(e.target.value); setHexInput(e.target.value) }}
            title="Chọn màu"
            style={{
              position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
              width: '100%', height: '100%', padding: 0, border: 'none',
            }}
          />
        </div>

        {/* Hex text input */}
        <div style={{ flex: 1 }}>
          <input
            value={hexInput}
            onChange={e => tryApply(e.target.value)}
            placeholder="#RRGGBB"
            maxLength={7}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 9,
              border: `1.5px solid ${isValidHex(hexInput) ? s.border : s.red}`,
              background: s.s2, color: s.text, fontSize: 13, fontFamily: 'monospace',
              outline: 'none', transition: 'border-color 0.15s',
              letterSpacing: 1,
            }}
            onFocus={e => e.target.style.borderColor = s.accent}
            onBlur={e => e.target.style.borderColor = isValidHex(hexInput) ? s.border : s.red}
          />
        </div>

        {/* Live preview */}
        {isValidHex(hexInput) && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#fff', background: hexInput,
            borderRadius: 7, padding: '5px 10px', flexShrink: 0, letterSpacing: 0.3,
          }}>
            Xem trước
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorBanner({ msg, onClose, S: s }) {
  if (!msg) return null
  return (
    <div className="shake fadeIn" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
      background: `${s.red}15`, border: `1.5px solid ${s.red}50`,
      borderRadius: 10, marginBottom: 14, color: s.red, fontSize: 13, lineHeight: 1.45,
    }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: s.red, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={14} /></button>
    </div>
  )
}

// ─── ClassManager ─────────────────────────────────────────────────────────────
function ClassManager({ classes, setClasses, S: s }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', times: ['05:00-07:00'], color: PALETTE[0] })

  const openNew = () => { setEditing(null); setForm({ name: '', times: ['05:00-07:00'], color: PALETTE[0] }); setModal(true) }
  const openEdit = cls => { setEditing(cls.id); setForm({ name: cls.name, times: [...cls.times], color: cls.color }); setModal(true) }

  const saveForm = () => {
    if (!form.name.trim()) return
    const times = form.times.filter(Boolean)
    const data = { ...form, times: times.length ? times : ['05:00-07:00'] }
    if (editing) setClasses(p => p.map(c => c.id === editing ? { ...c, ...data } : c))
    else setClasses(p => [...p, { id: uid(), ...data }])
    setModal(false)
  }
  const del = id => setClasses(p => p.filter(c => c.id !== id))

  const setTime = (i, v) => setForm(p => { const t = [...p.times]; t[i] = v; return { ...p, times: t } })
  const addTime = () => setForm(p => ({ ...p, times: [...p.times, '05:00-07:00'] }))
  const removeTime = i => setForm(p => ({ ...p, times: p.times.filter((_, j) => j !== i) }))

  return (
    <div style={{ padding: 32, maxWidth: 580, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 22, color: s.text, marginBottom: 5 }}>Lớp học</h2>
          <p style={{ color: s.muted, fontSize: 13, lineHeight: 1.6 }}>
            Mỗi lớp có thể có nhiều khung giờ.<br />
            Khi kéo vào lịch, mỗi khung giờ là 1 mục riêng.
          </p>
        </div>
        <Btn S={s} variant="primary" onClick={openNew} style={{ marginTop: 4 }}><Plus size={14} />Thêm lớp</Btn>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {classes.map(cls => (
          <div key={cls.id} className="cls-card" style={{
            background: s.surface, border: `1.5px solid ${s.border}`,
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
            borderLeft: `4px solid ${cls.color}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: s.text, marginBottom: 7 }}>{cls.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {cls.times.map((t, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700, color: cls.color,
                    background: `${cls.color}18`, border: `1px solid ${cls.color}40`,
                    borderRadius: 5, padding: '3px 9px',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <Clock size={9} />{fmtTime(t)}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn S={s} variant="ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openEdit(cls)}>
                <Pencil size={12} />Sửa
              </Btn>
              <button onClick={() => del(cls.id)} style={{
                background: `${s.red}15`, border: `1px solid ${s.red}30`, color: s.red,
                cursor: 'pointer', padding: '6px 9px', borderRadius: 8, display: 'flex',
              }}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {classes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: s.muted, border: `2px dashed ${s.border}`, borderRadius: 12 }}>
            <Plus size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p style={{ fontSize: 13 }}>Chưa có lớp nào</p>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Sửa lớp học' : 'Thêm lớp mới'} onClose={() => setModal(false)} S={s} width={500}>
          <div style={{ display: 'grid', gap: 20 }}>
            <TextInput S={s} label="Tên lớp" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="VD: Mèo Con" autoFocus />

            {/* Multiple time slots — using TimeRangePicker */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                Khung giờ dạy
                <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
                  (thêm nhiều khung nếu cần)
                </span>
              </div>
              {form.times.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <TimeRangePicker S={s} value={t} onChange={v => setTime(i, v)} style={{ flex: 1 }} />
                  {form.times.length > 1 && (
                    <button onClick={() => removeTime(i)} style={{
                      background: `${s.red}15`, border: `1px solid ${s.red}30`, color: s.red,
                      borderRadius: 8, cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}><X size={14} /></button>
                  )}
                </div>
              ))}
              <button onClick={addTime} style={{
                width: '100%', marginTop: 2, padding: '8px 12px', borderRadius: 9,
                background: 'none', border: `1.5px dashed ${s.border}`, color: s.muted,
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <Plus size={13} />Thêm khung giờ
              </button>
            </div>

            {/* Color — palette + hex input */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                Màu lớp
              </div>
              <ColorPicker value={form.color} onChange={c => setForm(p => ({ ...p, color: c }))} S={s} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${s.border}` }}>
            <Btn S={s} variant="ghost" style={{ flex: 1 }} onClick={() => setModal(false)}>Huỷ</Btn>
            <Btn S={s} variant="primary" style={{ flex: 1 }} onClick={saveForm}><Check size={14} />Lưu lớp</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── DayModal ─────────────────────────────────────────────────────────────────
function DayModal({ year, month, day, dayKey, sessions, classes, onAdd, onRemove, onTimeChange, onCopyPrevWeek, onClose, S: s }) {
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  const filtered = filter
    ? classes.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    : classes

  const handleAdd = (classId, time) => {
    if (sessions.some(x => x.classId === classId && x.time === time)) {
      setError(`Lớp này đã có ca "${fmtTime(time)}" trong ngày hôm nay!`); return
    }
    const conflict = sessions.find(x => timesOverlap(x.time, time))
    if (conflict) {
      const cname = classes.find(c => c.id === conflict.classId)?.name || '?'
      setError(`⚡ Trùng giờ với lớp "${cname}" (${fmtTime(conflict.time)}) — một thời điểm chỉ dạy được 1 lớp!`)
      return
    }
    setError('')
    onAdd(classId, time)
  }

  return (
    <Modal title={`${dayName(year, month, day)} – ${day}/${month}/${year}`} onClose={onClose} S={s} width={500}>
      {/* Current sessions */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
            Ca đang dạy ({sessions.length})
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {sessions.map(sess => {
              const cls = classes.find(c => c.id === sess.classId)
              return (
                <div key={sess.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: s.s2, borderRadius: 10, padding: '9px 13px',
                  border: `1.5px solid ${cls?.color || '#888'}30`,
                }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: cls?.color || '#888', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, flex: 1, color: s.text, fontSize: 14 }}>{cls?.name || '?'}</span>
                  {/* Time range picker inline */}
                  <TimeRangePicker S={s} value={sess.time} onChange={v => onTimeChange(sess.id, v)} />
                  <button onClick={() => onRemove(sess.id)} style={{
                    background: `${s.red}15`, border: `1px solid ${s.red}30`, color: s.red,
                    cursor: 'pointer', padding: '5px 7px', borderRadius: 7, display: 'flex',
                  }}><X size={13} /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ErrorBanner msg={error} onClose={() => setError('')} S={s} />

      {/* Add session — class picker with time chips */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          Thêm ca dạy
        </div>
        {classes.length > 4 && (
          <input placeholder="🔍 Tìm lớp..." value={filter} onChange={e => setFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '8px 12px', background: s.s2, border: `1.5px solid ${s.border}`, borderRadius: 9, color: s.text, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
          />
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(cls => (
            <div key={cls.id} style={{
              background: `${cls.color}0C`, border: `1.5px solid ${cls.color}30`,
              borderRadius: 10, padding: '11px 14px',
            }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: cls.color, marginBottom: 8 }}>{cls.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cls.times.map((t, i) => {
                  const already = sessions.some(x => x.classId === cls.id && x.time === t)
                  const willConflict = !already && sessions.some(x => timesOverlap(x.time, t))
                  let chipColor = cls.color, chipBg = `${cls.color}22`, chipBorder = `${cls.color}50`
                  let chipLabel = fmtTime(t), chipCursor = 'pointer', chipOpacity = 1, titleTip = `Thêm ${cls.name} – ${fmtTime(t)}`
                  if (already) { chipBg = 'transparent'; chipOpacity = 0.45; chipCursor = 'not-allowed'; chipLabel = `${fmtTime(t)} ✓`; titleTip = 'Đã thêm ca này' }
                  else if (willConflict) { chipColor = s.red; chipBg = `${s.red}10`; chipBorder = `${s.red}45`; chipLabel = `${fmtTime(t)} ✗`; titleTip = 'Trùng giờ với ca khác' }
                  return (
                    <button key={i} className="time-chip"
                      onClick={() => !already && handleAdd(cls.id, t)}
                      disabled={already} title={titleTip}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                        fontFamily: 'inherit', cursor: chipCursor,
                        border: `1.5px solid ${chipBorder}`, background: chipBg, color: chipColor, opacity: chipOpacity,
                      }}>
                      {chipLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: s.muted, fontSize: 13 }}>Không tìm thấy lớp nào</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${s.border}` }}>
        <Btn S={s} variant="ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => { onCopyPrevWeek(); onClose() }}>
          <Copy size={12} />Copy tuần trước → tuần chứa ngày này
        </Btn>
      </div>
    </Modal>
  )
}

// ─── SalaryTab ────────────────────────────────────────────────────────────────
function SalaryTab({ year, month, setYear, setMonth, sched, classes, salaryExtra, setSalaryExtra, onSetDefault, isDefault, S: s }) {
  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const perSession = salaryExtra.perSession ?? 250000
  const totalSess = Object.values(sched).reduce((s, ss) => s + ss.length, 0)
  const totalSalary = totalSess * perSession
  const totalNet = totalSalary + (salaryExtra.travel || 0) + (salaryExtra.kpi || 0) + (salaryExtra.holiday || 0)

  // Group by day for rowSpan rendering
  const dayGroups = Object.entries(sched)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, sessions]) => {
      const d = parseInt(dayKey.split('-')[2])
      return {
        dayLabel: `${dayName(year, month, d)}, ${d}/${month}`,
        isSun: new Date(year, month - 1, d).getDay() === 0,
        sessions: sessions.map(sess => ({
          cls: classes.find(c => c.id === sess.classId),
          time: sess.time,
        })),
      }
    })

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    const aoa = [], merges = []
    aoa.push([`Tháng ${month} - REC ${year}`, '', ''])
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })
    aoa.push(['Ngày', 'Lớp', 'Số ca dạy'])
    let r = 2
    Object.entries(sched).sort(([a], [b]) => a.localeCompare(b)).forEach(([dayKey, sessions]) => {
      if (!sessions.length) return
      const d = parseInt(dayKey.split('-')[2])
      const dn = `${dayName(year, month, d)}-${d}/${month}`
      if (sessions.length > 1) merges.push({ s: { r, c: 0 }, e: { r: r + sessions.length - 1, c: 0 } })
      sessions.forEach((sess, i) => {
        const cls = classes.find(c => c.id === sess.classId)
        aoa.push([i === 0 ? dn : '', `${cls?.name || '?'} ${fmtTime(sess.time)}`, i === 0 ? sessions.length : ''])
      })
      r += sessions.length
    })
    aoa.push(['', '', '']); r++
      ;[
        ['Tổng số ca dạy', '', totalSess], ['Tổng lương', '', totalSalary],
        ['Trợ cấp đi lại', '', salaryExtra.travel || 0], ['Thưởng KPI', '', salaryExtra.kpi || 0],
        ['Thưởng lễ', '', salaryExtra.holiday || 0], ['Thực lĩnh', '', totalNet],
      ].forEach(row => { merges.push({ s: { r, c: 0 }, e: { r, c: 1 } }); aoa.push(row); r++ })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = merges
    ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, `Tháng ${month}`)
    XLSX.writeFile(wb, `luong_${mk(year, month)}.xlsx`)
  }

  const EXTRA_FIELDS = [
    { key: 'travel', label: 'Trợ cấp đi lại', step: 50000 },
    { key: 'kpi', label: 'Thưởng KPI', step: 50000 },
    { key: 'holiday', label: 'Thưởng lễ', step: 50000 },
  ]

  return (
    <div style={{ padding: '28px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Btn S={s} variant="ghost" style={{ padding: '7px 11px' }} onClick={prevMonth}><ChevronLeft size={16} /></Btn>
        <h2 style={{ fontWeight: 800, fontSize: 22, minWidth: 190, textAlign: 'center', color: s.text }}>{MONTH_NAMES[month]} {year}</h2>
        <Btn S={s} variant="ghost" style={{ padding: '7px 11px' }} onClick={nextMonth}><ChevronRight size={16} /></Btn>
        <Btn S={s} variant="primary" style={{ marginLeft: 'auto', gap: 7 }} onClick={exportExcel}><Download size={14} />Export Excel (.xlsx)</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Tổng số ca', value: `${totalSess} ca`, color: s.accent },
          { label: 'Tổng lương', value: `${fmt(totalSalary)} đ`, color: s.yellow },
          { label: 'Thực lĩnh', value: `${fmt(totalNet)} đ`, color: s.green },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: s.surface, border: `1.5px solid ${s.border}`, borderRadius: 14, padding: '18px 20px', borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 12, color: s.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: 22, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Main content: table (wider) + salary panel side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

        {/* ── Schedule table with rowSpan ───────────────────────────── */}
        <div style={{ background: s.surface, border: `1.5px solid ${s.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {dayGroups.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '34%' }} />
                <col style={{ width: '34%' }} />
                <col style={{ width: '17%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: s.s2 }}>
                  {['Ngày', 'Lớp', 'Khung giờ', 'Số ca dạy'].map((h, hi) => (
                    <th key={h} style={{
                      padding: '13px 18px', textAlign: hi === 3 ? 'center' : 'left',
                      fontSize: 11, fontWeight: 800, color: s.muted,
                      textTransform: 'uppercase', letterSpacing: 0.7,
                      borderBottom: `2px solid ${s.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayGroups.map((group, gi) => {
                  const isMulti = group.sessions.length > 1
                  const groupBg = isMulti ? `${s.accent}08` : 'transparent'
                  return group.sessions.map((sess, si) => {
                    const isFirstRow = si === 0
                    const isLastRow = si === group.sessions.length - 1
                    // top border: only on first row of each group
                    const rowBorder = isFirstRow && gi > 0 ? `2px solid ${s.border}` : (isFirstRow ? 'none' : `1px solid ${s.border2}`)
                    return (
                      <tr key={`${gi}-${si}`} style={{ background: groupBg }}>

                        {/* DAY — rowspan */}
                        {isFirstRow && (
                          <td rowSpan={group.sessions.length} style={{
                            padding: '0 18px',
                            borderTop: gi > 0 ? `2px solid ${s.border}` : 'none',
                            borderRight: `1px solid ${s.border}`,
                            verticalAlign: 'middle',
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                              {/* Weekday badge */}
                              <span style={{
                                fontSize: 10, fontWeight: 900, letterSpacing: 0.8,
                                color: group.isSun ? s.red : s.accent,
                                textTransform: 'uppercase',
                              }}>
                                {group.dayLabel.split(',')[0]}
                              </span>
                              <span style={{ fontWeight: 800, fontSize: 16, color: s.text, lineHeight: 1 }}>
                                {group.dayLabel.split(',')[1]?.trim()}
                              </span>

                            </div>
                          </td>
                        )}

                        {/* CLASS */}
                        <td style={{
                          padding: '12px 18px',
                          borderTop: rowBorder,
                          borderLeft: isFirstRow ? 'none' : `1px solid ${s.border2}`,
                        }}>
                          {sess.cls ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: sess.cls.color, flexShrink: 0,
                                boxShadow: `0 0 0 3px ${sess.cls.color}25`,
                              }} />
                              <span style={{ fontWeight: 700, fontSize: 14, color: s.text }}>{sess.cls.name}</span>
                            </div>
                          ) : <span style={{ color: s.muted }}>—</span>}
                        </td>

                        {/* TIME */}
                        <td style={{ padding: '12px 18px', borderTop: rowBorder }}>
                          {sess.cls ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: 13, fontWeight: 700,
                              color: sess.cls.color,
                              background: `${sess.cls.color}14`,
                              border: `1px solid ${sess.cls.color}35`,
                              borderRadius: 7, padding: '4px 12px',
                            }}>
                              <Clock size={11} />
                              {fmtTime(sess.time)}
                            </span>
                          ) : <span style={{ color: s.muted, fontSize: 13 }}>{fmtTime(sess.time)}</span>}
                        </td>

                        {/* COUNT — rowspan, only first row */}
                        {isFirstRow && (
                          <td rowSpan={group.sessions.length} style={{
                            padding: '0 18px', textAlign: 'center', verticalAlign: 'middle',
                            borderTop: gi > 0 ? `2px solid ${s.border}` : 'none',
                            borderLeft: `1px solid ${s.border}`,
                          }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: s.text }}>
                              {group.sessions.length}
                            </span>
                          </td>
                        )}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 64, textAlign: 'center', color: s.muted }}>
              <AlertCircle size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ fontSize: 13 }}>Chưa có dữ liệu tháng này</p>
            </div>
          )}
        </div>

        <div style={{ background: s.surface, border: `1.5px solid ${s.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: s.text, marginBottom: 20 }}>💰 Chi tiết lương</div>
          <MoneyInput label="Lương cứng 1 ca" value={perSession}
            onChange={v => setSalaryExtra(p => ({ ...p, perSession: v }))}
            step={10000}
            hint={`${totalSess} ca × ${fmt(perSession)} đ = ${fmt(totalSalary)} đ`}
            theme={s} />
          <div style={{ height: 1, background: s.border, margin: '20px 0' }} />
          <div style={{ display: 'grid', gap: 16 }}>
            {EXTRA_FIELDS.map(({ key, label, step }) => (
              <MoneyInput key={key} label={label} value={salaryExtra[key] || 0}
                onChange={v => setSalaryExtra(p => ({ ...p, [key]: v }))} step={step} theme={s} />
            ))}
          </div>
          <div style={{ height: 1, background: s.accent, opacity: 0.3, margin: '20px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: s.text }}>💵 Thực lĩnh</span>
            <span style={{ fontWeight: 800, fontSize: 24, color: s.green }}>{fmt(totalNet)} đ</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CopyWeekModal ────────────────────────────────────────────────────────────
// Lets user pick which weeks from prev month to copy, aligned by weekday
function CopyWeekModal({ year, month, prevSchedule, onCopy, onClose, S: s }) {
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  const prevWeeks = getMonthWeeks(py, pm)
  const currWeeks = getMonthWeeks(year, month)

  // Default: select all weeks that have sessions in prev month
  const [selected, setSelected] = useState(() =>
    prevWeeks.map((days, _wi) => days.some(d => prevSchedule[dk(py, pm, d)]?.length > 0))
  )

  const toggle = i => setSelected(p => p.map((v, j) => j === i ? !v : v))
  const toggleAll = () => {
    const anyOn = selected.some(Boolean)
    setSelected(p => p.map(() => !anyOn))
  }

  const weekLabel = (days, y2, m2) => {
    const first = days[0], last = days[days.length - 1]
    const dn1 = WEEKDAYS[new Date(y2, m2 - 1, first).getDay()]
    const dn2 = WEEKDAYS[new Date(y2, m2 - 1, last).getDay()]
    return `${dn1} ${first}/${m2} – ${dn2} ${last}/${m2}`
  }

  const sessionCount = (days, y2, m2, sched) =>
    days.reduce((n, d) => n + (sched[dk(y2, m2, d)]?.length || 0), 0)

  const handleCopy = () => {
    // For each selected week index, map weekdays from prev → curr
    const mappings = [] // { srcKey, tgtKey }
    selected.forEach((on, wi) => {
      if (!on) return
      const srcDays = prevWeeks[wi] || []
      const tgtDays = currWeeks[wi] || []
      srcDays.forEach(srcDay => {
        const wd = new Date(py, pm - 1, srcDay).getDay()
        const tgtDay = tgtDays.find(d => new Date(year, month - 1, d).getDay() === wd)
        if (tgtDay) mappings.push({ srcKey: dk(py, pm, srcDay), tgtKey: dk(year, month, tgtDay) })
      })
    })
    onCopy(mappings, prevSchedule)
    onClose()
  }

  const anySelected = selected.some(Boolean)

  return (
    <Modal title={`Copy lịch từ ${MONTH_NAMES[pm]} → ${MONTH_NAMES[month]}`} onClose={onClose} S={s} width={440}>
      <p style={{ fontSize: 12, color: s.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Lịch được copy theo đúng <strong style={{ color: s.text }}>thứ trong tuần</strong> — T2 sang T2, T3 sang T3, v.v.
        Chọn tuần từ tháng trước cần copy:
      </p>

      {/* Select all toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={toggleAll} style={{
          background: 'none', border: 'none', color: s.accent, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, padding: '3px 0', fontFamily: 'inherit',
        }}>
          {selected.some(Boolean) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </button>
      </div>

      {/* Week list */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        {prevWeeks.map((srcDays, wi) => {
          const tgtDays = currWeeks[wi] || []
          const srcCount = sessionCount(srcDays, py, pm, prevSchedule)
          const isOn = selected[wi]

          return (
            <div key={wi} onClick={() => toggle(wi)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
              background: isOn ? `${s.accent}14` : s.s2,
              border: `1.5px solid ${isOn ? s.accent : s.border}`,
              opacity: srcCount === 0 ? 0.45 : 1,
            }}>
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                background: isOn ? s.accent : 'transparent',
                border: `2px solid ${isOn ? s.accent : s.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}>
                {isOn && <Check size={11} color={s.bg} strokeWidth={3} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: s.text, marginBottom: 3 }}>
                  Tuần {wi + 1}
                </div>
                <div style={{ fontSize: 11, color: s.muted }}>
                  <span style={{ color: s.accent }}>{MONTH_NAMES[pm]}:</span> {weekLabel(srcDays, py, pm)}
                </div>
                {tgtDays.length > 0 && (
                  <div style={{ fontSize: 11, color: s.muted }}>
                    <span style={{ color: s.green }}>→ {MONTH_NAMES[month]}:</span> {weekLabel(tgtDays, year, month)}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {srcCount > 0
                  ? <span style={{ fontSize: 12, fontWeight: 800, color: isOn ? s.accent : s.muted }}>{srcCount} ca</span>
                  : <span style={{ fontSize: 11, color: s.muted, fontStyle: 'italic' }}>trống</span>
                }
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn S={s} variant="ghost" style={{ flex: 1 }} onClick={onClose}>Huỷ</Btn>
        <Btn S={s} variant="primary" style={{ flex: 1 }} disabled={!anySelected} onClick={handleCopy}>
          <Copy size={13} />Copy {selected.filter(Boolean).length} tuần
        </Btn>
      </div>
    </Modal>
  )
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────
function CalendarTab({ year, month, setYear, setMonth, sched, setSched, classes, allSchedules, salaryExtra, S: s }) {
  // dragging: { classId, time } | null
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [modal, setModal] = useState(null)
  const [showSalary, setShowSalary] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const { toasts, addToast, removeToast } = useToasts()
  const today = new Date()

  const perSession = salaryExtra.perSession ?? 250000
  const totalSess = Object.values(sched).reduce((sum, ss) => sum + ss.length, 0)
  const totalNet = totalSess * perSession + (salaryExtra.travel || 0) + (salaryExtra.kpi || 0) + (salaryExtra.holiday || 0)

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  // Add session to a day — with overlap + dupe checks, shows toast on conflict
  const tryAddSession = useCallback((dayKey, classId, time) => {
    const curr = sched[dayKey] || []
    if (curr.some(x => x.classId === classId && x.time === time)) {
      addToast('Ca này đã có trong ngày!'); return false
    }
    const conflict = curr.find(x => timesOverlap(x.time, time))
    if (conflict) {
      const cname = classes.find(c => c.id === conflict.classId)?.name || '?'
      addToast(`⚡ Trùng giờ với lớp "${cname}" (${fmtTime(conflict.time)})`)
      return false
    }
    setSched(p => ({ ...p, [dayKey]: [...(p[dayKey] || []), { id: uid(), classId, time }] }))
    return true
  }, [sched, classes, setSched, addToast])

  const removeSession = (dayKey, sid) => {
    setSched(p => {
      const updated = (p[dayKey] || []).filter(s => s.id !== sid)
      if (!updated.length) { const n = { ...p }; delete n[dayKey]; return n }
      return { ...p, [dayKey]: updated }
    })
  }
  const updateTime = (dayKey, sid, time) => {
    setSched(p => ({ ...p, [dayKey]: (p[dayKey] || []).map(s => s.id === sid ? { ...s, time } : s) }))
  }

  // Weekday-aligned copy: called from CopyWeekModal with pre-computed mappings
  const applyWeekCopy = useCallback((mappings, prevSchedule) => {
    setSched(p => {
      const n = { ...p }
      mappings.forEach(({ srcKey, tgtKey }) => {
        const sessions = prevSchedule[srcKey]
        if (sessions?.length > 0 && !(n[tgtKey]?.length > 0)) {
          n[tgtKey] = sessions.map(s => ({ ...s, id: uid() }))
        }
      })
      return n
    })
  }, [setSched])
  const copyPrevWeek = targetDay => {
    const dow = new Date(year, month - 1, targetDay).getDay(), ws = targetDay - dow, ps = ws - 7, dc = dim(year, month)
    setSched(p => {
      const n = { ...p }
      for (let i = 0; i < 7; i++) {
        const src = ps + i, tgt = ws + i
        if (src >= 1 && tgt >= 1 && tgt <= dc) {
          const sdkk = src >= 1 && src <= dc ? dk(year, month, src) : null, tdkk = dk(year, month, tgt)
          if (sdkk && p[sdkk]?.length > 0 && !(n[tdkk]?.length > 0)) n[tdkk] = p[sdkk].map(s => ({ ...s, id: uid() }))
        }
      }
      return n
    })
  }

  const daysCount = dim(year, month), firstDay = fdo(year, month)
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysCount }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  // All draggable items: one per class×time
  const dragItems = classes.flatMap(cls => cls.times.map(time => ({ cls, time })))

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 57px)', overflow: 'hidden' }}>

      {/* ── Toasts ──────────────────────────────────────────────────────────── */}
      <ToastContainer toasts={toasts} onRemove={removeToast} S={s} />

      {/* ── Left panel — drag items per class×time ───────────────────────── */}
      <aside style={{
        width: 220, background: s.surface, borderRight: `1.5px solid ${s.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ padding: '14px 12px 0', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
            Kéo vào lịch ↓
          </div>

          {dragItems.map(({ cls, time }) => {
            const isActive = dragging?.classId === cls.id && dragging?.time === time
            return (
              <div key={`${cls.id}-${time}`} className="drag-item"
                draggable
                onDragStart={() => setDragging({ classId: cls.id, time })}
                onDragEnd={() => setDragging(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                  borderRadius: 9, marginBottom: 5, cursor: 'grab', userSelect: 'none',
                  background: isActive ? `${cls.color}30` : `${cls.color}10`,
                  border: `1.5px solid ${cls.color}${isActive ? '60' : '22'}`,
                  borderLeft: `3px solid ${cls.color}`,
                  boxShadow: isActive ? `0 3px 14px ${cls.color}30` : 'none',
                  transform: isActive ? 'scale(1.02)' : 'none',
                  transition: 'all 0.12s',
                }}>
                <GripVertical size={12} color={cls.color} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: cls.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cls.name}
                  </div>
                  <div style={{ fontSize: 10, color: s.muted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    <Clock size={8} />{fmtTime(time)}
                  </div>
                </div>
              </div>
            )
          })}

          {dragItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 8px', color: s.muted, fontSize: 12 }}>
              Chưa có lớp nào.<br />Thêm lớp ở tab Lớp học.
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ padding: '12px', borderTop: `1px solid ${s.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Nhanh</div>
          <button onClick={() => setShowCopyModal(true)} style={{
            width: '100%', marginBottom: 7, padding: '8px 10px', borderRadius: 9,
            background: 'transparent', border: `1.5px solid ${s.border}`, color: s.muted,
            cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit', transition: 'all 0.12s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = s.accent; e.currentTarget.style.color = s.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.muted }}>
            <Copy size={12} />Copy tháng trước…
          </button>
        </div>

        {/* Mini summary */}
        <div style={{ padding: '0 12px 14px' }}>
          <div style={{ background: s.s2, borderRadius: 10, padding: '12px 14px', border: `1.5px solid ${s.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: s.muted, fontWeight: 600 }}>Tổng ca</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: s.accent }}>{totalSess}</span>
            </div>
            <div style={{ height: 1, background: s.border, marginBottom: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: s.muted, fontWeight: 600 }}>Thực lĩnh</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: s.green, letterSpacing: showSalary ? 0 : 1 }}>
                  {showSalary ? `${fmt(totalNet)} đ` : '••••••'}
                </span>
                <button onClick={() => setShowSalary(v => !v)} title={showSalary ? 'Ẩn số tiền' : 'Hiện số tiền'}
                  style={{ background: 'none', border: 'none', color: s.muted, cursor: 'pointer', padding: 2, display: 'flex' }}>
                  {showSalary ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Calendar grid ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          borderBottom: `1.5px solid ${s.border}`, background: s.surface, flexShrink: 0,
        }}>
          <Btn S={s} variant="ghost" style={{ padding: '5px 9px' }} onClick={prevMonth}><ChevronLeft size={15} /></Btn>
          <span style={{ fontWeight: 800, fontSize: 19, minWidth: 170, textAlign: 'center', color: s.text }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <Btn S={s} variant="ghost" style={{ padding: '5px 9px' }} onClick={nextMonth}><ChevronRight size={15} /></Btn>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: s.muted }}>
            💡 Kéo từ sidebar vào ngày, hoặc click để chọn giờ
          </span>
        </div>

        <div style={{ flex: 1, padding: '12px 16px', overflow: 'auto', background: s.bg }}>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontWeight: 900, fontSize: 11,
                color: i === 0 ? s.red : s.muted, padding: '4px 0',
                textTransform: 'uppercase', letterSpacing: 0.8,
              }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} style={{ minHeight: 96 }} />
              const dKey = dk(year, month, day)
              const sessions = sched[dKey] || []
              const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()
              const isSun = new Date(year, month - 1, day).getDay() === 0
              const isOver = dragOver === dKey
              const hasSess = sessions.length > 0

              return (
                <div key={dKey} className="day-cell"
                  onClick={() => setModal({ dayKey: dKey, day })}
                  onDragOver={e => { e.preventDefault(); setDragOver(dKey) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault(); setDragOver(null)
                    if (dragging) {
                      tryAddSession(dKey, dragging.classId, dragging.time)
                      setDragging(null)
                    }
                  }}
                  style={{
                    minHeight: 96, padding: '7px 6px 5px', borderRadius: 9, cursor: 'pointer',
                    background: isOver ? s.accentBg : hasSess ? s.surface : s.bg,
                    border: `1.5px solid ${isOver ? s.accent : hasSess ? s.border : s.border2}`,
                    transition: 'all 0.12s', position: 'relative',
                    boxShadow: hasSess ? `0 1px 4px rgba(0,0,0,0.06)` : 'none',
                  }}>
                  {/* Day number */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontWeight: isToday ? 900 : 700, fontSize: 13,
                      color: isToday ? s.bg : isSun ? s.red : hasSess ? s.text : s.muted,
                      background: isToday ? s.accent : 'transparent',
                      borderRadius: isToday ? '50%' : '0',
                      width: isToday ? 22 : 'auto', height: isToday ? 22 : 'auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{day}</span>
                    {sessions.length > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: s.accent, color: s.bg, borderRadius: 8, padding: '1px 5px' }}>
                        {sessions.length}
                      </span>
                    )}
                  </div>

                  {/* Session pills — show name + time */}
                  {sessions.slice(0, 3).map(sess => {
                    const cls = classes.find(c => c.id === sess.classId)
                    return (
                      <div key={sess.id} className="session-pill"
                        onClick={e => { e.stopPropagation(); removeSession(dKey, sess.id) }}
                        title={`${cls?.name || '?'} – ${fmtTime(sess.time)} | Click để xoá`}
                        style={{
                          background: `${cls?.color || '#888'}20`,
                          color: cls?.color || '#888',
                          border: `1px solid ${cls?.color || '#888'}40`,
                          borderRadius: 5, padding: '2px 5px 3px',
                          marginBottom: 2, cursor: 'pointer', overflow: 'hidden',
                        }}>
                        <div style={{ fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cls?.name || '?'}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.9, whiteSpace: 'nowrap' }}>
                          {fmtTime(sess.time)}
                        </div>
                      </div>
                    )
                  })}
                  {sessions.length > 3 && (
                    <div style={{ fontSize: 10, color: s.muted, fontWeight: 600 }}>+{sessions.length - 3} nữa</div>
                  )}

                  {/* Drop hint */}
                  {isOver && (
                    <div style={{
                      position: 'absolute', inset: 0, border: `2px dashed ${s.accent}`,
                      borderRadius: 9, pointerEvents: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${s.accent}08`,
                    }}>
                      <Plus size={20} color={s.accent} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {modal && (
        <DayModal
          year={year} month={month} day={modal.day} dayKey={modal.dayKey}
          sessions={sched[modal.dayKey] || []}
          classes={classes}
          onAdd={(classId, time) => tryAddSession(modal.dayKey, classId, time)}
          onRemove={sid => removeSession(modal.dayKey, sid)}
          onTimeChange={(sid, time) => updateTime(modal.dayKey, sid, time)}
          onCopyPrevWeek={() => copyPrevWeek(modal.day)}
          onClose={() => setModal(null)}
          S={s}
        />
      )}

      {showCopyModal && (() => {
        const pm = month === 1 ? 12 : month - 1
        const py = month === 1 ? year - 1 : year
        const prevSched = allSchedules[mk(py, pm)] || {}
        return (
          <CopyWeekModal
            year={year} month={month}
            prevSchedule={prevSched}
            onCopy={applyWeekCopy}
            onClose={() => setShowCopyModal(false)}
            S={s}
          />
        )
      })()}
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const DEFAULT_SALARY = { perSession: 250000, travel: 0, kpi: 0, holiday: 0 }

export default function App() {
  const today = new Date()
  const [tab, setTab] = useState('calendar')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [dark, setDark] = useState(() => load('tc_dark', true))
  const [classes, setClasses] = useState(() => load('tc_classes', DEFAULT_CLASSES).map(migrateClass))
  const [allSchedules, setAllSch] = useState(() => migrateSchedules(load('tc_schedules', {})))

  // Per-month salary extras — keyed by "YYYY-MM"
  // Migration: if old global tc_salary exists, seed it as the default template
  const [allSalaryExtras, setAllSalaryExtras] = useState(() => {
    const stored = load('tc_salary_extras', null)
    if (stored) return stored
    // First run: try to migrate the old global value
    const legacy = load('tc_salary', null)
    return legacy ? { _default: legacy } : {}
  })

  const s = dark ? T.dark : T.light

  const monthKey = mk(year, month)
  const sched = allSchedules[monthKey] || {}
  const setSched = useCallback(updater => {
    setAllSch(prev => {
      const curr = prev[monthKey] || {}
      return { ...prev, [monthKey]: typeof updater === 'function' ? updater(curr) : updater }
    })
  }, [monthKey])

  // Current month's salary extras — falls back to _default (migrated) or DEFAULT_SALARY
  const salaryExtra = allSalaryExtras[monthKey]
    ?? allSalaryExtras['_default']
    ?? DEFAULT_SALARY

  const setSalaryExtra = useCallback(updater => {
    setAllSalaryExtras(prev => {
      const curr = prev[monthKey] ?? prev['_default'] ?? DEFAULT_SALARY
      return { ...prev, [monthKey]: typeof updater === 'function' ? updater(curr) : updater }
    })
  }, [monthKey])

  useEffect(() => save('tc_classes', classes), [classes])
  useEffect(() => save('tc_schedules', allSchedules), [allSchedules])
  useEffect(() => save('tc_salary_extras', allSalaryExtras), [allSalaryExtras])
  useEffect(() => save('tc_dark', dark), [dark])

  const TABS = [
    { id: 'calendar', label: 'Lịch dạy', Icon: Calendar },
    { id: 'salary', label: 'Bảng lương', Icon: DollarSign },
    { id: 'classes', label: 'Lớp học', Icon: Settings },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: s.bg, color: s.text }}>
      <style>{globalCSS(s)}</style>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 22px', height: 56, flexShrink: 0,
        background: s.surface, borderBottom: `1.5px solid ${s.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 28 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg,#38BDF8 0%,#818CF8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(56,189,248,0.35)',
          }}>
            <BookOpen size={15} color="#fff" />
          </div>
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: -0.3, color: s.text }}>TutorSchedule</span>
        </div>

        <nav style={{ display: 'flex', gap: 2 }}>
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className="tab-btn" onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              background: tab === id ? `${s.accent}18` : 'transparent',
              color: tab === id ? s.accent : s.muted,
            }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: s.muted, fontWeight: 600 }}>{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => setDark(d => !d)} title={dark ? 'Chuyển Light mode' : 'Chuyển Dark mode'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 9, border: `1.5px solid ${s.border}`,
              background: s.s2, color: s.text, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
            {dark ? <Sun size={14} color={s.yellow} /> : <Moon size={14} color={s.accent} />}
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'calendar' && (
          <CalendarTab
            year={year} month={month} setYear={setYear} setMonth={setMonth}
            sched={sched} setSched={setSched} classes={classes}
            allSchedules={allSchedules} salaryExtra={salaryExtra} S={s}
          />
        )}
        {tab === 'salary' && (
          <div style={{ height: '100%', overflowY: 'auto', background: s.bg }}>
            <SalaryTab
              year={year} month={month} setYear={setYear} setMonth={setMonth}
              sched={sched} classes={classes}
              salaryExtra={salaryExtra} setSalaryExtra={setSalaryExtra} S={s}
            />
          </div>
        )}
        {tab === 'classes' && (
          <div style={{ height: '100%', overflowY: 'auto', background: s.bg }}>
            <ClassManager classes={classes} setClasses={setClasses} S={s} />
          </div>
        )}
      </div>
    </div>
  )
}