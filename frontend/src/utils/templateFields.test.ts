import { describe, it, expect } from 'vitest'
import {
  completeVariable,
  findOpenVariable,
  flattenGroups,
  groupByCategory,
  previewTemplate,
  searchFields,
} from './templateFields'

describe('searchFields', () => {
  it('returns every field for an empty query', () => {
    expect(searchFields('').length).toBeGreaterThan(5)
  })

  it('matches key, label and aliases, prefix matches first', () => {
    expect(searchFields('years').map((f) => f.key)).toEqual(['yearsAtCompany'])
    expect(searchFields('linked').map((f) => f.key)).toEqual(['linkedinUrl'])
    expect(searchFields('company').map((f) => f.key)).toEqual(['companyName', 'yearsAtCompany'])
    expect(searchFields('zzz')).toEqual([])
  })
})

describe('groupByCategory', () => {
  it('groups in category order and drops empty groups', () => {
    const groups = groupByCategory(searchFields('name'))
    expect(groups.map((g) => g.category)).toEqual(['Personal', 'Work'])
    expect(flattenGroups(groups).map((f) => f.key)).toEqual(['firstName', 'lastName', 'companyName'])
  })
})

describe('previewTemplate', () => {
  const lead = { firstName: 'Ann', companyName: 'Acme', yearsAtCompany: 0, jobTitle: null }

  it('fills values, including 0', () => {
    expect(previewTemplate('Hi {firstName} ({yearsAtCompany}y)', lead)).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'value', text: 'Ann' },
      { kind: 'text', text: ' (' },
      { kind: 'value', text: '0' },
      { kind: 'text', text: 'y)' },
    ])
  })

  it('flags missing and unknown variables', () => {
    expect(previewTemplate('{jobTitle}{nope}', lead)).toEqual([
      { kind: 'missing', text: '{jobTitle}' },
      { kind: 'unknown', text: '{nope}' },
    ])
  })
})

describe('autocomplete helpers', () => {
  it('detects an unfinished variable before the caret', () => {
    expect(findOpenVariable('Hi {fir', 7)).toEqual({ start: 3, query: 'fir' })
    expect(findOpenVariable('Hi {', 4)).toEqual({ start: 3, query: '' })
    expect(findOpenVariable('Hi {firstName} there', 20)).toBeNull()
    expect(findOpenVariable('Hi {a b', 7)).toBeNull()
    expect(findOpenVariable('no braces', 5)).toBeNull()
  })

  it('completes the variable and swallows an existing closing brace', () => {
    expect(completeVariable('Hi {fi there', 6, 3, 'firstName')).toEqual({
      template: 'Hi {firstName} there',
      caret: 14,
    })
    expect(completeVariable('Hi {fi} there', 6, 3, 'firstName').template).toBe('Hi {firstName} there')
  })
})
