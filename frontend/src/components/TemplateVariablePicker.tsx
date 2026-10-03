import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { LeadFieldDef } from '../utils/leadFields'
import { flattenGroups, formatFieldValue, groupByCategory, searchFields } from '../utils/templateFields'

interface FieldOptionsProps {
  fields: LeadFieldDef[]
  activeKey?: string
  sample?: Record<string, unknown>
  onSelect: (field: LeadFieldDef) => void
  onHover: (field: LeadFieldDef) => void
  listId: string
}

const FieldOptions: FC<FieldOptionsProps> = ({ fields, activeKey, sample, onSelect, onHover, listId }) => {
  const groups = groupByCategory(fields)
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey])

  if (groups.length === 0) {
    return <div className="px-3 py-4 text-sm text-gray-500 text-center">No matching fields</div>
  }

  return (
    <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
      {groups.map((group) => (
        <li key={group.category} role="presentation">
          <div className="px-3 pt-2 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
            {group.category}
          </div>
          <ul role="group" aria-label={group.category}>
            {group.fields.map((field) => {
              const isActive = field.key === activeKey
              const value = sample ? formatFieldValue(sample, field.key) : null
              return (
                <li
                  key={field.key}
                  ref={isActive ? activeRef : undefined}
                  id={`${listId}-${field.key}`}
                  role="option"
                  aria-selected={isActive}
                  // mousedown (not click) so the textarea/search input keeps focus
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(field)
                  }}
                  onMouseEnter={() => onHover(field)}
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 cursor-pointer ${
                    isActive ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">{`{${field.key}}`}</span>
                    <span className="text-sm text-gray-600 truncate">{field.label}</span>
                  </span>
                  {sample && (
                    <span
                      className={`text-xs max-w-[40%] truncate ${value === null ? 'text-gray-400 italic' : 'text-gray-500'}`}
                      title={value ?? 'No value for the preview lead'}
                    >
                      {value ?? 'empty'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

// Keeps the highlighted option inside the visible list while it changes
const useActiveField = (fields: LeadFieldDef[]) => {
  const ordered = useMemo(() => flattenGroups(groupByCategory(fields)), [fields])
  const [activeKey, setActiveKey] = useState<string | undefined>()
  const active = ordered.find((f) => f.key === activeKey) ?? ordered[0]

  const move = (delta: number) => {
    if (ordered.length === 0) return
    const index = Math.max(
      0,
      ordered.findIndex((f) => f.key === active?.key)
    )
    setActiveKey(ordered[(index + delta + ordered.length) % ordered.length].key)
  }

  return { active, setActiveKey, move }
}

interface VariablePickerProps {
  fields: LeadFieldDef[]
  sample?: Record<string, unknown>
  onSelect: (field: LeadFieldDef) => void
}

// "Insert field" dropdown: search + fields grouped by category
export const VariablePicker: FC<VariablePickerProps> = ({ fields, sample, onSelect }) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => searchFields(query, fields), [query, fields])
  const { active, setActiveKey, move } = useActiveField(matches)

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const select = (field: LeadFieldDef) => {
    close()
    onSelect(field)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      // Never submit the form from the search box
      e.preventDefault()
      if (active) select(active)
    } else if (e.key === 'Escape') {
      // Close only the dropdown, not the whole modal
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
      >
        Insert field
        <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-96 max-w-[calc(100vw-4rem)] bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search fields..."
              role="combobox"
              aria-expanded="true"
              aria-controls="variable-picker-list"
              aria-activedescendant={active ? `variable-picker-list-${active.key}` : undefined}
              aria-label="Search fields"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <FieldOptions
            fields={matches}
            activeKey={active?.key}
            sample={sample}
            onSelect={select}
            onHover={(f) => setActiveKey(f.key)}
            listId="variable-picker-list"
          />
        </div>
      )}
    </div>
  )
}

interface VariableSuggestionsProps {
  fields: LeadFieldDef[]
  sample?: Record<string, unknown>
  activeKey?: string
  onSelect: (field: LeadFieldDef) => void
  onHover: (field: LeadFieldDef) => void
}

// Autocomplete list shown under the textarea while typing "{par..."; keyboard handling lives in the
// textarea (it keeps focus), see useActiveField consumers
export const VariableSuggestions: FC<VariableSuggestionsProps> = ({
  fields,
  sample,
  activeKey,
  onSelect,
  onHover,
}) => (
  <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
    <FieldOptions
      fields={fields}
      activeKey={activeKey}
      sample={sample}
      onSelect={onSelect}
      onHover={onHover}
      listId="variable-suggestions-list"
    />
  </div>
)

export { useActiveField }
