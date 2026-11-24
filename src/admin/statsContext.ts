import { createContext, useContext } from 'react'
import type { Stats } from './adminApi.ts'

export interface StatsState {
  stats: Stats | null
  error: string
  /** Tải lại số liệu (sau khi đổi trạng thái, xoá đơn) */
  refresh: () => void
}

// AdminApp tải /api/stats một lần cho menu, Tổng quan và tab Đơn hàng. Không có provider: trả null.
export const StatsContext = createContext<StatsState | null>(null)

export const useStats = () => useContext(StatsContext)
