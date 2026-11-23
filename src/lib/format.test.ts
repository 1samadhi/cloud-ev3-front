import { describe, expect, it } from 'vitest'
import { clp, fechaHora, num, pct } from './format'

describe('clp', () => {
  it('formatea pesos chilenos con separador de miles', () => {
    expect(clp(15000)).toBe('$15.000')
    expect(clp(189990)).toBe('$189.990')
  })

  it('redondea: Transbank puede devolver el monto como decimal', () => {
    expect(clp(15000.4)).toBe('$15.000')
    expect(clp(15000.6)).toBe('$15.001')
  })

  it('muestra un guion cuando el backend no manda el campo', () => {
    expect(clp(null)).toBe('—')
    expect(clp(undefined)).toBe('—')
  })

  it('no confunde cero con ausencia', () => {
    expect(clp(0)).toBe('$0')
  })
})

describe('fechaHora', () => {
  /* Las fechas de Spring llegan sin zona ("2026-11-18T14:03:22"). Si se
     construyera un Date, el navegador las leería como UTC y las correría 3
     horas, así que se formatean como texto. Este test es el que impide que
     alguien "mejore" la función usando Date. */
  it('no desplaza la hora que mandó el backend', () => {
    expect(fechaHora('2026-11-18T14:03:22')).toBe('2026-11-18 14:03:22')
  })

  it('recorta los milisegundos', () => {
    expect(fechaHora('2026-11-18T14:03:22.123456')).toBe('2026-11-18 14:03:22')
  })

  it('tolera la ausencia del campo', () => {
    expect(fechaHora(null)).toBe('—')
    expect(fechaHora('')).toBe('—')
  })
})

describe('num', () => {
  it('agrupa miles', () => {
    expect(num(1200)).toBe('1.200')
  })

  it('distingue cero de ausencia', () => {
    expect(num(0)).toBe('0')
    expect(num(null)).toBe('—')
  })
})

describe('pct', () => {
  it('calcula el porcentaje redondeado', () => {
    expect(pct(1, 4)).toBe(25)
    expect(pct(1, 3)).toBe(33)
  })

  it('no divide por cero', () => {
    expect(pct(5, 0)).toBe(0)
  })
})
